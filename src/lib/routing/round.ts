/**
 * Rundtouren: „Einfach eine schöne Runde drehen“ (F2, F4 Rundtour).
 *
 * Gleiche Bausteine wie bei Zieltouren (Profil genuss, Nachbewertung, Prüfung auf Stummel/Kreis/Zipfel,
 * keine fast gleichen Vorschläge, Titel aus Orts- und Gewässernamen):
 * 1. In ROUND.directions Richtungen je eine Runde: drei Hilfspunkte auf einem Kreis durch den Start, jeder an die
 *    schönste Stelle seiner Umgebung geschoben (Wasser, Wald, Grün aus der Landschaftskarte).
 * 2. Länge nachregeln: Kreis größer/kleiner, bis die Runde höchstens ROUND.tolerance (10 %) von der gewünschten
 *    Länge abweicht (Wunsch Jan, 06.10.2026) – sonst fällt die Runde weg.
 * 3. Bewerten (Schönheit, Abzug für denselben Weg hin und zurück), die schönsten, deutlich verschiedenen
 *    ROUND.suggestions (5) zeigen. Die Richtungen beginnen bei einem zufälligen Winkel (`seed`) – so gibt es
 *    bei jeder neuen Suche andere Runden.
 */
import { bearing, distance, offset, segmentLengths, type LngLat } from '$lib/geo/geo';
import { distinctPlaces, highlightOf, landmarkPhrase, landmarkTitle, routeNames, viaPlaces, type RouteNames } from '$lib/naming/title';
import { findBacktrack, findLoop, findSpur, separatedFrom } from '$lib/scoring/backtrack';
import { overlapShare } from '$lib/scoring/overlap';
import { WATER } from '$lib/scoring/landscape';
import { analyzeRoute, beautyScore, lineOf, type RouteStats } from '$lib/scoring/score';
import { BEAUTY_CLASS_WEIGHTS, ROUND, SCORE, TITLE_MIN_SHARE_OF_TOP, VIA_SEARCH } from '$lib/scoring/weights';
import { rideMinutes } from '$lib/tour/duration';
import { elevationProfile } from '$lib/tour/elevation';
import { newTourId, type PlannedTour, type TourRequest, type Waypoint } from '$lib/tour/model';
import { highlightSentence, honestTitles } from './describe';
import { NoRouteError, type RoutePath } from './graphhopper';
import type { PlanDeps } from './plan';

/** Zufallszahlen mit festem Startwert (gleiche Suche → gleiche Runden, neue Suche → neue) */
function random(seed: number) {
	let s = seed >>> 0 || 1;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

const DIRECTION_WORDS = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'];
const directionWord = (degrees: number) => DIRECTION_WORDS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];

/**
 * Hilfspunkt an die schönste Stelle in der Umgebung schieben (Fenster ± `reach` Meter, Raster aus der
 * Landschaftskarte). Ohne Landschaftskarte bleibt er, wo er ist.
 */
function scenicNear(point: LngLat, reach: number, deps: PlanDeps): LngLat {
	const landscape = deps.landscape;
	if (!landscape) return point;
	const row = landscape.rowOf(point[1]);
	const col = landscape.colOf(point[0]);
	const cellM = landscape.meta.cellLat * 110_540;
	const r = Math.max(1, Math.round(reach / cellM));
	const step = Math.max(1, Math.round(r / 6));
	let best = point;
	let bestBeauty = -1;
	for (let dr = -r; dr <= r; dr += step) {
		for (let dc = -r; dc <= r; dc += step) {
			// auf festem Boden, nicht mitten im See
			if (landscape.cell(row + dr, col + dc) === WATER) continue;
			const beauty = landscape.beautyAround(row + dr, col + dc, VIA_SEARCH.windowRadiusCells, BEAUTY_CLASS_WEIGHTS);
			// leicht die Mitte bevorzugen, damit die Runde ihre Form behält
			const score = beauty - 0.05 * Math.hypot(dr, dc) / r;
			if (score > bestBeauty) {
				bestBeauty = score;
				best = landscape.cellCenter(row + dr, col + dc);
			}
		}
	}
	return best;
}

/** Drei Hilfspunkte auf einem Kreis durch den Start, Mittelpunkt in Richtung `heading` */
function loopVias(start: LngLat, heading: number, radius: number, deps: PlanDeps): LngLat[] {
	const center = offset(start, heading, radius);
	return [heading - 90, heading, heading + 90].map((angle) =>
		scenicNear(offset(center, angle, radius), radius * ROUND.scenicReach, deps)
	);
}

