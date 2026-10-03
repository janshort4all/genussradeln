/**
 * Zieltour planen: der schönste Weg von A nach B (F3, Schwerpunkt der App).
 *
 * 1. Direkter genuss-Weg + GraphHopper-Alternativen
 * 2. Je nach Umweg-Wunsch zusätzliche Wege über schöne Zwischenpunkte (Wasser, Wald, Grün aus der Landschaftskarte)
 * 3. Nachbewertung (score.ts), Mehrweg begrenzen, die besten untereinander verschiedenen Wege auswählen
 * 4. Bei „auf anderem Weg zurück“: Rückweg ebenso planen und Paare mit wenig Überschneidung bilden
 */
import { distance, distanceToLine, resample, type LngLat } from '$lib/geo/geo';
import type { Landscape } from '$lib/scoring/landscape';
import { WATER } from '$lib/scoring/landscape';
import { mutualOverlap, overlapShare } from '$lib/scoring/overlap';
import { analyzeRoute, beautyScore, combineStats, lineOf, type RouteStats } from '$lib/scoring/score';
import {
	BEAUTY_CLASS_WEIGHTS,
	DETOUR,
	DIVERSITY_MAX_OVERLAP,
	MAX_SUGGESTIONS,
	SCORE,
	SPEED_KMH,
	VIA_SEARCH
} from '$lib/scoring/weights';
import { newTourId, type PlannedTour, type TourRequest, type Waypoint } from '$lib/tour/model';
import { highlightSentence, titleOptions } from './describe';
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
	/** Bewertung inkl. Abzug für Umweg */
	score: number;
}

interface DirectionResult {
	candidates: LegCandidate[];
	/** Länge des direkten genuss-Wegs */
	directDistance: number;
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

	const found: { point: LngLat; beauty: number }[] = [];
	for (let row = r0; row <= r1; row += step) {
		for (let col = c0; col <= c1; col += step) {
			// Zwischenpunkt auf festem Boden, nicht mitten im See
			if (landscape.cell(row, col) === WATER) continue;
			const point = landscape.cellCenter(row, col);
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

	const paths: { path: RoutePath; vias: LngLat[] }[] = direct.map((path) => ({ path, vias: [] }));

	if (deps.landscape && level.scenicVias > 0) {
		const vias = findScenicVias(deps.landscape, from, to, maxLength, lineOf(direct[0]), level.scenicVias);
		const viaPaths = await mapLimited(vias, 4, async (via) => {
			try {
				const [path] = await deps.route([from, via, to], options);
				return path ? { path, vias: [via] } : undefined;
			} catch (error) {
				if (error instanceof NoRouteError) return undefined; // Zwischenpunkt nicht erreichbar → weglassen
				throw error;
			}
		});
		for (const p of viaPaths) if (p) paths.push(p);
	}

	const candidates = paths
		.filter(({ path }) => path.distance <= maxLength)
		.map(({ path, vias }) => {
			const stats = analyzeRoute(path, deps.landscape);
			const extraRatio = Math.max(0, path.distance / directDistance - 1);
			return {
				path,
				line: lineOf(path),
				stats,
				vias,
				score: beautyScore(stats) - level.detourPenalty * extraRatio
			};
		})
		.sort((a, b) => b.score - a.score);

	return { candidates, directDistance };
}

/** Die besten Einträge wählen, die sich untereinander deutlich unterscheiden */
function pickDiverse<T>(items: T[], lineOf: (item: T) => LngLat[], max: number): T[] {
	const picked: T[] = [];
	for (const item of items) {
		if (picked.length >= max) break;
		const line = lineOf(item);
		if (picked.some((p) => mutualOverlap(line, lineOf(p)) > DIVERSITY_MAX_OVERLAP)) continue;
		picked.push(item);
	}
	return picked;
}

interface Combination {
	legs: LegCandidate[];
	score: number;
	line: LngLat[];
}

/** Hauptfunktion: Vorschläge für eine Zieltour */
export async function planTours(request: TourRequest, deps: PlanDeps): Promise<PlannedTour[]> {
	const start = request.start.lngLat;
	const end = request.destination.lngLat;

	const outbound = await planDirection(start, end, request, deps);
	let combinations: Combination[];
	let directTotal = outbound.directDistance;

	if (request.returnMode === 'other-way') {
		const inbound = await planDirection(end, start, request, deps);
		directTotal += inbound.directDistance;
		combinations = [];
		for (const out of outbound.candidates.slice(0, 6)) {
			for (const back of inbound.candidates.slice(0, 6)) {
				const shared = overlapShare(back.line, out.line);
				const total = out.path.distance + back.path.distance;
				const score =
					(out.score * out.path.distance + back.score * back.path.distance) / total -
					SCORE.returnOverlap * shared;
				combinations.push({ legs: [out, back], score, line: [...out.line, ...back.line] });
			}
		}
		combinations.sort((a, b) => b.score - a.score);
	} else {
		combinations = outbound.candidates.map((c) => ({ legs: [c], score: c.score, line: c.line }));
	}

	const chosen = pickDiverse(combinations, (c) => c.line, MAX_SUGGESTIONS);
	if (!chosen.length) throw new NoRouteError('Kein passender Weg gefunden');

	const shortest = Math.min(...chosen.map((c) => c.legs.reduce((s, l) => s + l.path.distance, 0)));
	const usedTitles = new Set<string>();

	return chosen.map((combo, index) => {
		const stats = combineStats(combo.legs.map((l) => l.stats));
		const total = stats.distance;
		const title = titleOptions(stats).find((t) => !usedTitles.has(t)) ?? `Variante ${index + 1}`;
		usedTitles.add(title);

		let label: string | undefined;
		if (index === 0) label = 'Am schönsten';
		else if (total === shortest) label = 'Am kürzesten';

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
			highlight: highlightSentence(stats),
			request,
			waypoints,
			legs: combo.legs.map((l) => ({ coordinates: l.path.coordinates, distance: l.path.distance })),
			stats,
			extraDistance: Math.max(0, total - directTotal),
			minutes: Math.round((total / 1000 / SPEED_KMH[request.effort]) * 60)
		};
	});
}
