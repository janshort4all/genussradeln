/** Nachbewertung eines Wegs: Wie schön ist er? (Gewichte in weights.ts) */
import { resample, segmentLengths, type LngLat } from '$lib/geo/geo';
import type { DetailInterval, RoutePath } from '$lib/routing/graphhopper';
import { climbWordOf, elevationProfile, type ClimbWord } from '$lib/tour/elevation';
import type { FineMap } from './fine';
import type { Landscape } from './landscape';
import type { RoadMask } from './roads';
import { BIG_WATER, ROADSIDE, SAMPLE_STEP_M, SCORE, SHORE_CELLS_FINE, SURROUNDINGS_RADIUS_CELLS } from './weights';

export type { ClimbWord };

export interface RouteStats {
	/** Meter */
	distance: number;
	/** Anteile 0..1 */
	water: number;
	forest: number;
	green: number;
	/** Anteil an Feldern / offener Landschaft */
	fields: number;
	/**
	 * Anteil, der MITTEN durch Wald bzw. Grünes (Park, Wiese, Heide) führt – nicht nur daneben entlang
	 * (siehe Landscape.woodDepthAtCell). Fehlt bei älteren gespeicherten Touren.
	 */
	forestThrough?: number;
	greenThrough?: number;
	/** Anteil direkt am Wasser (Ufer höchstens ca. 100 m entfernt, ohne die Fernsicht auf große Gewässer) */
	shoreWater?: number;
	/** Anteil mit Wasser, Wald, Grün oder Feldern in der Nähe */
	nature: number;
	network: number;
	quiet: number;
	major: number;
	/** Anteil auf Rad-/Fußwegen direkt neben einer großen Straße (laut, obwohl „Radweg“) */
	roadside: number;
	/**
	 * Wie sehr dieser Lärm stört (Anteil, gewichtet nach ROADSIDE): im Grünen weniger, an der Autobahn mehr.
	 * Fehlt bei älteren gespeicherten Touren – dann gilt `roadside`.
	 */
	roadsideNoise?: number;
	badSurface: number;
	climb: ClimbWord;
}

const MAJOR_ROADS = new Set(['trunk', 'primary', 'secondary']);
const QUIET_WAYS = new Set(['cycleway', 'track', 'living_street', 'path']);
/**
 * Wirklich schlechter Belag. Schotter-, Erd- und Feldwege gehören nicht dazu – mit dem E-Bike gut fahrbar und
 * gleichwertig zu Asphalt (Entscheidung Jan, 06.10.2026).
 */
const BAD_SURFACES = new Set(['sand', 'grass', 'cobblestone']);
const BAD_SMOOTHNESS = new Set(['very_bad', 'horrible', 'very_horrible', 'impassable']);

/** Wege, die als eigener Weg eingetragen sein können, obwohl sie direkt neben einer Straße laufen */
const SIDE_WAYS = new Set(['cycleway', 'track', 'path', 'footway', 'pedestrian', 'bridleway', 'service']);
/** erst ab dieser Länge am Stück zählt ein Weg als „neben der Straße“ (Kreuzungen und Brücken nicht) */
const ROADSIDE_MIN_M = 150;

/**
 * Anteil der Strecke auf Rad-/Fußwegen, die über mindestens ROADSIDE_MIN_M am Stück direkt neben einer großen
 * Straße liegen. Geprüft wird alle ca. 20 m.
 */
export function roadsideShare(path: RoutePath, roads: RoadMask): number {
	return roadsideStats(path, roads).share;
}

/**
 * Wie roadsideShare, dazu `noise`: derselbe Anteil, gewichtet danach, wie sehr der Lärm stört (Wunsch Jan,
 * 06.10.2026): mit Wald oder Wasser direkt am Weg nur ROADSIDE.greenFactor (ein Naherholungsgebiet an der
 * Autobahn ist schöner als eine Fahrt durch die Stadt), neben Autobahnen ROADSIDE.motorwayFactor.
 */
