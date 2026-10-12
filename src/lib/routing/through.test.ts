import { describe, expect, it } from 'vitest';
import { distance, type LngLat } from '$lib/geo/geo';
import { splicePath } from '$lib/improve/slice';
import { FineMap } from '$lib/scoring/fine';
import { FOREST, NONE } from '$lib/scoring/landscape';
import { lineOf } from '$lib/scoring/score';
import { makeLandscape, makePath } from '$lib/scoring/test-helpers';
import type { RouteOptions } from './graphhopper';
import { findPassBys, goThrough, insideness } from './through';

// Wald östlich einer Straße, die nach Norden führt: Straße auf 6,55° O, Wald 6,553 … 6,562° O, 51,305 … 51,325° N
const FOREST_W = 6.553;
const FOREST_E = 6.562;
const FOREST_S = 51.305;
const FOREST_N = 51.325;
const inForest = (lon: number, lat: number) => lon >= FOREST_W && lon <= FOREST_E && lat >= FOREST_S && lat <= FOREST_N;

/** Feine Karte (≈ 21 m) mit dem Wald, Ebenen wie in fine.json */
function makeFine(): FineMap {
	const meta = { west: 6.54, north: 51.34, cellLon: 0.0003, cellLat: 0.0002, width: 120, height: 250, layers: ['forest', 'green', 'water'] };
	const layerBytes = Math.ceil((meta.width * meta.height) / 8);
	const bits = new Uint8Array(layerBytes * 3);
	for (let r = 0; r < meta.height; r++) {
		for (let c = 0; c < meta.width; c++) {
			const lon = meta.west + (c + 0.5) * meta.cellLon;
			const lat = meta.north - (r + 0.5) * meta.cellLat;
			if (!inForest(lon, lat)) continue;
			const i = r * meta.width + c;
			bits[i >> 3] |= 1 << (i & 7);
		}
	}
	return new FineMap(meta, bits);
}

// grobe Landschaftskarte mit demselben Wald (für die Bewertung „durch den Wald“)
const landscape = makeLandscape((row, col) => (inForest(6.5 + (col + 0.5) * 0.0015, 51.4 - (row + 0.5) * 0.0009) ? FOREST : NONE));
const fine = makeFine();

/** Straße von Süden nach Norden am Waldrand vorbei, alle ≈ 55 m ein Punkt */
const road: LngLat[] = Array.from({ length: 61 }, (_, i) => [6.55, 51.297 + i * 0.0005] as LngLat);

describe('findPassBys', () => {
	it('erkennt, dass die Straße am Wald vorbeiführt, und schlägt Punkte mitten im Wald vor', () => {
		const passBys = findPassBys(road, fine);
		expect(passBys.length).toBe(1);
		const [p] = passBys;
		expect(p.inside.length).toBeGreaterThan(3);
		for (const q of p.inside) expect(inForest(q[0], q[1])).toBe(true);
		// Anfang und Ende liegen auf der Straße, kurz vor bzw. hinter dem Wald
		expect(road[p.from][1]).toBeLessThan(FOREST_S + 0.003);
		expect(road[p.to][1]).toBeGreaterThan(FOREST_N - 0.003);
	});

	it('findet nichts, wenn der Weg schon durch den Wald führt', () => {
		const inside: LngLat[] = road.map(([, lat]) => [6.5575, lat]);
		const middle = inside.filter(([, lat]) => lat > FOREST_S + 0.002 && lat < FOREST_N - 0.002);
		expect(findPassBys(middle, fine)).toEqual([]);
	});

	it('misst, wie tief ein Punkt im Wald liegt', () => {
		expect(insideness(fine, [6.5575, 51.315])).toBeGreaterThan(0.5);
		expect(insideness(fine, [6.545, 51.315])).toBe(0);
	});
});

describe('goThrough', () => {
	/** Routing-Dienst: mit Korridor fährt er durch den Wald (6,5575° O), sonst wie bisher die Straße */
	const throughForest = (eastKm = 0) => (points: LngLat[], options: RouteOptions) => {
		const [a, b] = [points[0], points[points.length - 1]];
		if (!options.preferAreas) return Promise.resolve([makePath([a, b], { roadClass: 'residential' })]);
		const via: LngLat[] = [];
		// schräg hinein, ≈ 300 m östlich der Straße durch den Wald, schräg wieder hinaus
		for (let lat = a[1] + 0.002; lat < b[1] - 0.002; lat += 0.0005) via.push([6.5545 + eastKm * 0.0145, lat]);
		return Promise.resolve([makePath([a, ...via, b], { roadClass: 'track' })]);
	};

	it('führt den Weg durch den Wald, wenn das nicht viel länger ist', async () => {
		const path = makePath(road, { roadClass: 'residential' });
		const result = await goThrough(path, { route: throughForest(), landscape, fine }, { effort: 'easy' });
		expect(result.changed).toBe(1);
		const line = lineOf(result.path);
		expect(line.some(([lon, lat]) => inForest(lon, lat) && lon > 6.554)).toBe(true);
		// Anfang und Ende bleiben, wo sie waren
		expect(distance(line[0], road[0])).toBeLessThan(1);
		expect(distance(line[line.length - 1], road[road.length - 1])).toBeLessThan(1);
		expect(result.stats.forestThrough ?? 0).toBeGreaterThan(0.2);
	});

	it('lässt den Weg, wie er ist, wenn der Umweg zu lang wäre', async () => {
		const path = makePath(road, { roadClass: 'residential' });
		// „Korridor“-Weg 1 km weiter östlich: hin und zurück viel zu lang
		const result = await goThrough(path, { route: throughForest(1), landscape, fine }, { effort: 'easy' });
		expect(result.changed).toBe(0);
		expect(result.path).toBe(path);
	});

	it('fragt den Aufrufer (z. B. Länge einer Runde) und lässt den Weg sonst, wie er ist', async () => {
		const path = makePath(road, { roadClass: 'residential' });
		const result = await goThrough(path, { route: throughForest(), landscape, fine }, { effort: 'easy' }, () => false);
		expect(result.changed).toBe(0);
	});
});

describe('splicePath', () => {
	it('setzt ein Stück ein und verschiebt die Angaben dahinter', () => {
		const line: LngLat[] = Array.from({ length: 11 }, (_, i) => [6.5 + i * 0.001, 51.3] as LngLat);
		const path = makePath(line, { roadClass: 'residential' });
		const piece = makePath([line[3], [6.5035, 51.301], [6.5045, 51.301], [6.5055, 51.301], line[7]], { roadClass: 'track' });
		const result = splicePath(path, 3, 7, piece);
		expect(result.coordinates.length).toBe(11 - 5 + 5);
		expect(result.coordinates[4][1]).toBeCloseTo(51.301);
		// Straße bis Punkt 3, dann das Stück (Feldweg), dahinter wieder Straße
		expect(result.details.road_class).toEqual([
			[0, 3, 'residential'],
			[3, 7, 'track'],
			[7, 10, 'residential']
		]);
		expect(result.distance).toBeGreaterThan(path.distance);
	});
});
