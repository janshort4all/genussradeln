/**
 * Feine Karte von Wald, Parks und Wasser (Zellen ≈ 21 × 22 m) – die grobe Landschaftskarte (≈ 100 m) kann nicht
 * sagen, ob ein Weg MITTEN im Wald oder Park liegt oder nur daneben (Moerser Freizeitpark: 2–3 grobe Zellen breit;
 * Wunsch Jan, 10.10.2026). Dasselbe Verfahren wie roads.ts, dieselbe Rasterung wie landscape.ts.
 *
 * Ausgabe:
 *   static/data/fine.bin    drei Ebenen mit je einem Bit pro Zelle (Zeile für Zeile), hintereinander, deflate-raw:
 *                           0 = Wald, 1 = Grün (Park, Wiese, Heide, Naturschutzgebiet …), 2 = Wasser
 *   static/data/fine.json   Ausdehnung, Zellgröße, Ebenen
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import type { Bounds, OsmElement } from '../lib/osm-file.ts';
import { FOREST, GREEN, rasterizeLandscape, WATER } from './landscape.ts';

const CELL_LON = 0.0003; // ≈ 21 m bei 51° N
const CELL_LAT = 0.0002; // ≈ 22 m

export async function buildFine(elements: OsmElement[], bounds: Bounds) {
	// Felder bleiben draußen (riesig, für „durch den Wald“ unwichtig): `elements` enthält nur Wasser, Wald, Grün
	const { grid, width, height } = rasterizeLandscape(elements, bounds, CELL_LON, CELL_LAT);
	const layerBytes = Math.ceil((width * height) / 8);
	const bits = new Uint8Array(layerBytes * 3);
	const counts = [0, 0, 0];
	const layerOf: Record<number, number> = { [FOREST]: 0, [GREEN]: 1, [WATER]: 2 };
	for (let i = 0; i < grid.length; i++) {
		const layer = layerOf[grid[i]];
		if (layer === undefined) continue;
		bits[layer * layerBytes + (i >> 3)] |= 1 << (i & 7);
		counts[layer]++;
	}
	const packed = deflateRawSync(bits, { level: 9 });
	await writeFile(new URL('../../static/data/fine.bin', import.meta.url), packed);
	await writeFile(
		new URL('../../static/data/fine.json', import.meta.url),
		JSON.stringify({
			west: bounds.west,
			north: bounds.north,
			cellLon: CELL_LON,
			cellLat: CELL_LAT,
			width,
			height,
			layers: ['forest', 'green', 'water'],
			source: '© OpenStreetMap-Mitwirkende (ODbL)',
			created: new Date().toISOString().slice(0, 10)
		}) + '\n'
	);
	console.log(
		`Fertig: static/data/fine.bin (${Math.round(packed.length / 1024)} KB, ${width} × ${height} Zellen; Wald ${counts[0]}, Grün ${counts[1]}, Wasser ${counts[2]})`
	);
}
