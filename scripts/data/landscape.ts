/**
 * Landschaftskarte für die Nachbewertung der Wege: Wasser, Wald, Grünflächen und Felder,
 * gerastert auf ca. 100 × 100 m über die Ausdehnung der Regionsdatei.
 *
 * Ausgabe:
 *   static/data/landscape.png    Graustufen-Bild, ein Pixel je Zelle: Klasse × 51
 *                                (0 = nichts, 51 = Felder, 102 = Grün, 153 = Wald, 204 = Wasser)
 *   static/data/landscape.json   Ausdehnung, Zellgröße und Klassen
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Bounds, OsmElement } from '../lib/osm-file.ts';
import { writeGrayPng } from '../lib/png.ts';

type Point = [number, number]; // [lon, lat]

const CELL_LON = 0.0015; // ≈ 104 m bei 51,4° N
const CELL_LAT = 0.0009; // ≈ 100 m

// Klassen (höhere Zahl gewinnt bei Überlappung) – wie in src/lib/scoring/landscape.ts
export const FIELDS = 1;
export const GREEN = 2;
export const FOREST = 3;
export const WATER = 4;
/** Graustufen-Abstand zwischen den Klassen im PNG */
const STEP = 51;

/**
 * Alle Flächen der Regionsdatei in ein Raster mit Zellen der Größe cellLon × cellLat (Grad) schreiben.
 * Je Zelle die höchste Klasse (Felder < Grün < Wald < Wasser), 0 = nichts.
 * Grob (≈ 100 m) für die Nachbewertung, fein (≈ 21 m) für „mitten im Wald“ – siehe fine.ts.
 */
export function rasterizeLandscape(elements: OsmElement[], bounds: Bounds, CELL_LON: number, CELL_LAT: number) {
	const width = Math.ceil((bounds.east - bounds.west) / CELL_LON);
	const height = Math.ceil((bounds.north - bounds.south) / CELL_LAT);
	const grid = new Uint8Array(width * height);

	const setCell = (row: number, col: number, value: number) => {
		if (row < 0 || row >= height || col < 0 || col >= width) return;
		const i = row * width + col;
		if (grid[i] < value) grid[i] = value;
	};

	/** Scanline-Füllung nach der Gerade-Ungerade-Regel (innere Ringe werden so zu Löchern) */
	const fillEvenOdd = (rings: Point[][], value: number) => {
		let minRow = Infinity;
		let maxRow = -Infinity;
		for (const ring of rings) {
			for (const [, lat] of ring) {
				const row = (bounds.north - lat) / CELL_LAT;
				minRow = Math.min(minRow, row);
				maxRow = Math.max(maxRow, row);
			}
		}
		const r0 = Math.max(0, Math.floor(minRow));
		const r1 = Math.min(height - 1, Math.ceil(maxRow));
		for (let row = r0; row <= r1; row++) {
			const lat = bounds.north - (row + 0.5) * CELL_LAT;
			const xs: number[] = [];
			for (const ring of rings) {
				for (let i = 0; i < ring.length; i++) {
					const [x1, y1] = ring[i];
					const [x2, y2] = ring[(i + 1) % ring.length];
					if (y1 > lat === y2 > lat) continue;
					xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
				}
			}
			xs.sort((a, b) => a - b);
			for (let i = 0; i + 1 < xs.length; i += 2) {
				const c0 = Math.max(0, Math.round((xs[i] - bounds.west) / CELL_LON));
				const c1 = Math.min(width - 1, Math.round((xs[i + 1] - bounds.west) / CELL_LON) - 1);
				for (let col = c0; col <= c1; col++) setCell(row, col, value);
			}
		}
	};

	const rasterizeArea = (element: OsmElement, value: number) => {
		let rings: Point[][];
		if (element.type === 'way') {
			rings = [toPoints(element.geometry)];
		} else {
			const parts = (element.members ?? [])
				.filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === 'inner' || m.role === ''))
				.map((m) => toPoints(m.geometry));
			rings = joinRings(parts);
		}
		fillEvenOdd(rings.filter((r) => r.length >= 3), value);
	};

	/** Flüsse als Linie (falls die Wasserfläche fehlt), eine Zelle breit – der Uferbereich kommt beim Bewerten dazu */
	const rasterizeLine = (element: OsmElement, value: number) => {
		const lines =
			element.type === 'way'
				? [toPoints(element.geometry)]
				: (element.members ?? []).filter((m) => m.type === 'way').map((m) => toPoints(m.geometry));
		for (const line of lines) {
			for (let i = 0; i + 1 < line.length; i++) {
				const [x1, y1] = line[i];
				const [x2, y2] = line[i + 1];
				const steps = Math.ceil(Math.max(Math.abs(x2 - x1) / CELL_LON, Math.abs(y2 - y1) / CELL_LAT) * 2) + 1;
				for (let s = 0; s <= steps; s++) {
					const x = x1 + ((x2 - x1) * s) / steps;
					const y = y1 + ((y2 - y1) * s) / steps;
					setCell(Math.floor((bounds.north - y) / CELL_LAT), Math.floor((x - bounds.west) / CELL_LON), value);
				}
			}
		}
	};

	for (const element of elements) {
		const cls = classify(element.tags ?? {});
		if (!cls) continue;
		if (cls.line) rasterizeLine(element, cls.value);
		else rasterizeArea(element, cls.value);
	}
	return { grid, width, height };
}

