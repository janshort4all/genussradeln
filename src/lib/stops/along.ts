/**
 * Stopps entlang eines Wegs finden (F9), nach Merkmalen bewerten und übersichtlich ausdünnen.
 * Gewichte in STOP_SCORE (weights.ts).
 */
import { distance, resample, type LngLat } from '$lib/geo/geo';
import { STOP_LIMITS, STOP_RADIUS_M, STOP_SCORE } from '$lib/scoring/weights';
import { FLAG, hasFlag, type StopKind } from './kinds';
import type { Poi, PoiIndex } from './pois';

export interface RouteStop {
	id: string;
	/** Kilometer ab Start entlang des Wegs */
	km: number;
	lngLat: LngLat;
	kind: StopKind;
	name?: string;
	/** Gründe in Worten, z. B. „mit Plätzen draußen“, „am Wasser“ */
	reasons: string[];
	score: number;
}

const FOOD: StopKind[] = ['cafe', 'eis', 'biergarten'];
const STEP_M = 25;

function rate(poi: Poi, offRoute: number): { score: number; reasons: string[] } {
	const reasons: string[] = [];
	let score = STOP_SCORE.base[poi.kind];
	const food = FOOD.includes(poi.kind);

	if (food && hasFlag(poi.flags, FLAG.outdoor)) {
		score += STOP_SCORE.outdoor;
		if (poi.kind !== 'biergarten') reasons.push('mit Plätzen draußen');
	}
	// Lage genau aus den echten Ufer-/Waldrändern (scripts/fetch-pois.ts): höchstens ca. 60 m,
	// Wasser nur als Fläche (See, Teich, großer Fluss) – kein Bach oder Graben
	if (hasFlag(poi.flags, FLAG.waterside)) {
		score += STOP_SCORE.water;
		reasons.push('am Wasser');
	} else if (hasFlag(poi.flags, FLAG.forestside)) {
		score += STOP_SCORE.greenOrForest;
		reasons.push('am Wald');
	} else if (hasFlag(poi.flags, FLAG.greenside)) {
		score += STOP_SCORE.greenOrForest;
		reasons.push('im Grünen');
	}
	if (food && hasFlag(poi.flags, FLAG.website)) score += STOP_SCORE.wellMaintained;
	if (food && hasFlag(poi.flags, FLAG.hours)) score += STOP_SCORE.wellMaintained;
	if (hasFlag(poi.flags, FLAG.wheelchair)) {
		score += STOP_SCORE.wheelchair;
		reasons.push('barrierefrei');
	}
	if (poi.kind === 'bank' && hasFlag(poi.flags, FLAG.backrest)) {
		score += STOP_SCORE.backrest;
		reasons.push('mit Lehne');
	}
	if (poi.kind === 'rast' && hasFlag(poi.flags, FLAG.covered)) {
		score += STOP_SCORE.covered;
		reasons.push('überdacht');
	}
	// lieber direkt am Weg als 200 m daneben
	score -= STOP_SCORE.offRoutePer100m * (offRoute / 100);
	return { score, reasons };
}

/** Höchstens ein Stopp je Abschnitt von `windowKm`, der beste gewinnt */
function bestPerWindow(stops: RouteStop[], windowKm: number): RouteStop[] {
	const best = new Map<number, RouteStop>();
	for (const stop of stops) {
		const window = Math.floor(stop.km / windowKm);
		const current = best.get(window);
		if (!current || stop.score > current.score) best.set(window, stop);
	}
	return [...best.values()];
}

export function stopsAlongRoute(line: LngLat[], index: PoiIndex): RouteStop[] {
	const samples = resample(line, STEP_M);
	const maxRadius = Math.max(...Object.values(STOP_RADIUS_M));

	// je Stopp: nächster Punkt auf dem Weg
	const found = new Map<string, { poi: Poi; km: number; off: number }>();
	samples.forEach((point, i) => {
		const km = (i * STEP_M) / 1000;
		for (const poi of index.near(point, maxRadius)) {
			const off = distance(point, poi.lngLat);
			if (off > STOP_RADIUS_M[poi.kind]) continue;
			const known = found.get(poi.id);
			if (!known || off < known.off) found.set(poi.id, { poi, km, off });
		}
	});

	// Stopps direkt am Start braucht niemand – dort ist man ja gerade
	const all: RouteStop[] = [...found.values()].filter(({ km }) => km >= STOP_LIMITS.skipStartKm).map(({ poi, km, off }) => ({
		id: poi.id,
		km: Math.round(km * 10) / 10,
		lngLat: poi.lngLat,
		kind: poi.kind,
		name: poi.name,
		...rate(poi, off)
	}));

	const ofKind = (...kinds: StopKind[]) => all.filter((s) => kinds.includes(s.kind));
	const top = (stops: RouteStop[], max: number) => [...stops].sort((a, b) => b.score - a.score).slice(0, max);

	const chosen = [
		...top(bestPerWindow(ofKind(...FOOD), STOP_LIMITS.foodWindowKm), STOP_LIMITS.foodMax),
		...bestPerWindow(ofKind('toilette'), STOP_LIMITS.toiletWindowKm),
		...top(ofKind('aussicht'), STOP_LIMITS.viewMax),
		...top(ofKind('laden'), STOP_LIMITS.chargingMax),
		...bestPerWindow(ofKind('rast'), STOP_LIMITS.restWindowKm),
		...bestPerWindow(ofKind('bank'), STOP_LIMITS.benchWindowKm)
	];
	return chosen.sort((a, b) => a.km - b.km);
}

/** Stopps, für die man gern anhält (Einkehr und Aussicht) – Bänke, Rastplätze usw. sieht man unterwegs selbst */
const WORTH_A_STOP: StopKind[] = [...FOOD, 'aussicht'];

/**
 * Die wenigen Stopps fürs Tourdetail: höchstens `max` Orte zum Einkehren oder Schauen, die besten zuerst
 * ausgewählt, dann nach Kilometer sortiert.
 */
export function highlightStops<T extends { km: number; kind: StopKind; score?: number }>(stops: T[], max = 3): T[] {
	return stops
		.filter((s) => WORTH_A_STOP.includes(s.kind))
		.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
		.slice(0, max)
		.sort((a, b) => a.km - b.km);
}

/** „Toiletten gibt es nach 3 und nach 24 km.“ – oder nichts, wenn keine am Weg liegen */
export function toiletSentence(stops: { km: number; kind: StopKind }[], max = 3): string | undefined {
	const kms = stops.filter((s) => s.kind === 'toilette').slice(0, max).map((s) => Math.round(s.km));
	const unique = [...new Set(kms)].map((km) => `nach ${km}`);
	if (!unique.length) return undefined;
	const list = unique.length > 1 ? `${unique.slice(0, -1).join(', ')} und ${unique.at(-1)}` : unique[0];
	return unique.length > 1 ? `Toiletten gibt es ${list} km.` : `Eine Toilette gibt es ${list} km.`;
}
