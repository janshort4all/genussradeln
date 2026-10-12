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
import { band, bearing, distance, offset, resample, segmentLengths, type LngLat } from '$lib/geo/geo';
import { distinctPlaces, highlightOf, landmarkPhrase, landmarkTitle, routeNames, viaPlaces, type RouteNames } from '$lib/naming/title';
import { findBacktrack, findLoop, findSpur, separatedFrom } from '$lib/scoring/backtrack';
import { overlapShare } from '$lib/scoring/overlap';
import { WATER } from '$lib/scoring/landscape';
import { analyzeRoute, beautyScore, lineOf, type RouteStats } from '$lib/scoring/score';
import {
	BEAUTY_CLASS_WEIGHTS,
	NAMING,
	ROUND,
	SCORE,
	SHORE_CELLS_FINE,
	TITLE_MIN_SHARE_OF_TOP,
	VIA_SEARCH,
	VIA_WOODLAND_BONUS,
	WISH_WEIGHTS
} from '$lib/scoring/weights';
import { rideMinutes } from '$lib/tour/duration';
import { elevationProfile } from '$lib/tour/elevation';
import { legFromPath, newTourId, type PlannedTour, type RoundWish, type TourRequest, type Waypoint } from '$lib/tour/model';
import { highlightSentence, honestTitles } from './describe';
import { NoRouteError, type RouteOptions, type RoutePath } from './graphhopper';
import type { PlanDeps } from './plan';
import { goThrough } from './through';

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
function scenicNear(
	point: LngLat,
	reach: number,
	deps: PlanDeps,
	weights: [number, number, number, number] = BEAUTY_CLASS_WEIGHTS
): LngLat {
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
			const beauty =
				landscape.beautyAround(row + dr, col + dc, VIA_SEARCH.windowRadiusCells, weights) +
				VIA_WOODLAND_BONUS * (landscape.woodDepthAtCell(row + dr, col + dc)?.depth ?? 0);
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

/** Nur Wasser zählt (für die Suche nach einem Ufer) */
const WATER_ONLY: [number, number, number, number] = [0, 0, 0, 1];

/**
 * Ein Punkt am Ufer eines größeren Gewässers (Rhein, See) in der Nähe von `point` (Wunsch „Am Wasser“, Jan, 11.10.2026):
 * Land direkt am Wasser, mit viel Wasser in der Umgebung (kein Teich), möglichst nah am gewünschten Punkt.
 * `undefined`, wenn in Reichweite kein solches Ufer liegt.
 */
export function shoreNear(point: LngLat, reach: number, deps: PlanDeps): LngLat | undefined {
	const landscape = deps.landscape;
	if (!landscape) return undefined;
	const row = landscape.rowOf(point[1]);
	const col = landscape.colOf(point[0]);
	const cellM = landscape.meta.cellLat * 110_540;
	const r = Math.max(1, Math.round(reach / cellM));
	const step = Math.max(1, Math.round(r / 12));
	let best: LngLat | undefined;
	let bestScore = -Infinity;
	for (let dr = -r; dr <= r; dr += step) {
		for (let dc = -r; dc <= r; dc += step) {
			if (landscape.cell(row + dr, col + dc) === WATER) continue;
			const around = landscape.beautyAround(row + dr, col + dc, 2, WATER_ONLY);
			if (around < 0.1) continue;
			const centre = landscape.cellCenter(row + dr, col + dc);
			if (deps.fine && !deps.fine.nearWater(centre, SHORE_CELLS_FINE)) continue;
			const score = around - (0.5 * Math.hypot(dr, dc)) / r;
			if (score > bestScore) {
				bestScore = score;
				best = centre;
			}
		}
	}
	return best;
}

/** Länge der Gewässerverläufe (einmal gerechnet) */
const courseLengths = new WeakMap<object, number>();
function courseLength(course: { line: LngLat[] }): number {
	let length = courseLengths.get(course);
	if (length === undefined) {
		length = 0;
		for (let i = 1; i < course.line.length; i++) length += distance(course.line[i - 1], course.line[i]);
		courseLengths.set(course, length);
	}
	return length;
}

/**
 * Punkt am Ufer eines Flusses in Reichweite von `point` (Wunsch „Am Wasser“): der nächste Punkt auf dem Flusslauf –
 * lange Flüsse wie der Rhein bevorzugt –, von der Flussmitte ans Ufer gerückt, auf die Seite des gewünschten Punkts.
 */
function riverBank(point: LngLat, reach: number, deps: PlanDeps): LngLat | undefined {
	if (!deps.streams?.length) return undefined;
	const R = ROUND.river;
	let best: LngLat | undefined;
	let bestScore = -Infinity;
	for (const course of deps.streams) {
		// nur richtige Flüsse – ein Bach am Weg macht noch keine Runde „am Wasser“
		if (courseLength(course) < R.minLengthM) continue;
		const bonus = (Math.min(courseLength(course), R.longRiverM) / R.longRiverM) * R.longRiverBonusM;
		for (const p of resample(course.line, 150)) {
			const d = distance(point, p);
			if (d > reach) continue;
			const score = bonus - d;
			if (score > bestScore) {
				bestScore = score;
				best = p;
			}
		}
	}
	return best && offset(best, bearing(best, point), Math.min(R.bankM, distance(best, point)));
}

/**
 * Uferstreifen für „Am Wasser“: Streifen um die benannten Gewässer (Rhein, Niers, Bäche …) in der Umgebung des
 * Kreises. GraphHopper bleibt dort bevorzugt in den Streifen (alles außerhalb wird unattraktiver) – so führt der Weg
 * zwischen den Hilfspunkten nicht quer über Land, sondern am Wasser entlang.
 */
export function shoreCorridor(center: LngLat, reach: number, deps: PlanDeps): LngLat[][] | undefined {
	if (!deps.streams?.length || !ROUND.shoreBand.enabled) return undefined;
	const B = ROUND.shoreBand;
	const rings: { ring: LngLat[]; d: number }[] = [];
	for (const course of deps.streams) {
		const pts = resample(course.line, B.stepM);
		for (let i = 0; i + 1 < pts.length; i++) {
			const d = distance(center, pts[i]);
			if (d <= reach) rings.push({ ring: band(pts[i], pts[i + 1], B.halfWidthM), d });
		}
	}
	if (!rings.length) return undefined;
	return rings.sort((a, b) => a.d - b.d).slice(0, B.maxRings).map((r) => r.ring);
}

/** Drei Hilfspunkte auf einem Kreis durch den Start, Mittelpunkt in Richtung `heading` */
export function loopVias(
	start: LngLat,
	heading: number,
	radius: number,
	deps: PlanDeps,
	wish?: RoundWish
): LngLat[] {
	const center = offset(start, heading, radius);
	const weights = wish ? WISH_WEIGHTS[wish] : BEAUTY_CLASS_WEIGHTS;
	return [heading - 90, heading, heading + 90].map((angle) => {
		const ideal = offset(center, angle, radius);
		return (
			(wish === 'water'
				? (riverBank(ideal, radius * ROUND.shoreReach, deps) ?? shoreNear(ideal, radius * ROUND.shoreReach, deps))
				: undefined) ??
			scenicNear(ideal, radius * ROUND.scenicReach, deps, weights)
		);
	});
}

/** Anteil der Strecke, der zum Wunsch passt (für die Zusatzpunkte) */
function wishShare(stats: RouteStats, wish?: RoundWish): number {
	if (wish === 'water') return stats.shoreWater ?? stats.water;
	if (wish === 'forest') return stats.forest;
	if (wish === 'fields') return stats.fields;
	return 0;
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
	const wish = round.wish;
	// rundherum ab einem zufälligen Winkel (mit Wunsch mehr Richtungen: mehr Auswahl)
	const count = wish ? ROUND.wishDirections : ROUND.directions;

	const tryHeading = async (heading: number): Promise<RoundCandidate | undefined> => {
		// Kreisumfang × Umwegfaktor der Straßen ≈ gewünschte Länge
		let radius = target / (2 * Math.PI * ROUND.roadFactor);
		for (let attempt = 0; attempt < ROUND.lengthAttempts; attempt++) {
			const vias = loopVias(start, heading, radius, deps, wish);
			// „Am Wasser“: der Weg zwischen den Hilfspunkten bleibt bevorzugt in Uferstreifen
			const rings = wish === 'water' ? shoreCorridor(offset(start, heading, radius), radius * 1.5, deps) : undefined;
			const attemptOptions: RouteOptions = rings
				? { ...options, preferAreas: { rings, outsideFactor: ROUND.shoreBand.outsideFactor } }
				: options;
			let path: RoutePath | undefined;
			try {
				[path] = await deps.route([start, ...vias, start], attemptOptions);
				// Stummel/Kreis/Zipfel an einem Hilfspunkt: Punkt an den Anfang des Abstechers verlegen, neu rechnen
				for (let repair = 0; path && repair < ROUND.repairs; repair++) {
					const problem = roundShapeProblem(path, vias);
					if (!problem?.at) break;
					vias[problem.via] = problem.at;
					[path] = await deps.route([start, ...vias, start], attemptOptions);
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
			const stats = analyzeRoute(path, deps.landscape, deps.roads, deps.fine);
			const beauty = beautyScore(stats);
			const score = beauty + ROUND.wishBonus * wishShare(stats, wish) - SCORE.returnOverlap * overlap;
			return { path, line, vias, heading, stats, beauty, overlap, score };
		}
		return undefined;
	};

	/** Die schönsten, untereinander verschiedenen Runden aus allen bisher gefundenen */
	const select = (found: RoundCandidate[]): RoundCandidate[] => {
		let candidates = [...found].sort((a, b) => b.score - a.score);
		// Wunsch: nur Runden, die ihn wirklich erfüllen – lieber weniger Vorschläge als welche, die nichts damit zu tun haben
		if (wish) {
			const shares = candidates.map((c) => wishShare(c.stats, wish));
			const best = Math.max(0, ...shares);
			const floor = Math.max(ROUND.wishMin[wish], best * ROUND.wishMin.relative);
			candidates = candidates.filter((c, i) => {
				if (shares[i] < floor) return false;
				// „Am Wasser“ nur mit einem benannten Fluss oder See am Weg – sonst liegt der Weg nur zufällig nahe an irgendeinem Wasser
				if (wish === 'water' && deps.names) {
					const names = routeNames(c.line, deps.names, deps.landscape, deps.fine);
					return names.landmarks.some((l) => (l.kind === 'river' || l.kind === 'lake') && l.share >= NAMING.minLandmarkShare);
				}
				return true;
			});
		}
		const picked: RoundCandidate[] = [];
		for (const c of candidates) {
			if (picked.length >= ROUND.suggestions) break;
			if (!picked.some((p) => tooSimilar(c, p))) picked.push(c);
		}
		return picked;
	};

	// Gleich beim ersten Mal möglichst viele Vorschläge (Jan, 14.10.2026: „erst nach mehrfachem ‚neue Runden suchen‘ kommen mehr“):
	// Sind es zu wenige, werden weitere Richtungen zwischen den bisherigen probiert (bis ROUND.extraPasses Mal)
	const all: RoundCandidate[] = [];
	let chosen: RoundCandidate[] = [];
	for (let pass = 0; pass <= ROUND.extraPasses; pass++) {
		const shift = (pass * 360) / count / (ROUND.extraPasses + 1);
		const headings = Array.from({ length: count }, (_, k) => base + shift + (k * 360) / count);
		const found = await mapLimited(headings, 4, tryHeading);
		all.push(...found.filter((c): c is RoundCandidate => !!c));
		chosen = select(all);
		if (chosen.length >= ROUND.enough) break;
	}
	if (!chosen.length) throw new NoRouteError('Keine passende Runde gefunden');

	// Durch statt vorbei (Wunsch Jan, 14.10.2026, through.ts): Wald, Parks und Seeufer, an denen eine Runde nur vorbeiführt,
	// werden durchfahren – solange die Runde ihre Länge behält (± ROUND.tolerance) und nicht denselben Weg zurück fährt.
	// Nicht beim Wunsch „Felder“ (dort soll sie ja gerade nicht in den Wald).
	if (wish !== 'fields') {
		await mapLimited(chosen, 2, async (c) => {
			const better = await goThrough(
				c.path,
				deps,
				options,
				(p) => Math.abs(p.distance / target - 1) <= ROUND.tolerance && selfOverlap(lineOf(p)) <= ROUND.maxSelfOverlap
			);
			if (!better.changed) return;
			c.path = better.path;
			c.line = lineOf(better.path);
			c.stats = better.stats;
			c.beauty = better.beauty;
		});
		// zwei Runden, die jetzt durch dasselbe Gebiet führen, könnten sich zu ähnlich geworden sein – die schönere bleibt
		for (let i = chosen.length - 1; i > 0; i--) if (chosen.slice(0, i).some((p) => tooSimilar(chosen[i], p))) chosen.splice(i, 1);
	}

	// Titel: benannter Höhepunkt und unterscheidende Orte, sonst die Landschaft; Name nach der Richtung
	const named: (RouteNames | undefined)[] = chosen.map((c) =>
		deps.names ? routeNames(c.line, deps.names, deps.landscape, deps.fine) : undefined
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
			legs: [legFromPath(c.path)],
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

