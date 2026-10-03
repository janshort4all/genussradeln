/**
 * Erzeugt die Landschaftskarte für die Nachbewertung der Wege:
 * Wasser, Wald und Grünflächen des Regierungsbezirks Düsseldorf aus OpenStreetMap (Overpass),
 * gerastert auf ca. 100 × 100 m.
 *
 * Ausgabe:
 *   static/data/landscape.png    Graustufen-Bild, ein Pixel je Zelle (0 = nichts, 85 = Grün, 170 = Wald, 255 = Wasser)
 *   static/data/landscape.json   Ausdehnung und Zellgröße
 *
 * Aufruf: npm run data:landscape   (Overpass-Antworten werden in scripts/.cache/ zwischengespeichert)
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

type Point = [number, number]; // [lon, lat]

const BOUNDS = { west: 5.9, south: 51.0, east: 7.33, north: 51.92 };
const CELL_LON = 0.0015; // ≈ 104 m bei 51,4° N
const CELL_LAT = 0.0009; // ≈ 100 m
const WIDTH = Math.ceil((BOUNDS.east - BOUNDS.west) / CELL_LON);
const HEIGHT = Math.ceil((BOUNDS.north - BOUNDS.south) / CELL_LAT);
const TILES_X = 4;
const TILES_Y = 4;

// Klassen (höhere Zahl gewinnt bei Überlappung)
const GREEN = 1;
const FOREST = 2;
const WATER = 3;

const SERVERS = [
	'https://overpass-api.de/api/interpreter',
	'https://overpass.private.coffee/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter'
];
const CACHE_DIR = new URL('./.cache/landscape/', import.meta.url);

interface OsmElement {
	type: 'way' | 'relation';
	id: number;
	tags?: Record<string, string>;
	geometry?: { lat: number; lon: number }[];
	members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
}

const grid = new Uint8Array(WIDTH * HEIGHT);
const done = new Set<string>();

await mkdir(CACHE_DIR, { recursive: true });
console.log(`Raster ${WIDTH} × ${HEIGHT} Zellen, ${TILES_X * TILES_Y} Kacheln`);

for (let ty = 0; ty < TILES_Y; ty++) {
	for (let tx = 0; tx < TILES_X; tx++) {
		const elements = await loadTile(tx, ty);
		let count = 0;
		for (const element of elements) {
			const key = `${element.type}/${element.id}`;
			if (done.has(key)) continue;
			done.add(key);
			const cls = classify(element.tags ?? {});
			if (!cls) continue;
			if (cls.line) rasterizeLine(element, cls.value);
			else rasterizeArea(element, cls.value);
			count++;
		}
		console.log(`Kachel ${tx},${ty}: ${elements.length} Objekte, ${count} neu gerastert`);
	}
}

const counts = [0, 0, 0, 0];
for (const v of grid) counts[v]++;
const total = grid.length;
console.log(
	`Anteile: Grün ${pct(counts[GREEN] / total)}, Wald ${pct(counts[FOREST] / total)}, Wasser ${pct(counts[WATER] / total)}`
);

await mkdir(new URL('../static/data/', import.meta.url), { recursive: true });
const pixels = Buffer.from(grid.map((v) => v * 85));
await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 1 } })
	.png({ compressionLevel: 9 })
	.toFile(fileURLToPath(new URL('../static/data/landscape.png', import.meta.url)));
await writeFile(
	new URL('../static/data/landscape.json', import.meta.url),
	JSON.stringify({
		west: BOUNDS.west,
		north: BOUNDS.north,
		cellLon: CELL_LON,
		cellLat: CELL_LAT,
		width: WIDTH,
		height: HEIGHT,
		classes: { 0: 'none', 1: 'green', 2: 'forest', 3: 'water' },
		source: '© OpenStreetMap-Mitwirkende (ODbL)',
		created: new Date().toISOString().slice(0, 10)
	}) + '\n'
);
console.log('Fertig: static/data/landscape.png und landscape.json');

// ---------------------------------------------------------------------------

function classify(tags: Record<string, string>): { value: number; line?: boolean } | undefined {
	if (tags.waterway === 'river' || tags.waterway === 'canal') return { value: WATER, line: true };
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
	return undefined;
}

async function loadTile(tx: number, ty: number): Promise<OsmElement[]> {
	const cacheFile = new URL(`tile-${tx}-${ty}.json`, CACHE_DIR);
	try {
		return JSON.parse(await readFile(cacheFile, 'utf8')).elements;
	} catch {
		// noch nicht im Zwischenspeicher
	}
	const tileW = (BOUNDS.east - BOUNDS.west) / TILES_X;
	const tileH = (BOUNDS.north - BOUNDS.south) / TILES_Y;
	const s = BOUNDS.south + ty * tileH;
	const w = BOUNDS.west + tx * tileW;
	const bbox = `${s},${w},${s + tileH},${w + tileW}`;
	const query = `[out:json][timeout:300];
(
  nwr["natural"~"^(water|wood|grassland|heath|wetland)$"](${bbox});
  nwr["waterway"~"^(riverbank|river|canal)$"](${bbox});
  nwr["landuse"~"^(forest|meadow|orchard)$"](${bbox});
  nwr["leisure"~"^(park|nature_reserve)$"](${bbox});
);
out geom;`;

	for (let attempt = 0; attempt < 9; attempt++) {
		const server = SERVERS[attempt % SERVERS.length];
		try {
			const response = await fetch(server, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
					'User-Agent': 'Genuss-Radeln/0.1 (Testprojekt, einmaliger Export)'
				},
				body: 'data=' + encodeURIComponent(query),
				signal: AbortSignal.timeout(330_000)
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const text = await response.text();
			const json = JSON.parse(text);
			if (json.remark?.includes('error')) throw new Error(json.remark);
			await writeFile(cacheFile, text);
			return json.elements;
		} catch (error) {
			console.log(`  Kachel ${tx},${ty}: ${server} fehlgeschlagen (${(error as Error).message}), neuer Versuch …`);
			await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
		}
	}
	throw new Error(`Kachel ${tx},${ty} konnte nicht geladen werden.`);
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

function rasterizeArea(element: OsmElement, value: number) {
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
}

/** Scanline-Füllung nach der Gerade-Ungerade-Regel (innere Ringe werden so zu Löchern) */
function fillEvenOdd(rings: Point[][], value: number) {
	let minRow = Infinity;
	let maxRow = -Infinity;
	for (const ring of rings) {
		for (const [, lat] of ring) {
			const row = (BOUNDS.north - lat) / CELL_LAT;
			minRow = Math.min(minRow, row);
			maxRow = Math.max(maxRow, row);
		}
	}
	const r0 = Math.max(0, Math.floor(minRow));
	const r1 = Math.min(HEIGHT - 1, Math.ceil(maxRow));
	for (let row = r0; row <= r1; row++) {
		const lat = BOUNDS.north - (row + 0.5) * CELL_LAT;
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
			const c0 = Math.max(0, Math.round((xs[i] - BOUNDS.west) / CELL_LON));
			const c1 = Math.min(WIDTH - 1, Math.round((xs[i + 1] - BOUNDS.west) / CELL_LON) - 1);
			for (let col = c0; col <= c1; col++) setCell(row, col, value);
		}
	}
}

/** Flüsse und Kanäle als Linie mit einer Zelle Puffer (falls die Wasserfläche fehlt) */
function rasterizeLine(element: OsmElement, value: number) {
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
				const row = Math.floor((BOUNDS.north - y) / CELL_LAT);
				const col = Math.floor((x - BOUNDS.west) / CELL_LON);
				for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) setCell(row + dr, col + dc, value);
			}
		}
	}
}

function setCell(row: number, col: number, value: number) {
	if (row < 0 || row >= HEIGHT || col < 0 || col >= WIDTH) return;
	const i = row * WIDTH + col;
	if (grid[i] < value) grid[i] = value;
}

function pct(v: number) {
	return `${(v * 100).toFixed(1)} %`;
}
