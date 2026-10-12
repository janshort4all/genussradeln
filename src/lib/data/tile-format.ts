/**
 * Aufbau einer Kachel-Datei (`<x>_<y>.tile`): alles, was die Planung für ein Stück Land braucht, in einer Datei.
 * Gepackt mit deflate-raw (die App entpackt mit DecompressionStream), entpackt:
 *
 *   4 Byte  Länge L des Kopfes (little endian)
 *   L Byte  Kopf (JSON): { v, x, y, coarse, fine, roads }  – Längen der drei Rasterteile in Byte
 *   Raster  grobe Landschaft (ein Byte je Zelle: 0 nichts, 1 Felder, 2 Grün, 3 Wald, 4 Wasser),
 *           feine Karte (3 Bit-Ebenen: Wald, Grün, Wasser), große Straßen (2 Bit-Ebenen: Straße, Autobahn)
 *   Rest    JSON: { pois, landmarks, places, streams }
 *
 * Gebaut von scripts/build-tiles.ts, gelesen von src/lib/data/tiles.ts. Daten: © OpenStreetMap-Mitwirkende (ODbL).
 */
export const TILE_VERSION = 1;

/** Stopp: [lon·1e5, lat·1e5, Art-Index, Merkmale, Name?, Öffnungszeiten?] (wie in pois.json) */
export type PoiItem = [number, number, number, number, string?, string?];
export type LandmarkType = 'river' | 'lake' | 'forest' | 'park';
/** Ort: [lon·1e4, lat·1e4, Rang, Name] (wie in places.json) */
export type PlaceItem = [number, number, number, string];

/** Ein Stück eines Gewässers: Nummer der Linie, Reihenfolge, Name, Verlauf als Google-Polylinie */
export interface StreamPiece {
	id: number;
	seq: number;
	name: string;
	line: string;
}

export interface TileData {
	x: number;
	y: number;
	coarse: Uint8Array;
	fine: Uint8Array;
	roads: Uint8Array;
	pois: PoiItem[];
	landmarks: { names: [string, LandmarkType][]; points: [number, number, number][] };
	places: PlaceItem[];
	streams: StreamPiece[];
}

/** Zellen je Kachel (siehe grid.ts: 160 × 200 grobe, 800 × 900 feine Zellen) */
export const COARSE_BYTES = 160 * 200;
export const FINE_LAYER_BYTES = (800 * 900) / 8;

export function isEmptyTile(t: TileData): boolean {
	return (
		!t.coarse.some((v) => v) &&
		!t.fine.some((v) => v) &&
		!t.roads.some((v) => v) &&
		!t.pois.length &&
		!t.landmarks.points.length &&
		!t.places.length &&
		!t.streams.length
	);
}

/** Kachel in Bytes (noch ungepackt) */
export function encodeTile(t: TileData): Uint8Array {
	if (t.coarse.length !== COARSE_BYTES) throw new Error(`Kachel ${t.x}_${t.y}: grobes Raster hat falsche Größe`);
	const header = new TextEncoder().encode(
		JSON.stringify({ v: TILE_VERSION, x: t.x, y: t.y, coarse: t.coarse.length, fine: t.fine.length, roads: t.roads.length })
	);
	const rest = new TextEncoder().encode(JSON.stringify({ pois: t.pois, landmarks: t.landmarks, places: t.places, streams: t.streams }));
	const out = new Uint8Array(4 + header.length + t.coarse.length + t.fine.length + t.roads.length + rest.length);
	new DataView(out.buffer).setUint32(0, header.length, true);
	let at = 4;
	for (const part of [header, t.coarse, t.fine, t.roads, rest]) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

export function decodeTile(bytes: Uint8Array): TileData {
	const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
	const decoder = new TextDecoder();
	const header = JSON.parse(decoder.decode(bytes.subarray(4, 4 + headerLength)));
	if (header.v !== TILE_VERSION) throw new Error(`Kachel-Version ${header.v} wird nicht gelesen`);
	let at = 4 + headerLength;
	const take = (n: number) => bytes.subarray(at, (at += n));
	const coarse = take(header.coarse);
	const fine = take(header.fine);
	const roads = take(header.roads);
	const rest = JSON.parse(decoder.decode(bytes.subarray(at)));
	return { x: header.x, y: header.y, coarse, fine, roads, ...rest };
}
