/**
 * Zieltour planen: der schönste Weg von A nach B (F3, Schwerpunkt der App).
 *
 * 1. Direkter genuss-Weg + GraphHopper-Alternativen
 * 2. Zusätzliche Wege über schöne Zwischenpunkte (Wasser, Wald, Grün aus der Landschaftskarte)
 * 3. Nachbewertung (score.ts), Mehrweg begrenzen
 * 4. Bei „auf anderem Weg zurück“: Rückweg ebenso planen und Paare mit wenig Überschneidung bilden
 * 5. Auswahl mit klaren Rollen: „Am schönsten“, „Direkt“ (immer dabei), „Fast direkt“ und bis zu
 *    MAX_SUGGESTIONS insgesamt – aber nur Wege, die sich lohnen (WORTHWHILE) und sich deutlich unterscheiden
 */
import { bearing, distance, distanceToLine, offset, resample, segmentLengths, type LngLat } from '$lib/geo/geo';
import type { Landscape } from '$lib/scoring/landscape';
import { WATER } from '$lib/scoring/landscape';
import { backtrackMeters, findBacktrack } from '$lib/scoring/backtrack';
import { mutualOverlap, overlapShare } from '$lib/scoring/overlap';
import { analyzeRoute, beautyScore, combineStats, lineOf, type RouteStats } from '$lib/scoring/score';
import {
	BEAUTY_CLASS_WEIGHTS,
	COMPACT,
	DETOUR,
	DIVERSITY_MAX_OVERLAP,
	MAX_SUGGESTIONS,
	SCORE,
	TITLE_MIN_SHARE_OF_TOP,
	VIA_SEARCH,
	WORTHWHILE
} from '$lib/scoring/weights';
import { rideMinutes } from '$lib/tour/duration';
import { elevationProfile } from '$lib/tour/elevation';
import { newTourId, type PlannedTour, type TourRequest, type Waypoint } from '$lib/tour/model';
import { highlightSentence, honestTitles, sideOf, sideTitle, viaStreetTitle, withSide, type NamedPhrase } from './describe';
import type { NameData } from '$lib/naming/names';
import { distinctPlaces, highlightOf, landmarkPhrase, landmarkTitle, routeNames, viaPlaces, type RouteNames } from '$lib/naming/title';
import { NoRouteError, route as routeGraphHopper, type RoutePath } from './graphhopper';

export interface PlanDeps {
	route: typeof routeGraphHopper;
	landscape?: Landscape;
	/** Orts- und Gewässernamen für verständliche Titel („Am Rhein entlang über Meerbusch“) */
	names?: NameData;
	signal?: AbortSignal;
}

/** Ein möglicher Weg für eine Richtung (Hin- oder Rückweg) */
interface LegCandidate {
	path: RoutePath;
	line: LngLat[];
	stats: RouteStats;
	vias: LngLat[];
	/** reine Schönheitspunkte (ohne Umweg-Abzug) */
	beauty: number;
	/** Weg über einen Punkt knapp neben der Luftlinie – nur für „Fast direkt“ gedacht */
	side: boolean;
	/** Bewertung inkl. Abzug für Umweg */
	score: number;
}

/**
 * Zwischenpunkte knapp links und rechts der Luftlinie – liefern Wege, die kaum länger sind als der direkte,
 * aber z. B. südlich statt durchs Industriegebiet führen.
 */
export function sideVias(start: LngLat, end: LngLat): LngLat[] {
	const beeline = distance(start, end);
	const course = bearing(start, end);
	const out: LngLat[] = [];
	for (const along of COMPACT.sideViaAlong) {
		const onLine: LngLat = [start[0] + (end[0] - start[0]) * along, start[1] + (end[1] - start[1]) * along];
		for (const side of [-90, 90]) out.push(offset(onLine, course + side, beeline * COMPACT.sideViaOffsetRatio));
	}
	return out;
}

