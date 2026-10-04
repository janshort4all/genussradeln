/**
 * Zieltour planen: der schönste Weg von A nach B (F3, Schwerpunkt der App).
 *
 * 1. Direkter genuss-Weg + GraphHopper-Alternativen
 * 2. Je nach Umweg-Wunsch zusätzliche Wege über schöne Zwischenpunkte (Wasser, Wald, Grün aus der Landschaftskarte)
 * 3. Nachbewertung (score.ts), Mehrweg begrenzen, die besten untereinander verschiedenen Wege auswählen
 * 4. Bei „auf anderem Weg zurück“: Rückweg ebenso planen und Paare mit wenig Überschneidung bilden
 */
import { bearing, distance, distanceToLine, offset, resample, segmentLengths, type LngLat } from '$lib/geo/geo';
import type { Landscape } from '$lib/scoring/landscape';
import { WATER } from '$lib/scoring/landscape';
import { mutualOverlap, overlapShare } from '$lib/scoring/overlap';
import { analyzeRoute, beautyScore, combineStats, lineOf, type RouteStats } from '$lib/scoring/score';
import {
	BEAUTY_CLASS_WEIGHTS,
	COMPACT,
	DETOUR,
	DIVERSITY_MAX_OVERLAP,
	MAX_SUGGESTIONS,
	SCORE,
	SPEED_KMH,
	VIA_SEARCH
} from '$lib/scoring/weights';
import { newTourId, type PlannedTour, type TourRequest, type Waypoint } from '$lib/tour/model';
import { highlightSentence, sideOf, sideTitle, titleOptions, viaStreetTitle } from './describe';
import { NoRouteError, route as routeGraphHopper, type RoutePath } from './graphhopper';

export interface PlanDeps {
	route: typeof routeGraphHopper;
	landscape?: Landscape;
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
}

/** Bewertung für „Fast direkt“: Schönheit mit dem strengen Umweg-Abzug von „direkt“ */
function compactScore(c: LegCandidate, directDistance: number): number {
	return c.beauty - DETOUR.direct.detourPenalty * Math.max(0, c.path.distance / directDistance - 1);
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
	const level = DETOUR[request.detour];
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
			? findScenicVias(deps.landscape, from, to, maxLength, lineOf(direct[0]), level.scenicVias)
			: []
		).map((point) => ({ point, side: false })),
		...sideVias(from, to).map((point) => ({ point, side: true }))
	];
	const viaPaths = await mapLimited(vias, 4, async ({ point, side }): Promise<Found | undefined> => {
		try {
			const [path] = await deps.route([from, point, to], options);
			return path ? { path, vias: [point], side } : undefined;
		} catch (error) {
			if (error instanceof NoRouteError) return undefined; // Zwischenpunkt nicht erreichbar → weglassen
			throw error;
		}
	});
	for (const p of viaPaths) if (p) paths.push(p);

	const all = paths
		.filter(({ path }) => path.distance <= maxLength)
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

	return { candidates, directDistance, compact, pool: all };
}

interface Combination {
	legs: LegCandidate[];
	score: number;
}

/** Hin- bzw. Rückweg zweier Vorschläge verlaufen weitgehend gleich */
function sameLeg(a: Combination, b: Combination, i: number): boolean {
	return a.legs[i] === b.legs[i] || mutualOverlap(a.legs[i].line, b.legs[i].line) > DIVERSITY_MAX_OVERLAP;
}

/**
 * Die besten Vorschläge wählen, die sich deutlich unterscheiden:
 * 1. Durchgang streng – jeder Abschnitt (Hinweg und ggf. Rückweg) muss anders sein.
 * 2. Durchgang zum Auffüllen – es reicht, wenn sich ein Abschnitt unterscheidet (z. B. anderer Rückweg).
 */
/** Zwei Vorschläge sind praktisch derselbe Weg (Hin- und ggf. Rückweg weitgehend gleich) */
function sameTour(a: Combination, b: Combination): boolean {
	return a.legs.every((_, i) => sameLeg(a, b, i));
}

