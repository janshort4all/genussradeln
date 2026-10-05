/**
 * Genaue Nähe zu Wasser, Wald und Grünflächen für einzelne Punkte (z. B. Stopps), aus den echten
 * OSM-Geometrien der Landschaftsdaten – genauer als das 100-m-Raster der Landschaftskarte.
 */
import type { OsmElement } from './osm-file.ts';

type Point = [number, number];
export type NearbyClass = 'water' | 'forest' | 'green';

interface Shape {
	cls: NearbyClass;
	rings: Point[][];
	area: boolean;
	bbox: [number, number, number, number];
}

const CELL = 0.01;

export class NearbyIndex {
	private readonly cells = new Map<string, Shape[]>();

	add(element: OsmElement, cls: NearbyClass, area: boolean) {
		const rings =
			element.type === 'way'
				? [toPoints(element.geometry)]
				: (element.members ?? []).filter((m) => m.type === 'way').map((m) => toPoints(m.geometry));
		const valid = rings.filter((r) => r.length > 1);
		if (!valid.length) return;
		const xs = valid.flatMap((r) => r.map((p) => p[0]));
		const ys = valid.flatMap((r) => r.map((p) => p[1]));
		const shape: Shape = { cls, rings: valid, area, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
		for (let x = Math.floor(shape.bbox[0] / CELL); x <= Math.floor(shape.bbox[2] / CELL); x++) {
			for (let y = Math.floor(shape.bbox[1] / CELL); y <= Math.floor(shape.bbox[3] / CELL); y++) {
				const key = `${x}:${y}`;
				const bucket = this.cells.get(key);
				if (bucket) bucket.push(shape);
				else this.cells.set(key, [shape]);
			}
		}
	}

	/** Abstand in Metern zur nächsten Fläche/Linie der Klasse (0 = Punkt liegt in der Fläche) */
	distance(point: Point, cls: NearbyClass, maxM: number): number {
		const kx = 111_320 * Math.cos((point[1] * Math.PI) / 180);
		const ky = 110_540;
		let best = Infinity;
		const seen = new Set<Shape>();
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				for (const shape of this.cells.get(`${Math.floor(point[0] / CELL) + dx}:${Math.floor(point[1] / CELL) + dy}`) ?? []) {
					if (shape.cls !== cls || seen.has(shape)) continue;
					seen.add(shape);
					if (point[0] < shape.bbox[0] - maxM / kx || point[0] > shape.bbox[2] + maxM / kx) continue;
					if (point[1] < shape.bbox[1] - maxM / ky || point[1] > shape.bbox[3] + maxM / ky) continue;
					if (shape.area && inside(point, shape.rings)) return 0;
					for (const ring of shape.rings) {
						for (let i = 0; i + 1 < ring.length; i++) {
							best = Math.min(best, segmentDistance(point, ring[i], ring[i + 1], kx, ky));
						}
					}
				}
			}
		}
		return best;
	}
}

function toPoints(geometry: { lat: number; lon: number }[] | undefined): Point[] {
	return (geometry ?? []).filter(Boolean).map((p) => [p.lon, p.lat]);
}

/** Gerade-Ungerade-Regel über alle Ringe (innere Ringe sind Löcher) */
function inside([x, y]: Point, rings: Point[][]): boolean {
	let result = false;
	for (const ring of rings) {
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const [xi, yi] = ring[i];
			const [xj, yj] = ring[j];
			if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
		}
	}
	return result;
}

function segmentDistance(p: Point, a: Point, b: Point, kx: number, ky: number): number {
	const ax = (a[0] - p[0]) * kx;
	const ay = (a[1] - p[1]) * ky;
	const bx = (b[0] - p[0]) * kx;
	const by = (b[1] - p[1]) * ky;
	const dx = bx - ax;
	const dy = by - ay;
	const len2 = dx * dx + dy * dy;
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
	return Math.hypot(ax + t * dx, ay + t * dy);
}
