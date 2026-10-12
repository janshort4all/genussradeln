/**
 * Stopps entlang eines Wegs finden (F9), nach Merkmalen bewerten und übersichtlich ausdünnen.
 * Gewichte in STOP_SCORE (weights.ts).
 */
import { distance, resample, type LngLat } from '$lib/geo/geo';
import { BREAKS, STOP_LIMITS, STOP_RADIUS_M, STOP_SCORE } from '$lib/scoring/weights';
import { openAt } from './hours';
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
	/** Öffnungszeiten (OpenStreetMap-Schreibweise), falls eingetragen */
	hours?: string;
	/** Abstand zum Weg in Metern */
	off?: number;
}

/** Orte zum Einkehren; Hauptpause = Restaurant oder Biergarten, kleine Pause = Café, Bäckerei oder Eis (Jan, 14.10.2026) */
const MAIN: StopKind[] = ['restaurant', 'biergarten'];
const SMALL: StopKind[] = ['cafe', 'baeckerei', 'eis'];
const FOOD: StopKind[] = [...MAIN, ...SMALL];
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
		hours: poi.hours,
		off: Math.round(off),
		...rate(poi, off)
	}));

	const ofKind = (...kinds: StopKind[]) => all.filter((s) => kinds.includes(s.kind));
	const top = (stops: RouteStop[], max: number) => [...stops].sort((a, b) => b.score - a.score).slice(0, max);

	const chosen = [
		// alle Orte zum Einkehren bleiben erhalten (pauseStops wählt daraus die wenigen sinnvollen aus) – je 1 km der beste
		...bestPerWindow(ofKind(...FOOD), 1),
		...bestPerWindow(ofKind('toilette'), STOP_LIMITS.toiletWindowKm),
		...top(ofKind('aussicht'), STOP_LIMITS.viewMax),
		...top(ofKind('laden'), STOP_LIMITS.chargingMax),
		...bestPerWindow(ofKind('rast'), STOP_LIMITS.restWindowKm),
		...bestPerWindow(ofKind('bank'), STOP_LIMITS.benchWindowKm)
	];
	return chosen.sort((a, b) => a.km - b.km);
}

/** Beginn der Fahrt für die Öffnungszeiten: jetzt, wenn es tagsüber ist, sonst am nächsten Morgen um 10 Uhr */
export function rideStart(now: Date = new Date()): Date {
	const hour = now.getHours();
	if (hour >= BREAKS.nowFromHour && hour < BREAKS.nowToHour) return now;
	const start = new Date(now);
	if (hour >= BREAKS.nowToHour) start.setDate(start.getDate() + 1);
	start.setHours(BREAKS.defaultStartHour, 0, 0, 0);
	return start;
}

type Pausable = { km: number; kind: StopKind; score?: number; hours?: string; off?: number };

/** Hinweis zum Ort („geöffnet bis 18:00“) – nur wenn die Öffnungszeiten bekannt sind und der Ort bei der Ankunft offen hat */
function openNote(stop: Pausable, start: Date): string | undefined {
	const info = openAt(stop.hours, new Date(start.getTime() + (stop.km / BREAKS.speedKmh) * 3600_000));
	return info.state === 'open' && info.closesAt ? `geöffnet bis ${info.closesAt} Uhr` : undefined;
}

/**
 * Die wenigen Pausen fürs Tourdetail (Jan, 14.10.2026): eine Hauptpause (Restaurant, Biergarten) bei etwa der Hälfte der Strecke,
 * bei längeren Touren dazu eine kleine Pause (Café, Bäckerei, Eis) am Nachmittag, bei sehr langen noch eine am Vormittag. Orte, die bei der Ankunft
 * geschlossen haben (Öffnungszeiten bekannt), fallen weg; unbekannte Zeiten zählen etwas weniger. Dazu höchstens eine Aussicht.
 * Parameter now: für die Öffnungszeiten (die Ankunft ergibt sich aus Kilometer und Tempo).
 */
