/**
 * Baut die Kartendaten der App als Kacheln (static/tiles/<x>_<y>.tile + index.json) aus einer OSM-Regionsdatei –
 * für beliebig große Gebiete (NRW + Niederlande: 1,1 GB). Die Datei wird einmal eingelesen (scripts/lib/osm-index.ts);
 * danach wird das Gebiet in Blöcken aus 4 × 4 Kacheln abgearbeitet, damit der Speicher reicht.
 *
 * Aufruf: npm run tiles   (Datei: einzige .osm.pbf in routing/data, anders: OSM_FILE=… oder als erstes Argument)
 * Aufbau der Kacheln: src/lib/data/tile-format.ts, Raster: src/lib/data/grid.ts. Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { COARSE_E4, FINE_E4, TILE_CELLS, tileEast, tileNorth, tileOf, tileSouth, tileWest } from '../src/lib/data/grid.ts';
import { encodeTile, isEmptyTile, type StreamPiece, type TileData } from '../src/lib/data/tile-format.ts';
import { STOP_KINDS } from '../src/lib/stops/kinds.ts';
import { fineLayers } from './data/fine.ts';
import { landmarkPoints } from './data/landmarks.ts';
import { placeItems } from './data/places.ts';
import { poiItems } from './data/pois.ts';
import { rasterizeRoads } from './data/roads.ts';
import { rasterizeLandscape } from './data/landscape.ts';
import { encode, streamLines } from './data/streams.ts';
import { FIELDS, LANDSCAPE, MAJOR_ROADS, PLACES, POIS, WATERWAYS } from './data/queries.ts';
import { indexOsm } from './lib/osm-index.ts';
import { osmFilePath, type Bounds } from './lib/osm-file.ts';

/** Kacheln je Block (Seitenlänge) */
const BATCH = 4;
/** So weit (Grad) schauen die Objekte eines Blocks über seinen Rand: Namen und Lage der Stopps brauchen die Umgebung */
const MARGIN = 0.2;

const started = Date.now();
const path = process.argv[2] ?? (await osmFilePath());
const rootDir = new URL('../static/tiles/', import.meta.url);
/** Ordner dieses Baus: Kacheln darin ändern sich nie (die App darf sie für immer zwischenspeichern); index.json im Hauptordner nennt den aktuellen */
const version = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const outDir = new URL(`${version}/`, rootDir);
console.log(`Regionsdatei: ${path}`);

const index = await indexOsm(
	{ landscape: LANDSCAPE, fields: FIELDS, pois: POIS, places: PLACES, roads: MAJOR_ROADS, waterways: WATERWAYS },
	{ path }
);
console.log(`Ausdehnung: ${index.bounds.west.toFixed(2)}…${index.bounds.east.toFixed(2)} Ost, ${index.bounds.south.toFixed(2)}…${index.bounds.north.toFixed(2)} Nord`);

const first = tileOf([index.bounds.west, index.bounds.south]);
const last = tileOf([index.bounds.east, index.bounds.north]);

// Gewässer: einmal für das ganze Gebiet (Linien laufen über viele Kacheln), dann in Stücke je Kachel zerlegt
const streamPieces = new Map<string, StreamPiece[]>();
{
	const lines = streamLines(index.elements('waterways'));
	let pieces = 0;
	lines.forEach(({ name, line }, id) => {
		const keys = line.map(([lon, lat]) => {
			const t = tileOf([lon, lat]);
			return `${t.x}_${t.y}`;
		});
		let from = 0;
		let seq = 0;
		for (let i = 1; i <= line.length; i++) {
			if (i < line.length && keys[i] === keys[from]) continue;
			// Stück = eigene Punkte plus je ein Nachbarpunkt davor und danach (so lassen sich Stücke wieder verbinden)
			const part = line.slice(Math.max(0, from - 1), Math.min(line.length, i + 1));
			(streamPieces.get(keys[from]) ?? streamPieces.set(keys[from], []).get(keys[from])!).push({ id, seq: seq++, name, line: encode(part) });
			pieces++;
			from = i;
		}
	});
	console.log(`Gewässer: ${lines.length} Linien in ${pieces} Stücken`);
}

/** Rechteck aus dem Raster ausschneiden (Zeile für Zeile) */
function sliceBytes(grid: Uint8Array, width: number, c0: number, r0: number, tw: number, th: number): Uint8Array {
	const out = new Uint8Array(tw * th);
	for (let r = 0; r < th; r++) out.set(grid.subarray((r0 + r) * width + c0, (r0 + r) * width + c0 + tw), r * tw);
	return out;
}

/** Bit-Ebenen ausschneiden: Breiten und Anfangsspalten sind Vielfache von 8, jede Zeile ist also ein Stück Bytes */
function sliceBits(bits: Uint8Array, layers: number, width: number, height: number, c0: number, r0: number, tw: number, th: number): Uint8Array {
	const batchLayer = (width * height) / 8;
	const tileLayer = (tw * th) / 8;
	const out = new Uint8Array(layers * tileLayer);
	for (let layer = 0; layer < layers; layer++) {
		for (let r = 0; r < th; r++) {
			const src = layer * batchLayer + ((r0 + r) * width + c0) / 8;
			out.set(bits.subarray(src, src + tw / 8), layer * tileLayer + (r * tw) / 8);
		}
	}
	return out;
}

