/** Nachbewertung eines Wegs: Wie schön ist er? (Gewichte in weights.ts) */
import { resample, segmentLengths, type LngLat } from '$lib/geo/geo';
import type { DetailInterval, RoutePath } from '$lib/routing/graphhopper';
import { climbWordOf, elevationProfile, type ClimbWord } from '$lib/tour/elevation';
import type { Landscape } from './landscape';
import type { RoadMask } from './roads';
import { BIG_WATER, SAMPLE_STEP_M, SCORE, SURROUNDINGS_RADIUS_CELLS } from './weights';

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
	/** Anteil mit Wasser, Wald, Grün oder Feldern in der Nähe */
	nature: number;
	network: number;
	quiet: number;
	major: number;
	/** Anteil auf Rad-/Fußwegen direkt neben einer großen Straße (laut, obwohl „Radweg“) */
	roadside: number;
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
	const line = lineOf(path);
	const lengths = segmentLengths(line);
	const total = lengths.reduce((s, d) => s + d, 0);
	if (total <= 0) return 0;
	const classOf: string[] = [];
	for (const [from, to, value] of path.details.road_class ?? []) for (let i = from; i < to; i++) classOf[i] = value;
	let sum = 0;
	let run = 0;
	for (let i = 0; i < lengths.length; i++) {
		const a = line[i];
		const b = line[i + 1];
		const steps = Math.max(1, Math.ceil(lengths[i] / 20));
		let near = SIDE_WAYS.has(classOf[i]);
		for (let s = 0; near && s < steps; s++) {
			const t = (s + 0.5) / steps;
			near = roads.near([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
		}
		if (near) run += lengths[i];
		else {
			if (run >= ROADSIDE_MIN_M) sum += run;
			run = 0;
		}
	}
	if (run >= ROADSIDE_MIN_M) sum += run;
	return Math.min(1, sum / total);
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

export function analyzeRoute(path: RoutePath, landscape?: Landscape, roads?: RoadMask): RouteStats {
	const line = lineOf(path);
	const lengths = segmentLengths(line);
	const total = lengths.reduce((s, d) => s + d, 0);
	const d = path.details;

	let water = 0;
	let forest = 0;
	let green = 0;
	let fields = 0;
	let nature = 0;
	const samples = resample(line, SAMPLE_STEP_M);
	if (landscape && samples.length) {
		for (const p of samples) {
			const s = landscape.surroundings(p, SURROUNDINGS_RADIUS_CELLS, BIG_WATER);
			if (s.water) water++;
			if (s.forest) forest++;
			if (s.green) green++;
			if (s.fields) fields++;
			if (s.water || s.forest || s.green || s.fields) nature++;
		}
		water /= samples.length;
		forest /= samples.length;
		green /= samples.length;
		fields /= samples.length;
		nature /= samples.length;
	}

	const roadside = roads ? roadsideShare(path, roads) : 0;
	return {
		distance: path.distance,
		water,
		forest,
		green,
		fields,
		nature,
		network: detailShare(d.bike_network, lengths, total, (v) => !!v && v !== 'missing'),
		// Radwege direkt neben großen Straßen sind nicht ruhig
		quiet: Math.max(0, detailShare(d.road_class, lengths, total, (v) => QUIET_WAYS.has(v)) - roadside),
		major: detailShare(d.road_class, lengths, total, (v) => MAJOR_ROADS.has(v)),
		roadside,
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
		SCORE.network * s.network +
		SCORE.quiet * s.quiet -
		SCORE.major * s.major -
		SCORE.roadside * (s.roadside ?? 0) -
		SCORE.badSurface * s.badSurface
	);
}

/** Längengewichteter Durchschnitt mehrerer Abschnitte (z. B. Hin- und Rückweg) */
export function combineStats(parts: RouteStats[]): RouteStats {
	const total = parts.reduce((s, p) => s + p.distance, 0) || 1;
	const avg = (key: keyof Omit<RouteStats, 'climb' | 'distance'>) =>
		parts.reduce((s, p) => s + p[key] * p.distance, 0) / total;
	const order: ClimbWord[] = ['flach', 'leicht hügelig', 'hügelig'];
	return {
		distance: total,
		water: avg('water'),
		forest: avg('forest'),
		green: avg('green'),
		fields: avg('fields'),
		nature: avg('nature'),
		network: avg('network'),
		quiet: avg('quiet'),
		major: avg('major'),
		roadside: avg('roadside'),
		badSurface: avg('badSurface'),
		climb: order[Math.max(...parts.map((p) => order.indexOf(p.climb)))]
	};
}
