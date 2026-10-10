import { describe, expect, it } from 'vitest';
import { FineMap, type FineMeta } from './fine';

const meta: FineMeta = { west: 6.5, north: 51.4, cellLon: 0.0003, cellLat: 0.0002, width: 100, height: 100, layers: ['forest', 'green', 'water'] };

/** Karte aus Funktionen je Ebene: (Zeile, Spalte) → gesetzt? */
function makeFine(layers: ((row: number, col: number) => boolean)[]): FineMap {
	const layerBytes = Math.ceil((meta.width * meta.height) / 8);
	const bits = new Uint8Array(layerBytes * 3);
	layers.forEach((has, layer) => {
		for (let r = 0; r < meta.height; r++)
			for (let c = 0; c < meta.width; c++)
				if (has(r, c)) {
					const i = r * meta.width + c;
					bits[layer * layerBytes + (i >> 3)] |= 1 << (i & 7);
				}
	});
	return new FineMap(meta, bits);
}

const at = (row: number, col: number): [number, number] => [meta.west + (col + 0.5) * meta.cellLon, meta.north - (row + 0.5) * meta.cellLat];

describe('FineMap', () => {
	// Wald in den Zeilen 20–60, Spalten 20–60; Park als schmaler Streifen (4 Zellen breit) in den Zeilen 70–90
	const fine = makeFine([
		(r, c) => r >= 20 && r <= 60 && c >= 20 && c <= 60,
		(r, c) => r >= 70 && r <= 90 && c >= 30 && c <= 33,
		(r, c) => r >= 10 && r <= 12 && c >= 70
	]);

	it('mitten im Wald ist die Tiefe 1, am Rand nur ein Drittel, draußen nichts', () => {
		expect(fine.woodDepth(at(40, 40))).toEqual({ kind: 'forest', depth: 1 });
		expect(fine.woodDepth(at(20, 40))?.depth).toBeCloseTo(1 / 3);
		expect(fine.woodDepth(at(21, 40))?.depth).toBeCloseTo(1 / 3);
		expect(fine.woodDepth(at(23, 40))?.depth).toBeCloseTo(2 / 3);
		expect(fine.woodDepth(at(10, 40))).toBeUndefined();
	});

	it('ein schmaler Park zählt als Grün, aber nicht als ganz drin', () => {
		const p = fine.woodDepth(at(80, 31));
		expect(p?.kind).toBe('green');
		expect(p!.depth).toBeLessThan(1);
	});

	it('findet Wasser in der Nähe', () => {
		expect(fine.nearWater(at(11, 80), 0)).toBe(true);
		expect(fine.nearWater(at(16, 80), 3)).toBe(false);
		expect(fine.nearWater(at(15, 80), 3)).toBe(true);
	});

	it('außerhalb der Karte ist nichts', () => {
		expect(fine.woodDepth([5, 50])).toBeUndefined();
		expect(fine.nearWater([5, 50], 3)).toBe(false);
	});
});