export function roadsideStats(path: RoutePath, roads: RoadMask, landscape?: Landscape): { share: number; noise: number } {
	const line = lineOf(path);
	const lengths = segmentLengths(line);
	const total = lengths.reduce((s, d) => s + d, 0);
	if (total <= 0) return { share: 0, noise: 0 };
	const classOf: string[] = [];
	for (const [from, to, value] of path.details.road_class ?? []) for (let i = from; i < to; i++) classOf[i] = value;
	let sum = 0;
	let noise = 0;
	let run = 0;
	let runNoise = 0;
	const endRun = () => {
		if (run >= ROADSIDE_MIN_M) {
			sum += run;
			noise += runNoise;
		}
		run = 0;
		runNoise = 0;
	};
	for (let i = 0; i < lengths.length; i++) {
		const a = line[i];
		const b = line[i + 1];
		const steps = Math.max(1, Math.ceil(lengths[i] / 20));
		let near = SIDE_WAYS.has(classOf[i]);
		for (let s = 0; near && s < steps; s++) {
			const t = (s + 0.5) / steps;
			near = roads.near([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
		}
		if (!near) {
			endRun();
			continue;
		}
		const mid: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
		const around = landscape?.surroundings(mid, SURROUNDINGS_RADIUS_CELLS, BIG_WATER);
		// nur Wald und Wasser gleichen aus – ein Grünstreifen neben der Straße macht sie nicht leiser
		const green = !!around && (around.water || around.forest);
		run += lengths[i];
		runNoise +=
			lengths[i] * (green ? ROADSIDE.greenFactor : 1) * (roads.nearMotorway(mid) ? ROADSIDE.motorwayFactor : 1);
	}
	endRun();
	return { share: Math.min(1, sum / total), noise: Math.min(1, noise / total) };
}

/** Anteil der Strecke (nach Länge), deren Detailwert die Bedingung erfüllt */
export function detailShare<T>(
	intervals: DetailInterval<T>[] | undefined,
	lengths: number[],
	total: number,
	predicate: (value: T) => boolean
): number {
	if (!intervals || total <= 0) return 0;
	let sum = 0;
	for (const [from, to, value] of intervals) {
		if (!predicate(value)) continue;
		for (let i = from; i < to; i++) sum += lengths[i] ?? 0;
	}
	return Math.min(1, sum / total);
}

export function lineOf(path: RoutePath): LngLat[] {
	return path.coordinates.map(([lon, lat]) => [lon, lat]);
}

export function analyzeRoute(path: RoutePath, landscape?: Landscape, roads?: RoadMask, fine?: FineMap): RouteStats {
	const line = lineOf(path);
	const lengths = segmentLengths(line);
	const total = lengths.reduce((s, d) => s + d, 0);
	const d = path.details;

	let water = 0;
	let forest = 0;
	let green = 0;
	let fields = 0;
	let nature = 0;
	let forestThrough = 0;
	let greenThrough = 0;
	let shoreWater = 0;
	const samples = resample(line, SAMPLE_STEP_M);
	if (landscape && samples.length) {
		for (const p of samples) {
			const s = landscape.surroundings(p, SURROUNDINGS_RADIUS_CELLS, BIG_WATER);
			if (s.water) water++;
			if (s.forest) forest++;
			if (s.green) green++;
			if (s.fields) fields++;
			if (s.water || s.forest || s.green || s.fields) nature++;
			// mit der feinen Karte (≈ 21 m) lässt sich „mitten im Wald“ und „direkt am Wasser“ genau sagen,
			// sonst nur grob (≈ 100 m)
			const shore = fine ? fine.nearWater(p, SHORE_CELLS_FINE) : landscape.surroundings(p, SURROUNDINGS_RADIUS_CELLS, null).water;
			if (shore) shoreWater++;
			const wood = fine ? fine.woodDepth(p) : landscape.woodDepth(p);
			if (wood) (wood.kind === 'forest' ? (forestThrough += wood.depth) : (greenThrough += wood.depth));
		}
		water /= samples.length;
		forest /= samples.length;
		green /= samples.length;
		fields /= samples.length;
		nature /= samples.length;
		forestThrough /= samples.length;
		greenThrough /= samples.length;
		shoreWater /= samples.length;
	}

	const { share: roadside, noise: roadsideNoise } = roads ? roadsideStats(path, roads, landscape) : { share: 0, noise: 0 };
	return {
		distance: path.distance,
		water,
		forest,
		green,
		fields,
		forestThrough,
		greenThrough,
		shoreWater,
		nature,
		network: detailShare(d.bike_network, lengths, total, (v) => !!v && v !== 'missing'),
		// Radwege direkt neben großen Straßen sind nicht ruhig
		quiet: Math.max(0, detailShare(d.road_class, lengths, total, (v) => QUIET_WAYS.has(v)) - roadside),
		major: detailShare(d.road_class, lengths, total, (v) => MAJOR_ROADS.has(v)),
		roadside,
		roadsideNoise,
		badSurface: Math.max(
			detailShare(d.surface, lengths, total, (v) => BAD_SURFACES.has(v)),
			detailShare(d.smoothness, lengths, total, (v) => BAD_SMOOTHNESS.has(v))
		),
		climb: climbWordOf(elevationProfile(path.coordinates))
	};
}

/** Schönheitspunkte ohne Berücksichtigung des Umwegs (höher = schöner) */
export function beautyScore(s: RouteStats): number {
	return (
		SCORE.water * s.water +
		SCORE.forest * s.forest +
		SCORE.green * s.green +
		SCORE.fields * s.fields +
		SCORE.through * ((s.forestThrough ?? 0) + (s.greenThrough ?? 0)) +
		SCORE.shore * (s.shoreWater ?? 0) +
		SCORE.network * s.network +
		SCORE.quiet * s.quiet -
		SCORE.major * s.major -
		SCORE.roadside * (s.roadsideNoise ?? s.roadside ?? 0) -
		SCORE.badSurface * s.badSurface
	);
}

/** Längengewichteter Durchschnitt mehrerer Abschnitte (z. B. Hin- und Rückweg) */
export function combineStats(parts: RouteStats[]): RouteStats {
	const total = parts.reduce((s, p) => s + p.distance, 0) || 1;
	const avg = (key: keyof Omit<RouteStats, 'climb' | 'distance'>) =>
		parts.reduce((s, p) => s + (p[key] ?? 0) * p.distance, 0) / total;
	const order: ClimbWord[] = ['flach', 'leicht hügelig', 'hügelig'];
	return {
		distance: total,
		water: avg('water'),
		forest: avg('forest'),
		green: avg('green'),
		fields: avg('fields'),
		forestThrough: avg('forestThrough'),
		greenThrough: avg('greenThrough'),
		shoreWater: avg('shoreWater'),
		nature: avg('nature'),
		network: avg('network'),
		quiet: avg('quiet'),
		major: avg('major'),
		roadside: avg('roadside'),
		// ältere gespeicherte Touren kennen roadsideNoise nicht → dort zählt roadside
		roadsideNoise: parts.reduce((s, p) => s + (p.roadsideNoise ?? p.roadside ?? 0) * p.distance, 0) / total,
		badSurface: avg('badSurface'),
		climb: order[Math.max(...parts.map((p) => order.indexOf(p.climb)))]
	};
}