export function pauseStops<T extends Pausable>(stops: T[], totalKm: number, now: Date = new Date()): (T & { note?: string })[] {
	const start = rideStart(now);
	const eta = (km: number) => new Date(start.getTime() + (km / BREAKS.speedKmh) * 3600_000);
	const usable = stops.filter((s) => {
		const share = totalKm > 0 ? s.km / totalKm : 0;
		if (share < BREAKS.skipStartShare || share > 1 - BREAKS.skipEndShare) return false;
		return FOOD.includes(s.kind) && openAt(s.hours, eta(s.km)).state !== 'closed';
	});

	const wanted: { center: number; main: boolean }[] = [{ center: BREAKS.mainCenter, main: true }];
	if (totalKm >= BREAKS.twoFromKm) wanted.push({ center: BREAKS.smallCenters[0], main: false });
	if (totalKm >= BREAKS.threeFromKm) wanted.push({ center: BREAKS.smallCenters[1], main: false });

	const apart = Math.min(BREAKS.minApartKm, BREAKS.minApartShare * totalKm);
	const chosen: T[] = [];
	for (const { center, main } of wanted) {
		const half = main ? BREAKS.mainHalfWidth : BREAKS.smallHalfWidth;
		for (const factor of [1, BREAKS.widen]) {
			const width = half * factor;
			let best: T | undefined;
			let bestScore = -Infinity;
			for (const s of usable) {
				const share = s.km / totalKm;
				if (Math.abs(share - center) > width) continue;
				// kleine Pause: Café, Bäckerei oder Eis – Restaurants und Biergärten sind Hauptpausen (Jan, 14.10.2026)
				if (!main && MAIN.includes(s.kind)) continue;
				if (chosen.some((c) => Math.abs(c.km - s.km) < apart)) continue;
				const kind = main
					? MAIN.includes(s.kind)
						? BREAKS.mainKindBonus
						: s.kind === 'cafe'
							? BREAKS.cafeAsMainBonus
							: 0
					: (BREAKS.smallKindBonus[s.kind] ?? 0);
				const info = openAt(s.hours, eta(s.km));
				const score =
					(s.score ?? 0) +
					kind +
					BREAKS.centerBonus * (1 - Math.abs(share - center) / width) +
					(info.state === 'open' ? BREAKS.openBonus : info.state === 'unknown' ? BREAKS.unknownHours : 0);
				if (score > bestScore) {
					bestScore = score;
					best = s;
				}
			}
			if (best) {
				chosen.push(best);
				break;
			}
		}
	}

	// Eine schöne Aussicht dazu, wenn es nur wenige Pausen sind (Bänke, Rastplätze sieht man unterwegs selbst)
	if (chosen.length < 3) {
		const view = stops
			.filter((s) => s.kind === 'aussicht')
			.filter((s) => s.km / totalKm >= BREAKS.skipStartShare && s.km / totalKm <= 1 - BREAKS.skipEndShare)
			.filter((s) => chosen.every((c) => Math.abs(c.km - s.km) >= 2))
			.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
		if (view) chosen.push(view);
	}
	return chosen.sort((a, b) => a.km - b.km).map((s) => ({ ...s, note: openNote(s, start) }));
}

/** „Toiletten gibt es nach 3 und nach 24 km.“ – oder nichts, wenn keine am Weg liegen */
export function toiletSentence(stops: { km: number; kind: StopKind }[], max = 3): string | undefined {
	const kms = stops.filter((s) => s.kind === 'toilette').slice(0, max).map((s) => Math.round(s.km));
	const unique = [...new Set(kms)].map((km) => `nach ${km}`);
	if (!unique.length) return undefined;
	const list = unique.length > 1 ? `${unique.slice(0, -1).join(', ')} und ${unique.at(-1)}` : unique[0];
	return unique.length > 1 ? `Toiletten gibt es ${list} km.` : `Eine Toilette gibt es ${list} km.`;
}

/** Ab dieser Strecke ohne Café, Eis oder Biergarten weist das Tourdetail darauf hin */
const LONG_GAP_KM = 12;

/**
 * Hinweis, wo man unterwegs lange nirgends einkehren kann (längste Lücke ohne Café, Eis oder Biergarten,
 * ab LONG_GAP_KM) – sonst nichts. Nennt die Stelle, damit klar ist, dass er zu genau diesem Weg gehört.
 */
export function foodGapNote(stops: { km: number; kind: StopKind }[], totalKm: number): string | undefined {
	const food = stops.filter((s) => FOOD.includes(s.kind)).map((s) => s.km).sort((a, b) => a - b);
	if (!food.length) {
		return totalKm >= LONG_GAP_KM ? 'Direkt am Weg gibt es keine Einkehr – am besten etwas zu trinken mitnehmen.' : undefined;
	}
	const points = [0, ...food, totalKm];
	let from = 0;
	let to = 0;
	for (let i = 1; i < points.length; i++) {
		if (points[i] - points[i - 1] > to - from) [from, to] = [points[i - 1], points[i]];
	}
	const length = Math.round(to - from);
	if (to - from < LONG_GAP_KM) return undefined;
	if (from === 0) return `Auf den ersten ${length} km keine Einkehrmöglichkeit.`;
	if (to === totalKm) return `Auf den letzten ${length} km keine Einkehrmöglichkeit.`;
	return `Zwischen km ${Math.round(from)} und km ${Math.round(to)} keine Einkehrmöglichkeit.`;
}
