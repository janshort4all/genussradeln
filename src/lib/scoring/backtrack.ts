/**
 * „Stummel“ erkennen: Abschnitte, die ein Weg hin und gleich wieder zurück fährt
 * (z. B. weil ein Zwischenpunkt am Ende einer Sackgasse liegt).
 * Ein normales Kreuzen des eigenen Wegs zählt nur wenige Meter und fällt nicht ins Gewicht.
 */
import { distance, resample, type LngLat } from '$lib/geo/geo';

const STEP_M = 20;
/** so nah müssen zwei Stellen beieinander liegen, um als „dieselbe Stelle“ zu gelten */
const SAME_PLACE_M = 15;
/** erst so weit später auf dem Weg zählt ein Wiederkehren (sonst wäre jeder Nachbarpunkt „doppelt“) */
const MIN_GAP_M = 120;
const CELL_DEG = 0.0003; // ≈ 20–33 m Raster für die Nachbarschaftssuche

/** Meter, die der Weg später noch einmal befährt */
export function backtrackMeters(line: LngLat[]): number {
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
	points.forEach((p, i) => {
		const cx = Math.floor(p[0] / CELL_DEG);
		const cy = Math.floor(p[1] / CELL_DEG);
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				for (const j of cells.get(key(cx + dx, cy + dy)) ?? []) {
					if (j - i >= gap && distance(p, points[j]) <= SAME_PLACE_M) {
						revisited++;
						return;
					}
				}
			}
		}
	});
	return revisited * STEP_M;
}