export async function buildLandscape(elements: OsmElement[], bounds: Bounds) {
	const { grid, width, height } = rasterizeLandscape(elements, bounds, CELL_LON, CELL_LAT);
	console.log(`Landschaft: Raster ${width} × ${height} Zellen`);

	const counts = [0, 0, 0, 0, 0];
	for (const v of grid) counts[v]++;
	const pct = (v: number) => `${((v / grid.length) * 100).toFixed(1)} %`;
	console.log(
		`Landschaft: Felder ${pct(counts[FIELDS])}, Grün ${pct(counts[GREEN])}, Wald ${pct(counts[FOREST])}, Wasser ${pct(counts[WATER])}`
	);

	await mkdir(new URL('../../static/data/', import.meta.url), { recursive: true });
	const pngBytes = await writeGrayPng(
		fileURLToPath(new URL('../../static/data/landscape.png', import.meta.url)),
		grid.map((v) => v * STEP),
		width,
		height
	);
	console.log();
	await writeFile(
		new URL('../../static/data/landscape.json', import.meta.url),
		JSON.stringify({
			west: bounds.west,
			north: bounds.north,
			cellLon: CELL_LON,
			cellLat: CELL_LAT,
			width,
			height,
			classes: { 0: 'none', 1: 'fields', 2: 'green', 3: 'forest', 4: 'water' },
			step: STEP,
			source: '© OpenStreetMap-Mitwirkende (ODbL)',
			created: new Date().toISOString().slice(0, 10)
		}) + '\n'
	);
	console.log('Fertig: static/data/landscape.png und landscape.json');
}

function classify(tags: Record<string, string>): { value: number; line?: boolean } | undefined {
	// Flüsse als Linie (falls die Fläche fehlt). Kanäle nur als Fläche: als Linie eingetragene Kanäle sind
	// meist schmale Gräben (z. B. Nordkanal); große Kanäle haben ohnehin eine Wasserfläche.
	if (tags.waterway === 'river') return { value: WATER, line: true };
	if (tags.natural === 'water' || tags.waterway === 'riverbank') return { value: WATER };
	if (tags.landuse === 'forest' || tags.natural === 'wood') return { value: FOREST };
	if (
		tags.leisure === 'park' ||
		tags.leisure === 'nature_reserve' ||
		tags.landuse === 'meadow' ||
		tags.landuse === 'orchard' ||
		tags.natural === 'grassland' ||
		tags.natural === 'heath' ||
		tags.natural === 'wetland'
	)
		return { value: GREEN };
	if (tags.landuse === 'farmland') return { value: FIELDS };
	return undefined;
}

function toPoints(geometry: { lat: number; lon: number }[] | undefined): Point[] {
	return (geometry ?? []).filter(Boolean).map((p) => [p.lon, p.lat]);
}

/** Wege einer Relation zu geschlossenen Ringen zusammensetzen */
function joinRings(parts: Point[][]): Point[][] {
	const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
	const open = parts.filter((p) => p.length > 1).map((p) => [...p]);
	const rings: Point[][] = [];
	while (open.length) {
		const ring = open.shift()!;
		let extended = true;
		while (!same(ring[0], ring[ring.length - 1]) && extended) {
			extended = false;
			for (let i = 0; i < open.length; i++) {
				const part = open[i];
				const end = ring[ring.length - 1];
				if (same(part[0], end)) ring.push(...part.slice(1));
				else if (same(part[part.length - 1], end)) ring.push(...part.slice(0, -1).reverse());
				else continue;
				open.splice(i, 1);
				extended = true;
				break;
			}
		}
		rings.push(ring);
	}
	return rings;
}