/**
 * Stummel, Kreis oder Zipfel an einem Hilfspunkt? Geprüft wird jedes Stück rund um einen Hilfspunkt für sich
 * (von der Mitte zum vorigen bis zur Mitte zum nächsten). Dass Hin- und Rückfahrt sich am Start eine Zufahrt
 * teilen und sich die Runde dort schließt, ist normal – das misst selfOverlap.
 */
export function roundShapeProblem(path: RoutePath, vias: LngLat[]): { via: number; at?: LngLat } | undefined {
	const line = lineOf(path);
	const bridges = separatedFrom(path.details.road_environment);
	// wo die Runde an den Hilfspunkten vorbeikommt (nächster Punkt, in Fahrtrichtung fortlaufend)
	const at: number[] = [];
	let from = 0;
	for (const via of vias) {
		let best = from;
		for (let i = from; i < line.length; i++) if (distance(line[i], via) < distance(line[best], via)) best = i;
		at.push(best);
		from = best;
	}
	const bounds = [0, ...at.slice(0, -1).map((a, k) => Math.round((a + at[k + 1]) / 2)), line.length - 1];
	for (let k = 0; k + 1 < bounds.length; k++) {
		const [a, b] = [bounds[k], bounds[k + 1]];
		if (b - a < 2) continue;
		const piece = line.slice(a, b + 1);
		const separated = (segment: number) => bridges(segment + a);
		const via = Math.min(k, vias.length - 1);
		const backtrack = findBacktrack(piece, separated);
		if (backtrack.meters > VIA_SEARCH.maxBacktrackM) return { via, at: backtrack.start };
		const loop = findLoop(piece, separated);
		if (loop) return { via, at: loop.at };
		const spur = findSpur(piece, separated);
		if (spur) return { via, at: spur.at };
	}
	return undefined;
}

/** Anteil der zweiten Hälfte, der auf der ersten liegt (dieselben Wege hin und zurück) */
function selfOverlap(line: LngLat[]): number {
	const lengths = segmentLengths(line);
	const total = lengths.reduce((s, d) => s + d, 0);
	let along = 0;
	let mid = 0;
	while (mid < lengths.length && along < total / 2) along += lengths[mid++];
	return overlapShare(line.slice(mid), line.slice(0, mid + 1));
}

interface RoundCandidate {
	path: RoutePath;
	line: LngLat[];
	vias: LngLat[];
	heading: number;
	stats: RouteStats;
	beauty: number;
	overlap: number;
	score: number;
}

/** Gleich, wenn jede der beiden Runden größtenteils auf der anderen verläuft (wie bei Zieltouren) */
function tooSimilar(a: RoundCandidate, b: RoundCandidate): boolean {
	return Math.min(overlapShare(a.line, b.line), overlapShare(b.line, a.line)) > ROUND.maxSimilarity;
}

/** Anfragen gleichzeitig, aber nicht alle auf einmal (GraphHopper schonen) */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				results[i] = await fn(items[i]);
			}
		})
	);
	return results;
}