interface DirectionResult {
	candidates: LegCandidate[];
	/** Länge des direkten genuss-Wegs */
	directDistance: number;
	/** schönster Weg, der kaum länger ist als der direkte (für „Fast direkt“) */
	compact?: LegCandidate;
	/** alle Kandidaten inkl. der knapp neben der Luftlinie (für „Fast direkt“) */
	pool: LegCandidate[];
	/** der direkte genuss-Weg */
	direct?: LegCandidate;
}

/** Bewertung für „Fast direkt“: Schönheit mit dem strengen Umweg-Abzug von „direkt“ */
function compactScore(c: LegCandidate, directDistance: number): number {
	return c.beauty - DETOUR.compactPenalty * Math.max(0, c.path.distance / directDistance - 1);
}

/** Meter auf langen Brücken und Fähren (Querung großer Flüsse, siehe VIA_SEARCH.longCrossingM) */
export function longCrossingMeters(path: RoutePath): number {
	const lengths = segmentLengths(lineOf(path));
	let total = 0;
	for (const [from, to, value] of path.details.road_environment ?? []) {
		if (value !== 'bridge' && value !== 'ferry') continue;
		let meters = 0;
		for (let i = from; i < to; i++) meters += lengths[i] ?? 0;
		if (meters >= VIA_SEARCH.longCrossingM) total += meters;
	}
	return total;
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

/**
 * Schöne Zwischenpunkte zwischen Start und Ziel finden: Stellen mit viel Wasser/Wald/Grün in der Umgebung,
 * die innerhalb des erlaubten Umwegs liegen und nicht direkt am kürzesten Weg.
 */
export function findScenicVias(
	landscape: Landscape,
	start: LngLat,
	end: LngLat,
	maxLength: number,
	directLine: LngLat[],
	count: number
): LngLat[] {
	if (count <= 0) return [];
	const beeline = distance(start, end);
	const maxSum = maxLength / VIA_SEARCH.roadFactor;
	if (maxSum <= beeline) return [];
	const minFromEnds = VIA_SEARCH.minFromEndsRatio * beeline;
	const coarseDirect = resample(directLine, 200);

	// Suchbereich: Rechteck um die Ellipse aller erlaubten Umwegpunkte.
	// Die Ellipse reicht seitlich am weitesten (kleine Halbachse) – das deckt auch die Verlängerung hinter Start/Ziel ab.
	const margin = Math.sqrt((maxSum / 2) ** 2 - (beeline / 2) ** 2);
	const latMargin = margin / 111_000;
	const lonMargin = margin / (111_000 * Math.cos((start[1] * Math.PI) / 180));
	const north = Math.max(start[1], end[1]) + latMargin;
	const south = Math.min(start[1], end[1]) - latMargin;
	const west = Math.min(start[0], end[0]) - lonMargin;
	const east = Math.max(start[0], end[0]) + lonMargin;

	const step = VIA_SEARCH.gridStepCells;
	const r0 = Math.max(0, landscape.rowOf(north));
	const r1 = Math.min(landscape.meta.height - 1, landscape.rowOf(south));
	const c0 = Math.max(0, landscape.colOf(west));
	const c1 = Math.min(landscape.meta.width - 1, landscape.colOf(east));

	// Lage entlang der Luftlinie (lokal flach gerechnet): 0 = Start, 1 = Ziel
	const kx = Math.cos((start[1] * Math.PI) / 180);
	const ax = (end[0] - start[0]) * kx;
	const ay = end[1] - start[1];
	const axisLen2 = ax * ax + ay * ay;
	const [minAlong, maxAlong] = VIA_SEARCH.alongRange;

	const found: { point: LngLat; beauty: number }[] = [];
	for (let row = r0; row <= r1; row += step) {
		for (let col = c0; col <= c1; col += step) {
			// Zwischenpunkt auf festem Boden, nicht mitten im See
			if (landscape.cell(row, col) === WATER) continue;
			const point = landscape.cellCenter(row, col);
			const along = ((point[0] - start[0]) * kx * ax + (point[1] - start[1]) * ay) / axisLen2;
			if (along < minAlong || along > maxAlong) continue;
			const dStart = distance(start, point);
			const dEnd = distance(point, end);
			if (dStart + dEnd > maxSum) continue;
			if (Math.min(dStart, dEnd) < minFromEnds) continue;
			const beauty = landscape.beautyAround(row, col, VIA_SEARCH.windowRadiusCells, BEAUTY_CLASS_WEIGHTS);
			if (beauty < VIA_SEARCH.minBeauty) continue;
			found.push({ point, beauty });
		}
	}

	found.sort((a, b) => b.beauty - a.beauty);
	const chosen: LngLat[] = [];
	for (const { point } of found) {
		if (chosen.length >= count) break;
		if (chosen.some((c) => distance(c, point) < VIA_SEARCH.minSpacingM)) continue;
		if (distanceToLine(point, coarseDirect) < VIA_SEARCH.minFromDirectM) continue;
		chosen.push(point);
	}
	return chosen;
}

/** Alle Wege für eine Richtung berechnen und bewerten */
async function planDirection(
	from: LngLat,
	to: LngLat,
	request: TourRequest,
	deps: PlanDeps
): Promise<DirectionResult> {
	const level = DETOUR;
	const options = { effort: request.effort, signal: deps.signal };

	const direct = await deps.route([from, to], {
		...options,
		alternatives: { maxPaths: 3, maxWeightFactor: level.alternativeFactor, maxShareFactor: 0.7 }
	});
	if (!direct.length) throw new NoRouteError('Kein Weg gefunden');
	const directDistance = direct[0].distance;
	const maxLength = directDistance * (1 + level.maxExtraRatio) + level.minExtraKm * 1000;

	// side = Weg knapp neben der Luftlinie: nur Kandidat für „Fast direkt“, nicht für die schönsten Vorschläge
	type Found = { path: RoutePath; vias: LngLat[]; side: boolean };
	const paths: Found[] = direct.map((path) => ({ path, vias: [], side: false }));

	// Zwischenpunkte: schöne Orte (je nach Umweg-Wunsch) + knapp neben der Luftlinie (für „Fast direkt“)
	const vias = [
		...(deps.landscape && level.scenicVias > 0
			? findScenicVias(deps.landscape, from, to, maxLength, lineOf(direct[0]), level.scenicVias + VIA_SEARCH.spareVias)
			: []
		).map((point) => ({ point, side: false })),
		...sideVias(from, to).map((point) => ({ point, side: true }))
	];
	const viaPaths = await mapLimited(vias, 4, async ({ point, side }): Promise<Found | undefined> => {
		try {
			const [path] = await deps.route([from, point, to], options);
			if (!path) return undefined;
			// „Stummel“ oder „Lasso“ um den Hilfspunkt? Dann den Punkt an die Abzweigung verlegen und neu rechnen –
			// so führt der Weg an der schönen Stelle vorbei, ohne den Abstecher.
			const backtrack = findBacktrack(lineOf(path));
			if (backtrack.meters > VIA_SEARCH.maxBacktrackM && backtrack.start) {
				const [repaired] = await deps.route([from, backtrack.start, to], options);
				if (repaired) return { path: repaired, vias: [backtrack.start], side };
			}
			return { path, vias: [point], side };
		} catch (error) {
			if (error instanceof NoRouteError) return undefined; // Zwischenpunkt nicht erreichbar → weglassen
			throw error;
		}
	});
	for (const p of viaPaths) if (p) paths.push(p);

	// keine zusätzlichen Fluss-Querungen gegenüber dem direkten Weg (über die Brücke hin, woanders zurück)
	const directCrossing = longCrossingMeters(direct[0]);
	const all = paths
		.filter(({ path }) => path.distance <= maxLength)
		.filter(({ path }) => path === direct[0] || longCrossingMeters(path) <= directCrossing + 50)
		// Wege über Zwischenpunkte ohne „Stummel“ (hin und gleich wieder zurück in eine Sackgasse)
		.filter(({ path, vias }) => !vias.length || backtrackMeters(lineOf(path)) <= VIA_SEARCH.maxBacktrackM)
		.map(({ path, vias, side }) => {
			const stats = analyzeRoute(path, deps.landscape);
			const beauty = beautyScore(stats);
			const extraRatio = Math.max(0, path.distance / directDistance - 1);
			return {
				path,
				line: lineOf(path),
				stats,
				vias,
				beauty,
				side,
				score: beauty - level.detourPenalty * extraRatio
			};
		})
		.sort((a, b) => b.score - a.score);
	const candidates = all.filter((c) => !c.side);

	const compactLimit = directDistance * (1 + COMPACT.maxExtraRatio) + COMPACT.minExtraKm * 1000;
	const compact = all
		.filter((c) => c.path.distance <= compactLimit)
		.sort((a, b) => compactScore(b, directDistance) - compactScore(a, directDistance))[0];

	return { candidates, directDistance, compact, pool: all, direct: all.find((c) => c.path === direct[0]) };
}

interface Combination {
	legs: LegCandidate[];
	score: number;
}

/** Hin- bzw. Rückweg zweier Vorschläge verlaufen weitgehend gleich */
function sameLeg(a: Combination, b: Combination, i: number): boolean {
	return a.legs[i] === b.legs[i] || mutualOverlap(a.legs[i].line, b.legs[i].line) > DIVERSITY_MAX_OVERLAP;
}

/** Zwei Vorschläge sind praktisch derselbe Weg (Hin- und ggf. Rückweg weitgehend gleich) */
function sameTour(a: Combination, b: Combination): boolean {
	return a.legs.every((_, i) => sameLeg(a, b, i));
}

const lengthOf = (c: Combination) => c.legs.reduce((sum, l) => sum + l.path.distance, 0);
const beautyOf = (c: Combination) => c.legs.reduce((sum, l) => sum + l.beauty * l.path.distance, 0) / lengthOf(c);

/** Lohnt sich ein weiterer Vorschlag? Nicht, wenn ein gezeigter kürzer (oder gleich lang) und fast genauso schön ist */
function worthwhile(c: Combination, shown: Combination[]): boolean {
	return !shown.some(
		(p) =>
			lengthOf(p) <= lengthOf(c) * (1 + WORTHWHILE.lengthTolerance) &&
			beautyOf(p) >= beautyOf(c) - WORTHWHILE.beautyMargin
	);
}

/** Rückweg zu einem Hinweg: kaum länger als der direkte Rückweg, möglichst nicht derselbe Weg wie hin */
function returnLeg(out: LegCandidate, inbound: DirectionResult): LegCandidate | undefined {
	const limit = inbound.directDistance * (1 + COMPACT.maxExtraRatio) + COMPACT.minExtraKm * 1000;
	return inbound.pool
		.filter((c) => c.path.distance <= limit)
		.map((c) => ({ c, s: compactScore(c, inbound.directDistance) - SCORE.returnOverlap * overlapShare(c.line, out.line) }))
		.sort((a, b) => b.s - a.s)[0]?.c;
}

/** Titel für einen Vorschlag, der sich nur in einer Richtung von einem besseren unterscheidet */
function relationTitle(combo: Combination, better: Combination[]): string | undefined {
	if (combo.legs.length < 2) return undefined;
	if (better.some((b) => sameLeg(combo, b, 0))) return 'Gleicher Hinweg, anderer Rückweg';
	if (better.some((b) => sameLeg(combo, b, 1))) return 'Anderer Hinweg, gleicher Rückweg';
	return undefined;
}

/** Meter je Straßenname (für unterscheidende Titel) */
function streetLengths(combo: Combination): Map<string, number> {
	const out = new Map<string, number>();
	for (const leg of combo.legs) {
		const lengths = segmentLengths(leg.line);
		for (const [from, to, name] of leg.path.details.street_name ?? []) {
			if (!name) continue;
			let sum = 0;
			for (let i = from; i < to; i++) sum += lengths[i] ?? 0;
			out.set(name, (out.get(name) ?? 0) + sum);
		}
	}
	return out;
}

/** Längste Straße dieses Vorschlags, die die anderen kaum benutzen (mind. 300 m) */
function distinctiveStreet(own: Map<string, number>, others: Map<string, number>[]): string | undefined {
	return [...own.entries()]
		.filter(([name, length]) => length >= 300 && others.every((o) => (o.get(name) ?? 0) < length * 0.3))
		.sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Benannter Höhepunkt → Teil des Beschreibungssatzes („am Rhein“, „durch den Stadtwald“) */
function namedPhrase(l: { name: string; kind: 'river' | 'lake' | 'forest' | 'park' }): NamedPhrase {
	const feature = l.kind === 'river' || l.kind === 'lake' ? 'water' : l.kind === 'forest' ? 'forest' : 'green';
	return { feature, phrase: landmarkPhrase(l) };
}

/** Hauptfunktion: Vorschläge für eine Zieltour */
export async function planTours(request: TourRequest, deps: PlanDeps): Promise<PlannedTour[]> {
	const start = request.start.lngLat;
	const end = request.destination.lngLat;

	const outbound = await planDirection(start, end, request, deps);
	const inbound = request.returnMode === 'other-way' ? await planDirection(end, start, request, deps) : undefined;
	const directTotal = outbound.directDistance + (inbound?.directDistance ?? 0);

	/** Hinweg → Vorschlag (bei „auf anderem Weg zurück“ mit passendem kurzen Rückweg) */
	const withReturn = (out: LegCandidate | undefined): Combination | undefined => {
		if (!out) return undefined;
		if (!inbound) return { legs: [out], score: out.score };
		const back = returnLeg(out, inbound);
		return back && { legs: [out, back], score: out.score };
	};

	let combinations: Combination[];
	if (inbound) {
		combinations = [];
		for (const out of outbound.candidates.slice(0, 6)) {
			for (const back of inbound.candidates.slice(0, 6)) {
				const shared = overlapShare(back.line, out.line);
				const total = out.path.distance + back.path.distance;
				const score =
					(out.score * out.path.distance + back.score * back.path.distance) / total -
					SCORE.returnOverlap * shared;
				combinations.push({ legs: [out, back], score });
			}
		}
		combinations.sort((a, b) => b.score - a.score);
	} else {
		combinations = outbound.candidates.map((c) => ({ legs: [c], score: c.score }));
	}
	const best = combinations[0];
	if (!best) throw new NoRouteError('Kein passender Weg gefunden');

	// Vorschläge mit klarer Rolle. Der direkte Weg ist immer dabei (Wunsch Jan).
	const chosen: Combination[] = [best];
	const roles = new Map<Combination, string>();
	const direct = withReturn(outbound.direct);
	const bestIsDirect = !!direct && sameTour(direct, best);
	if (direct && !bestIsDirect) {
		chosen.push(direct);
		roles.set(direct, 'Direkt');
	}
	const compact = withReturn(outbound.compact);
	if (compact && !chosen.some((c) => sameTour(compact, c)) && worthwhile(compact, chosen)) {
		chosen.push(compact);
		roles.set(compact, 'Fast direkt');
	}
	// Auffüllen: erst Wege, die sich in jedem Abschnitt unterscheiden; „gleicher Hinweg, anderer Rückweg“
	// nur, wenn es sonst weniger als drei Vorschläge wären
	const strict = (item: Combination, p: Combination) => item.legs.some((_, i) => sameLeg(item, p, i));
	for (const [similar, max] of [
		[strict, MAX_SUGGESTIONS],
		[sameTour, 3]
	] as const) {
		for (const item of combinations) {
			if (chosen.length >= max) break;
			if (chosen.includes(item) || chosen.some((p) => similar(item, p))) continue;
			if (worthwhile(item, chosen)) chosen.push(item);
		}
	}
	// Reihenfolge: die Empfehlung zuerst, dann vom längsten zum kürzesten – der direkte steht unten
	// (der direkte genuss-Weg ist nicht immer der kürzeste – er steht trotzdem immer ganz unten)
	const [first, ...rest] = chosen;
	const others = rest.filter((c) => c !== direct).sort((a, b) => lengthOf(b) - lengthOf(a));
	const ordered = [first, ...others, ...(direct && rest.includes(direct) ? [direct] : [])];
	// Die Empfehlung (beste Abwägung aus Schönheit und Umweg) ist nicht immer der schönste Weg –
	// ist ein längerer noch schöner, heißt der „Am schönsten“
	const prettiest = ordered.reduce((a, b) => (beautyOf(b) > beautyOf(a) ? b : a));
	const bestRole = prettiest === best ? 'Am schönsten' : 'Unsere Empfehlung';
	roles.set(best, bestIsDirect ? `${bestRole} und direkt` : bestRole);
	if (prettiest !== best && !roles.has(prettiest)) roles.set(prettiest, 'Am schönsten');

	const streets = ordered.map(streetLengths);
	const named: (RouteNames | undefined)[] = ordered.map((c) =>
		deps.names ? routeNames(c.legs.flatMap((l) => l.line), deps.names, deps.landscape) : undefined
	);
	const usedTitles = new Set<string>();

	return ordered.map((combo, index) => {
		const stats = combineStats(combo.legs.map((l) => l.stats));
		const total = stats.distance;
		// Titel in dieser Reihenfolge, der erste noch freie gewinnt:
		// Landschaft → unterscheidende Straße → Himmelsrichtung → Verhältnis zu besseren Vorschlägen → allgemein
		const street = distinctiveStreet(streets[index], streets.filter((_, i) => i !== index));
		const side = sideTitle(
			sideOf(combo.legs[0].line, start, end),
			combo.legs[1] && sideOf(combo.legs[1].line, start, end),
			combo.legs.length > 1
		);
		// nur Landschaften, die bei diesem Weg wirklich vorne liegen; ist der Titel schon vergeben,
		// wird er mit der Himmelsrichtung ergänzt statt auf eine schwächere Landschaft auszuweichen
		const honest = honestTitles(stats, TITLE_MIN_SHARE_OF_TOP);
		const outboundSide = combo.legs.length === 1 ? sideOf(combo.legs[0].line, start, end) : undefined;
		// 1. Wahl: benannter Höhepunkt und unterscheidende Orte („Am Rhein entlang über Meerbusch“)
		const names = named[index];
		const highlight = names && highlightOf(names);
		const others = named.filter((n, i): n is RouteNames => i !== index && !!n);
		const via = names && viaPlaces(distinctPlaces(names, others));
		const lead = highlight ? landmarkTitle(highlight) : honest[0];
		const candidates = [
			lead && via && `${lead} ${via}`,
			lead,
			highlight && honest[0] && via && `${honest[0]} ${via}`,
			via && via.charAt(0).toUpperCase() + via.slice(1),
			honest[0],
			honest[0] && outboundSide && withSide(honest[0], outboundSide),
			street && viaStreetTitle(street),
			...honest.slice(1),
			side,
			relationTitle(combo, ordered.slice(0, index)),
			'Ruhige Nebenstrecke'
		].filter((t): t is string => !!t);
		const title = candidates.find((t) => !usedTitles.has(t)) ?? `Weitere Möglichkeit ${index + 1}`;
		usedTitles.add(title);

		const label = roles.get(combo);

		const waypoints: Waypoint[] = [{ lngLat: start, kind: 'start', name: request.start.name }];
		const [out, back] = combo.legs;
		for (const via of out.vias) waypoints.push({ lngLat: via, kind: 'via' });
		waypoints.push({ lngLat: end, kind: 'destination', name: request.destination.name });
		if (back) {
			for (const via of back.vias) waypoints.push({ lngLat: via, kind: 'via' });
			waypoints.push({ lngLat: start, kind: 'start', name: request.start.name });
		}

		return {
			id: newTourId(),
			title,
			label,
			highlight: highlightSentence(stats, title, highlight ? namedPhrase(highlight) : undefined),
			request,
			waypoints,
			legs: combo.legs.map((l) => ({
				coordinates: l.path.coordinates,
				distance: l.path.distance,
				instructions: l.path.instructions
			})),
			stats,
			extraDistance: Math.max(0, total - directTotal),
			minutes: rideMinutes(
				total,
				combo.legs.reduce((sum, l) => sum + elevationProfile(l.path.coordinates).ascent, 0),
				request.effort
			)
		};
	});
}