function pickDiverse(items: Combination[], max: number): Combination[] {
	const picked: Combination[] = [];
	const strict = (item: Combination, p: Combination) => item.legs.some((_, i) => sameLeg(item, p, i));
	const lenient = (item: Combination, p: Combination) => item.legs.every((_, i) => sameLeg(item, p, i));
	for (const similar of [strict, lenient]) {
		for (const item of items) {
			if (picked.length >= max) break;
			if (picked.includes(item) || picked.some((p) => similar(item, p))) continue;
			picked.push(item);
		}
	}
	// Reihenfolge nach Bewertung (der zweite Durchgang hängt hinten an)
	return picked.sort((a, b) => b.score - a.score);
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

/** Hauptfunktion: Vorschläge für eine Zieltour */
export async function planTours(request: TourRequest, deps: PlanDeps): Promise<PlannedTour[]> {
	const start = request.start.lngLat;
	const end = request.destination.lngLat;

	const outbound = await planDirection(start, end, request, deps);
	let combinations: Combination[];
	let directTotal = outbound.directDistance;
	/** „Fast direkt“ (nur bei „etwas schöner“ / „am schönsten“) */
	let compact: Combination | undefined;

	if (request.returnMode === 'other-way') {
		const inbound = await planDirection(end, start, request, deps);
		directTotal += inbound.directDistance;
		if (outbound.compact && inbound.compact) {
			// Rückweg „Fast direkt“: kaum länger, möglichst nicht derselbe Weg wie hin
			const out = outbound.compact;
			const limit = inbound.directDistance * (1 + COMPACT.maxExtraRatio) + COMPACT.minExtraKm * 1000;
			const back = inbound.pool
				.filter((c) => c.path.distance <= limit)
				.map((c) => ({ c, s: compactScore(c, inbound.directDistance) - SCORE.returnOverlap * overlapShare(c.line, out.line) }))
				.sort((a, b) => b.s - a.s)[0]?.c;
			if (back) compact = { legs: [out, back], score: 0 };
		}
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
		if (outbound.compact) compact = { legs: [outbound.compact], score: 0 };
	}

	const chosen = pickDiverse(combinations, MAX_SUGGESTIONS);
	if (!chosen.length) throw new NoRouteError('Kein passender Weg gefunden');

	// Bei „etwas schöner“ / „am schönsten“: zusätzlich „Fast direkt“ – falls nicht schon dabei
	let compactIndex = -1;
	if (request.detour !== 'direct' && compact && !chosen.some((c) => sameTour(compact!, c))) {
		chosen.push(compact);
		compactIndex = chosen.length - 1;
	}

	const shortest = Math.min(...chosen.map((c) => c.legs.reduce((s, l) => s + l.path.distance, 0)));
	const streets = chosen.map(streetLengths);
	const usedTitles = new Set<string>();

	return chosen.map((combo, index) => {
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
		const landscapeTitles = titleOptions(stats);
		const candidates = [
			...landscapeTitles.slice(0, -1),
			street && viaStreetTitle(street),
			side,
			relationTitle(combo, chosen.slice(0, index)),
			...landscapeTitles.slice(-1)
		].filter((t): t is string => !!t);
		const title = candidates.find((t) => !usedTitles.has(t)) ?? `Weitere Möglichkeit ${index + 1}`;
		usedTitles.add(title);

		let label: string | undefined;
		if (index === 0) label = 'Am schönsten';
		else if (index === compactIndex) label = 'Fast direkt';
		else if (total === shortest && compactIndex < 0) label = 'Am kürzesten';

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
			highlight: highlightSentence(stats, title),
			request,
			waypoints,
			legs: combo.legs.map((l) => ({ coordinates: l.path.coordinates, distance: l.path.distance })),
			stats,
			extraDistance: Math.max(0, total - directTotal),
			minutes: Math.round((total / 1000 / SPEED_KMH[request.effort]) * 60)
		};
	});
}