/** Hauptfunktion: bis zu ROUND.suggestions schöne Runden ab dem Start mit der gewünschten Länge */
export async function planRound(request: TourRequest, deps: PlanDeps): Promise<PlannedTour[]> {
	const round = request.round;
	if (!round) throw new Error('planRound braucht request.round');
	const start = request.start.lngLat;
	const target = round.km * 1000;
	const options = { effort: request.effort, signal: deps.signal };
	const rnd = random(round.seed);
	const base = rnd() * 360;
	const headings = Array.from({ length: ROUND.directions }, (_, k) => base + (k * 360) / ROUND.directions);

	const found = await mapLimited(headings, 4, async (heading): Promise<RoundCandidate | undefined> => {
		// Kreisumfang × Umwegfaktor der Straßen ≈ gewünschte Länge
		let radius = target / (2 * Math.PI * ROUND.roadFactor);
		for (let attempt = 0; attempt < ROUND.lengthAttempts; attempt++) {
			const vias = loopVias(start, heading, radius, deps);
			let path: RoutePath | undefined;
			try {
				[path] = await deps.route([start, ...vias, start], options);
				// Stummel/Kreis/Zipfel an einem Hilfspunkt: Punkt an den Anfang des Abstechers verlegen, neu rechnen
				for (let repair = 0; path && repair < ROUND.repairs; repair++) {
					const problem = roundShapeProblem(path, vias);
					if (!problem?.at) break;
					vias[problem.via] = problem.at;
					[path] = await deps.route([start, ...vias, start], options);
				}
			} catch (error) {
				if (error instanceof NoRouteError) return undefined;
				throw error;
			}
			if (!path) return undefined;
			const ratio = path.distance / target;
			if (Math.abs(ratio - 1) > ROUND.tolerance) {
				// zu lang → Kreis kleiner, zu kurz → größer (etwas gedämpft, die Hilfspunkte rücken ja mit)
				radius /= Math.pow(ratio, 0.8);
				continue;
			}
			if (roundShapeProblem(path, vias)) continue;
			const line = lineOf(path);
			const overlap = selfOverlap(line);
			if (overlap > ROUND.maxSelfOverlap) continue;
			const stats = analyzeRoute(path, deps.landscape, deps.roads);
			const beauty = beautyScore(stats);
			return { path, line, vias, heading, stats, beauty, overlap, score: beauty - SCORE.returnOverlap * overlap };
		}
		return undefined;
	});

	const candidates = found.filter((c): c is RoundCandidate => !!c).sort((a, b) => b.score - a.score);
	if (!candidates.length) throw new NoRouteError('Keine passende Runde gefunden');
	const chosen: RoundCandidate[] = [];
	for (const c of candidates) {
		if (chosen.length >= ROUND.suggestions) break;
		if (!chosen.some((p) => tooSimilar(c, p))) chosen.push(c);
	}

	// Titel: benannter Höhepunkt und unterscheidende Orte, sonst die Landschaft; Name nach der Richtung
	const named: (RouteNames | undefined)[] = chosen.map((c) =>
		deps.names ? routeNames(c.line, deps.names, deps.landscape) : undefined
	);
	const used = new Set<string>();
	return chosen.map((c, index) => {
		const names = named[index];
		const highlight = names && highlightOf(names);
		const others = named.filter((n, i): n is RouteNames => i !== index && !!n);
		const via = names && viaPlaces(distinctPlaces(names, others));
		const lead = highlight ? landmarkTitle(highlight) : honestTitles(c.stats, TITLE_MIN_SHARE_OF_TOP)[0];
		const direction = directionWord(bearing(start, centroid(c.line)));
		const candidatesForTitle = [
			lead && via && `${lead} ${via}`,
			lead,
			via && via.charAt(0).toUpperCase() + via.slice(1),
			lead && `${lead} – Runde nach ${direction}`,
			`Runde nach ${direction}`,
			`Schöne Runde ${index + 1}`
		].filter((t): t is string => !!t);
		const title = candidatesForTitle.find((t) => !used.has(t)) ?? `Schöne Runde ${index + 1}`;
		used.add(title);

		const waypoints: Waypoint[] = [
			{ lngLat: start, kind: 'start', name: request.start.name },
			...c.vias.map((v): Waypoint => ({ lngLat: v, kind: 'via' })),
			{ lngLat: start, kind: 'destination', name: request.start.name }
		];
		return {
			id: newTourId(),
			title,
			label: `Richtung ${direction}`,
			highlight: highlightSentence(
				c.stats,
				title,
				highlight ? { feature: highlight.kind === 'forest' ? 'forest' : highlight.kind === 'park' ? 'green' : 'water', phrase: landmarkPhrase(highlight) } : undefined
			),
			request,
			waypoints,
			legs: [
				{
					coordinates: c.path.coordinates,
					distance: c.path.distance,
					instructions: c.path.instructions,
					bridges: (c.path.details.road_environment ?? [])
						.filter(([, , v]) => v === 'bridge' || v === 'tunnel')
						.map(([from, to]) => [from, to] as [number, number])
				}
			],
			stats: c.stats,
			extraDistance: 0,
			minutes: rideMinutes(c.path.distance, elevationProfile(c.path.coordinates).ascent, request.effort)
		};
	});
}

/** Schwerpunkt einer Linie (für die Richtung der Runde) */
function centroid(line: LngLat[]): LngLat {
	let lon = 0;
	let lat = 0;
	for (const p of line) {
		lon += p[0];
		lat += p[1];
	}
	return [lon / line.length, lat / line.length];
}