await rm(rootDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const manifest: Record<string, number> = {};
let totalBytes = 0;

for (let by = last.y; by >= first.y; by -= BATCH) {
	for (let bx = first.x; bx <= last.x; bx += BATCH) {
		const x0 = bx;
		const x1 = Math.min(last.x, bx + BATCH - 1);
		const y1 = by;
		const y0 = Math.max(first.y, by - BATCH + 1);
		const nx = x1 - x0 + 1;
		const ny = y1 - y0 + 1;
		const rect: Bounds = { west: tileWest(x0), east: tileEast(x1), south: tileSouth(y0), north: tileNorth(y1) };
		const window: Bounds = { west: rect.west - MARGIN, east: rect.east + MARGIN, south: rect.south - MARGIN, north: rect.north + MARGIN };
		const inRect = (lon: number, lat: number) => lon >= rect.west && lon < rect.east && lat >= rect.south && lat < rect.north;

		const landscape = index.elements('landscape', window);
		const fields = index.elements('fields', window);
		const roads = index.elements('roads', window);
		const poiElements = index.elements('pois', rect);
		const placeElements = index.elements('places', rect);
		if (!landscape.length && !fields.length && !roads.length && !poiElements.length && !placeElements.length) continue;
		const batchStarted = Date.now();

		const coarseW = nx * TILE_CELLS.coarse.width;
		const coarseH = ny * TILE_CELLS.coarse.height;
		const fineW = nx * TILE_CELLS.fine.width;
		const fineH = ny * TILE_CELLS.fine.height;
		const coarse = rasterizeLandscape([...landscape, ...fields], rect, COARSE_E4.lon / 1e4, COARSE_E4.lat / 1e4, { width: coarseW, height: coarseH }).grid;
		const fineGrid = rasterizeLandscape(landscape, rect, FINE_E4.lon / 1e4, FINE_E4.lat / 1e4, { width: fineW, height: fineH }).grid;
		const fine = fineLayers(fineGrid, fineW, fineH).bits;
		const roadBits = rasterizeRoads(roads, rect, { width: fineW, height: fineH }).bits;
		const pois = poiItems(poiElements, landscape, inRect);
		const places = placeItems(placeElements).filter(([lon, lat]) => inRect(lon / 1e4, lat / 1e4));
		const landmarks = landmarkPoints(landscape, inRect);

		let written = 0;
		for (let y = y0; y <= y1; y++) {
			for (let x = x0; x <= x1; x++) {
				const key = `${x}_${y}`;
				const c = (x - x0) * TILE_CELLS.coarse.width;
				const r = (y1 - y) * TILE_CELLS.coarse.height;
				const fc = (x - x0) * TILE_CELLS.fine.width;
				const fr = (y1 - y) * TILE_CELLS.fine.height;
				const here = (lon: number, lat: number) => {
					const t = tileOf([lon, lat]);
					return t.x === x && t.y === y;
				};
				const usedNames = new Map<number, number>();
				const points: [number, number, number][] = [];
				for (const [lonE4, latE4, nameIndex] of landmarks.points) {
					if (!here(lonE4 / 1e4, latE4 / 1e4)) continue;
					if (!usedNames.has(nameIndex)) usedNames.set(nameIndex, usedNames.size);
					points.push([lonE4, latE4, usedNames.get(nameIndex)!]);
				}
				const tile: TileData = {
					x,
					y,
					coarse: sliceBytes(coarse, coarseW, c, r, TILE_CELLS.coarse.width, TILE_CELLS.coarse.height),
					fine: sliceBits(fine, 3, fineW, fineH, fc, fr, TILE_CELLS.fine.width, TILE_CELLS.fine.height),
					roads: sliceBits(roadBits, 2, fineW, fineH, fc, fr, TILE_CELLS.fine.width, TILE_CELLS.fine.height),
					pois: pois.filter((p) => here(p[0] / 1e5, p[1] / 1e5)),
					landmarks: { names: [...usedNames.keys()].map((i) => landmarks.names[i]), points },
					places: places.filter((p) => here(p[0] / 1e4, p[1] / 1e4)),
					streams: streamPieces.get(key) ?? []
				};
				if (isEmptyTile(tile)) continue;
				const packed = deflateRawSync(encodeTile(tile), { level: 9 });
				await writeFile(new URL(`${key}.tile`, outDir), packed);
				manifest[key] = packed.length;
				totalBytes += packed.length;
				written++;
			}
		}
		console.log(`Block x ${x0}–${x1}, y ${y0}–${y1}: ${written} Kacheln (${((Date.now() - batchStarted) / 1000).toFixed(1)} s)`);
	}
}

// Ortsliste für die Sofort-Suche beim Tippen (alle Orte des Gebiets in einer kleinen Datei; Format wie places.json)
{
	const all = placeItems(index.elements('places')).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	await writeFile(new URL('places.json', outDir), JSON.stringify({ places: all, source: '© OpenStreetMap-Mitwirkende (ODbL)' }) + '\n');
	console.log(`Ortsliste: ${all.length} Orte`);
}

await writeFile(
	new URL('index.json', rootDir),
	JSON.stringify({
		v: 1,
		dir: version,
		created: new Date().toISOString().slice(0, 10),
		source: '© OpenStreetMap-Mitwirkende (ODbL)',
		kinds: STOP_KINDS,
		tiles: manifest
	}) + '\n'
);
const sizes = Object.values(manifest).sort((a, b) => a - b);
console.log(
	`Fertig: ${sizes.length} Kacheln, zusammen ${(totalBytes / 1048576).toFixed(1)} MB (Median ${Math.round(sizes[Math.floor(sizes.length / 2)] / 1024)} KB, größte ${Math.round(sizes[sizes.length - 1] / 1024)} KB) nach ${Math.round((Date.now() - started) / 1000)} s`
);
