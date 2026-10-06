/**
 * „Stummel“ und „Lasso“ erkennen: Abschnitte, die ein Weg hin und gleich wieder zurück fährt
 * (z. B. weil ein Zwischenpunkt am Ende einer Sackgasse liegt oder der Weg eine Runde um ihn dreht).
 * Ein normales Kreuzen des eigenen Wegs zählt nur 20–40 m und fällt nicht ins Gewicht.
 */
import { distance, resample, type LngLat } from '$lib/geo/geo';

const STEP_M = 20;
/** so nah müssen zwei Stellen beieinander liegen, um als „dieselbe Stelle“ zu gelten */
const SAME_PLACE_M = 15;
/** erst so weit später auf dem Weg zählt ein Wiederkehren (sonst wäre jeder Nachbarpunkt „doppelt“) */
const MIN_GAP_M = 120;
const CELL_DEG = 0.0003; // ≈ 20–33 m Raster für die Nachbarschaftssuche

export interface Backtrack {
	/** Meter, die der Weg später noch einmal befährt */
	meters: number;
	/** wo das doppelt gefahrene Stück beginnt (die Abzweigung in Sackgasse bzw. Schleife) */
	start?: LngLat;
}

export function findBacktrack(line: LngLat[]): Backtrack {
	const points = resample(line, STEP_M);
	const gap = Math.ceil(MIN_GAP_M / STEP_M);
	const cells = new Map<string, number[]>();
	const key = (x: number, y: number) => `${x}:${y}`;
	points.forEach(([lon, lat], i) => {
		const k = key(Math.floor(lon / CELL_DEG), Math.floor(lat / CELL_DEG));
		const bucket = cells.get(k);
		if (bucket) bucket.push(i);
		else cells.set(k, [i]);
	});

	let revisited = 0;
	let start: LngLat | undefined;
	points.forEach((p, i) => {
		const cx = Math.floor(p[0] / CELL_DEG);
		const cy = Math.floor(p[1] / CELL_DEG);
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				for (const j of cells.get(key(cx + dx, cy + dy)) ?? []) {
					if (j - i >= gap && distance(p, points[j]) <= SAME_PLACE_M) {
						revisited++;
						start ??= p;
						return;
					}
				}
			}
		}
	});
	return { meters: revisited * STEP_M, start };
}

/** Meter, die der Weg später noch einmal befährt */
export function backtrackMeters(line: LngLat[]): number {
	return findBacktrack(line).meters;
}

/** Schleifen ab dieser Länge zählen (kürzere sind Eigenheiten der Kartendaten an Kreuzungen) */
const MIN_LOOP_M = 150;

export interface Loop {
	/** Länge der Schleife in Metern */
	meters: number;
	/** wo sich der Weg selbst kreuzt */
	at: LngLat;
}

/** Schnittpunkt zweier Strecken (Ränder zählen mit: ein Weg, der eine Kreuzung zweimal befährt, schneidet sich dort) */
function intersection(a: LngLat, b: LngLat, c: LngLat, d: LngLat): LngLat | undefined {
	const r = [b[0] - a[0], b[1] - a[1]];
	const s = [d[0] - c[0], d[1] - c[1]];
	const denom = r[0] * s[1] - r[1] * s[0];
	if (denom === 0) return undefined;
	const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / denom;
	const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / denom;
	const eps = 1e-9;
	if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return undefined;
	return [a[0] + t * r[0], a[1] + t * r[1]];
}

/**
 * Fährt der Weg im Kreis? Ein Weg von A nach B, der seine eigene Strecke kreuzt, dreht dazwischen eine Runde
 * (z. B. einmal um einen See und zurück zur selben Kreuzung) – die hätte man sich sparen können.
 * Liefert die größte solche Schleife.
 */
export function findLoop(line: LngLat[]): Loop | undefined {
	const cum = [0];
	for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distance(line[i - 1], line[i]));
	let best: Loop | undefined;
	for (let i = 0; i + 1 < line.length; i++) {
		const a = line[i];
		const b = line[i + 1];
		const minLon = Math.min(a[0], b[0]);
		const maxLon = Math.max(a[0], b[0]);
		const minLat = Math.min(a[1], b[1]);
		const maxLat = Math.max(a[1], b[1]);
		for (let j = i + 2; j + 1 < line.length; j++) {
			if (cum[j] - cum[i + 1] < MIN_LOOP_M) continue;
			const c = line[j];
			const d = line[j + 1];
			if (Math.max(c[0], d[0]) < minLon || Math.min(c[0], d[0]) > maxLon) continue;
			if (Math.max(c[1], d[1]) < minLat || Math.min(c[1], d[1]) > maxLat) continue;
			const at = intersection(a, b, c, d);
			if (!at) continue;
			const meters = cum[j] + distance(c, at) - (cum[i] + distance(a, at));
			if (meters >= MIN_LOOP_M && (!best || meters > best.meters)) best = { meters, at };
		}
	}
	return best;
}

/** „Zipfel“: so nah kommt der Weg an eine frühere Stelle zurück … */
const SPUR_NEAR_M = 60;
/** … nachdem er mindestens so weit gefahren ist */
const SPUR_MIN_M = 400; // Brückenrampen (Schleife hinauf) sind ca. 300 m – die sind kein Zipfel
const SPUR_STEP_M = 20;
const SPUR_CELL_DEG = 0.001; // ≈ 70–110 m

export interface Spur {
	/** Meter, die der Weg hinein- und wieder herausfährt */
	meters: number;
	/** wo der Zipfel beginnt */
	at: LngLat;
}

/**
 * Fährt der Weg in einen „Zipfel“ – ein Stück hinein und auf einem anderen, parallelen Weg wieder zurück
 * (z. B. um einen Hilfspunkt am Seeufer und zurück)? findBacktrack erkennt nur das Zurück auf demselben Weg,
 * findLoop nur das Kreuzen. Liefert den längsten Zipfel.
 */
export function findSpur(line: LngLat[]): Spur | undefined {
	const points = resample(line, SPUR_STEP_M);
	const gap = Math.ceil(SPUR_MIN_M / SPUR_STEP_M);
	const cells = new Map<string, number[]>();
	const key = (x: number, y: number) => `${x}:${y}`;
	points.forEach(([lon, lat], i) => {
		const k = key(Math.floor(lon / SPUR_CELL_DEG), Math.floor(lat / SPUR_CELL_DEG));
		const bucket = cells.get(k);
		if (bucket) bucket.push(i);
		else cells.set(k, [i]);
	});
	let best: Spur | undefined;
	for (let i = 0; i < points.length; i++) {
		const p = points[i];
		const cx = Math.floor(p[0] / SPUR_CELL_DEG);
		const cy = Math.floor(p[1] / SPUR_CELL_DEG);
		let last = -1;
		for (let dx = -1; dx <= 1; dx++)
			for (let dy = -1; dy <= 1; dy++)
				for (const j of cells.get(key(cx + dx, cy + dy)) ?? [])
					if (j - i >= gap && j > last && distance(p, points[j]) <= SPUR_NEAR_M) last = j;
		if (last < 0) continue;
		const meters = (last - i) * SPUR_STEP_M;
		if (!best || meters > best.meters) best = { meters, at: p };
		i = last; // dieser Zipfel ist erfasst
	}
	return best;
}
