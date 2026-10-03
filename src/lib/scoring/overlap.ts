/** Wie viel zwei Wege gemeinsam haben – für „verschiedene Vorschläge“ und „auf anderem Weg zurück“ */
import { distance, resample, type LngLat } from '$lib/geo/geo';

const CELL_DEG = 0.0005; // ≈ 35–55 m Raster für die Nachbarschaftssuche

function key(lon: number, lat: number): string {
	return `${Math.floor(lon / CELL_DEG)}:${Math.floor(lat / CELL_DEG)}`;
}

/**
 * Anteil (0..1) von Weg `a`, der höchstens `tolerance` Meter neben Weg `b` verläuft.
 * Nicht symmetrisch: overlapShare(kurz, lang) kann 1 sein, umgekehrt nicht.
 */
export function overlapShare(a: LngLat[], b: LngLat[], tolerance = 30): number {
	const pointsA = resample(a, 25);
	const pointsB = resample(b, 10);
	if (pointsA.length === 0 || pointsB.length === 0) return 0;

	const index = new Map<string, LngLat[]>();
	for (const p of pointsB) {
		const k = key(p[0], p[1]);
		const bucket = index.get(k);
		if (bucket) bucket.push(p);
		else index.set(k, [p]);
	}

	let near = 0;
	for (const p of pointsA) {
		const cx = Math.floor(p[0] / CELL_DEG);
		const cy = Math.floor(p[1] / CELL_DEG);
		let found = false;
		for (let dx = -1; dx <= 1 && !found; dx++) {
			for (let dy = -1; dy <= 1 && !found; dy++) {
				for (const q of index.get(`${cx + dx}:${cy + dy}`) ?? []) {
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
