/** Wie viel zwei Wege gemeinsam haben – für „verschiedene Vorschläge“ und „auf anderem Weg zurück“ */
import { distance, resample, type LngLat } from '$lib/geo/geo';

const CELL_DEG = 0.0005; // ≈ 35–55 m Raster für die Nachbarschaftssuche
/** Abstand der Prüfpunkte auf dem Weg, der verglichen wird / auf dem Weg, gegen den verglichen wird */
const STEP_A_M = 25;
const STEP_B_M = 10;

const cellKey = (cx: number, cy: number) => cx * 1_000_000 + cy;

// Vergleiche laufen tausendfach über dieselben Wege (Auswahl der Vorschläge): Abtastpunkte und Suchindex je Weg merken.
// Die Wege sind unveränderlich (Arrays werden nie nachträglich geändert).
const samples = new WeakMap<LngLat[], Map<number, LngLat[]>>();
const indexes = new WeakMap<LngLat[], Map<number, LngLat[]>>();

function sampled(line: LngLat[], step: number): LngLat[] {
	let bySpacing = samples.get(line);
	if (!bySpacing) samples.set(line, (bySpacing = new Map()));
	let points = bySpacing.get(step);
	if (!points) bySpacing.set(step, (points = resample(line, step)));
	return points;
}

function indexOf(line: LngLat[]): Map<number, LngLat[]> {
	let index = indexes.get(line);
	if (!index) {
		index = new Map();
		for (const p of sampled(line, STEP_B_M)) {
			const k = cellKey(Math.floor(p[0] / CELL_DEG), Math.floor(p[1] / CELL_DEG));
			const bucket = index.get(k);
			if (bucket) bucket.push(p);
			else index.set(k, [p]);
		}
		indexes.set(line, index);
	}
	return index;
}

/**
 * Anteil (0..1) von Weg `a`, der höchstens `tolerance` Meter neben Weg `b` verläuft.
 * Nicht symmetrisch: overlapShare(kurz, lang) kann 1 sein, umgekehrt nicht.
 */
export function overlapShare(a: LngLat[], b: LngLat[], tolerance = 30): number {
	const pointsA = sampled(a, STEP_A_M);
	if (pointsA.length === 0 || b.length === 0) return 0;
	const index = indexOf(b);
	if (index.size === 0) return 0;

	let near = 0;
	for (const p of pointsA) {
		const cx = Math.floor(p[0] / CELL_DEG);
		const cy = Math.floor(p[1] / CELL_DEG);
		let found = false;
		for (let dx = -1; dx <= 1 && !found; dx++) {
			for (let dy = -1; dy <= 1 && !found; dy++) {
				const bucket = index.get(cellKey(cx + dx, cy + dy));
				if (!bucket) continue;
				for (const q of bucket) {
					if (distance(p, q) <= tolerance) {
						found = true;
						break;
					}
				}
			}
		}
		if (found) near++;
	}
	return near / pointsA.length;
}

/** Symmetrisches Maß: größerer der beiden Anteile */
export function mutualOverlap(a: LngLat[], b: LngLat[], tolerance = 30): number {
	return Math.max(overlapShare(a, b, tolerance), overlapShare(b, a, tolerance));
}
