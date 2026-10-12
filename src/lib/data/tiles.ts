/**
 * Kartendaten aus Kacheln laden und zu den Karten zusammensetzen, die Planung und Bewertung kennen
 * (Landschaft, feine Karte, große Straßen, Namen, Stopps, Gewässer) – aber nur für das Gebiet, das ein Wunsch braucht.
 *
 * Kachel-Aufbau: tile-format.ts, Raster: grid.ts, Bau: scripts/build-tiles.ts.
 * Die Kacheln liegen unveränderlich in einem Ordner mit der Versionsnummer des Baus (Cache: ein Jahr); `index.json` im Hauptordner
 * (wird immer neu abgefragt) nennt den gültigen Ordner und welche Kacheln es gibt.
 */
import { NameIndex, parseLandmarks, parsePlaces, type NameData, type NamedPoint } from '$lib/naming/names';
import { Landscape } from '$lib/scoring/landscape';
import { FineMap } from '$lib/scoring/fine';
import { RoadMask } from '$lib/scoring/roads';
import { decodePolyline } from '$lib/share/link';
import { parsePois, PoiIndex, type Poi } from '$lib/stops/pois';
import type { Watercourse } from '$lib/routing/streams';
import type { LngLat } from '$lib/geo/geo';
import { COARSE_E4, FINE_E4, rangeOf, TILE_CELLS, tileKey, tileNorth, tileOf, tileWest, type TileId } from './grid';
import { decodeTile, type StreamPiece, type TileData } from './tile-format';

/** Alles, was die Planung für ein Gebiet an Karten braucht – jedes Teil fehlt, wenn es nicht zu laden war */
export interface AreaData {
	landscape?: Landscape;
	fine?: FineMap;
	roads?: RoadMask;
	names?: NameData;
	pois?: PoiIndex;
	streams?: Watercourse[];
	/** Kacheln, die zu dem Gebiet gehören und wirklich Daten haben */
	tiles: string[];
}

interface Manifest {
	/** Ordner mit den Kacheln dieses Baus (ändern sich nie) */
	dir: string;
	tiles: Record<string, number>;
	kinds?: string[];
}

/** So viele entpackte Kacheln bleiben im Speicher (je ca. 0,5 MB) */
const KEEP_TILES = 60;
/** So viele zusammengesetzte Gebiete bleiben im Speicher */
const KEEP_AREAS = 4;

export class TileStore {
	private manifestPromise?: Promise<Manifest>;
	private readonly tiles = new Map<string, Promise<TileData | undefined>>();
	private readonly areas = new Map<string, Promise<AreaData>>();
	private readonly parsed = new WeakMap<TileData, { landmarks: NamedPoint[]; places: NamedPoint[]; pois: Poi[] }>();

	constructor(readonly baseUrl: string) {}

	private manifest(): Promise<Manifest> {
		this.manifestPromise ??= fetch(`${this.baseUrl}/index.json`, { cache: 'no-cache' }).then((r) => {
			if (!r.ok) throw new Error('Kachelverzeichnis nicht gefunden');
			return r.json() as Promise<Manifest>;
		});
		this.manifestPromise.catch(() => (this.manifestPromise = undefined));
		return this.manifestPromise;
	}

	/** Adresse der Ortsliste (alle Orte des Gebiets, für die Sofort-Suche) */
	async placesUrl(): Promise<string> {
		return `${this.baseUrl}/${(await this.manifest()).dir}/places.json`;
	}

	/** Liegt der Ort in einem Gebiet, für das es Kartendaten gibt? (Ist die Liste nicht erreichbar, gilt er als abgedeckt – die Planung meldet es dann selbst.) */
	async covers(point: LngLat): Promise<boolean> {
		try {
			return tileKey(tileOf(point)) in (await this.manifest()).tiles;
		} catch {
			return true;
		}
	}

	/** Eine Kachel holen (aus dem Speicher, dem Browser-Cache oder dem Netz); `undefined`, wenn es dort keine Daten gibt */
	tile(id: TileId): Promise<TileData | undefined> {
		const key = tileKey(id);
		let found = this.tiles.get(key);
		if (found) {
			// ans Ende der Reihe: zuletzt benutzt
			this.tiles.delete(key);
			this.tiles.set(key, found);
			return found;
		}
		found = (async () => {
			const manifest = await this.manifest();
			if (!(key in manifest.tiles)) return undefined;
			const response = await fetch(`${this.baseUrl}/${manifest.dir}/${key}.tile`);
			if (!response.ok || !response.body) throw new Error(`Kachel ${key} nicht geladen`);
			const unpacked = response.body.pipeThrough(new DecompressionStream('deflate-raw'));
			return decodeTile(new Uint8Array(await new Response(unpacked).arrayBuffer()));
		})();
		found.catch(() => this.tiles.delete(key));
		this.tiles.set(key, found);
		while (this.tiles.size > KEEP_TILES) this.tiles.delete(this.tiles.keys().next().value!);
		return found;
	}

	/** Kacheln vorab laden (z. B. sobald Start und Ziel feststehen), Fehler sind hier egal */
	prefetch(ids: TileId[]): Promise<void> {
		return Promise.allSettled(ids.map((id) => this.tile(id))).then(() => undefined);
	}

	/** Karten für ein Gebiet aus Kacheln zusammensetzen (gleiche Kacheln → gleiches Ergebnis aus dem Speicher) */
	area(ids: TileId[]): Promise<AreaData> {
		const key = ids
			.map(tileKey)
			.sort()
			.join(',');
		let found = this.areas.get(key);
		if (found) return found;
		found = this.assemble(ids);
		found.catch(() => this.areas.delete(key));
		this.areas.set(key, found);
		while (this.areas.size > KEEP_AREAS) this.areas.delete(this.areas.keys().next().value!);
		return found;
	}

	private async assemble(ids: TileId[]): Promise<AreaData> {
		const manifest = await this.manifest().catch(() => undefined);
		const settled = await Promise.allSettled(ids.map((id) => this.tile(id)));
		const loaded: TileData[] = [];
		for (const s of settled) {
			if (s.status === 'fulfilled' && s.value) loaded.push(s.value);
			else if (s.status === 'rejected') console.warn('Kachel nicht verfügbar:', s.reason);
		}
		if (!loaded.length) return { tiles: [] };

		const range = rangeOf(loaded);
		const nx = range.x1 - range.x0 + 1;
		const ny = range.y1 - range.y0 + 1;
		const west = tileWest(range.x0);
		const north = tileNorth(range.y1);

		// Raster: Zeilen der Kacheln nebeneinander kopieren; Kacheln ohne Daten bleiben leer
		const cw = TILE_CELLS.coarse.width;
		const ch = TILE_CELLS.coarse.height;
		const fw = TILE_CELLS.fine.width;
		const fh = TILE_CELLS.fine.height;
		const coarseW = nx * cw;
		const coarseH = ny * ch;
		const fineW = nx * fw;
		const fineH = ny * fh;
		const coarse = new Uint8Array(coarseW * coarseH);
		const fineLayer = (fineW * fineH) / 8;
		const tileLayer = (fw * fh) / 8;
		const fine = new Uint8Array(3 * fineLayer);
		const roads = new Uint8Array(2 * fineLayer);
		for (const t of loaded) {
			const c0 = (t.x - range.x0) * cw;
			const r0 = (range.y1 - t.y) * ch;
			for (let r = 0; r < ch; r++) coarse.set(t.coarse.subarray(r * cw, (r + 1) * cw), (r0 + r) * coarseW + c0);
			const fc0 = (t.x - range.x0) * fw;
			const fr0 = (range.y1 - t.y) * fh;
			for (const [target, source, layers] of [
				[fine, t.fine, 3],
				[roads, t.roads, 2]
			] as const) {
				for (let layer = 0; layer < layers; layer++) {
					for (let r = 0; r < fh; r++) {
						const from = layer * tileLayer + (r * fw) / 8;
						target.set(source.subarray(from, from + fw / 8), layer * fineLayer + ((fr0 + r) * fineW + fc0) / 8);
					}
				}
			}
		}

		const landmarks: NamedPoint[] = [];
		const places: NamedPoint[] = [];
		const pois: Poi[] = [];
		for (const t of loaded) {
			const p = this.parse(t, manifest?.kinds);
			landmarks.push(...p.landmarks);
			places.push(...p.places);
			pois.push(...p.pois);
		}

		return {
			landscape: new Landscape({ west, north, cellLon: COARSE_E4.lon / 1e4, cellLat: COARSE_E4.lat / 1e4, width: coarseW, height: coarseH }, coarse),
			fine: new FineMap(
				{ west, north, cellLon: FINE_E4.lon / 1e4, cellLat: FINE_E4.lat / 1e4, width: fineW, height: fineH, layers: ['forest', 'green', 'water'] },
				fine
			),
			roads: new RoadMask(
				{ west, north, cellLon: FINE_E4.lon / 1e4, cellLat: FINE_E4.lat / 1e4, width: fineW, height: fineH, layers: 2 },
				roads
			),
			names: { landmarks: new NameIndex(landmarks), places: new NameIndex(places) },
			pois: new PoiIndex(pois),
			streams: joinStreams(loaded.flatMap((t) => t.streams)),
			tiles: loaded.map((t) => tileKey(t))
		};
	}

	private parse(t: TileData, kinds: string[] | undefined) {
		let p = this.parsed.get(t);
		if (!p) {
			p = {
				landmarks: parseLandmarks(t.landmarks),
				places: parsePlaces({ places: t.places }),
				pois: parsePois({ kinds: kinds ?? [], items: t.pois })
			};
			this.parsed.set(t, p);
		}
		return p;
	}
}

const stores = new Map<string, TileStore>();

/** Der Kachelspeicher für eine Adresse (einer je Seite bzw. Hintergrundprozess, damit geladene Kacheln wiederverwendet werden) */
export function tileStore(baseUrl: string): TileStore {
	let store = stores.get(baseUrl);
	if (!store) stores.set(baseUrl, (store = new TileStore(baseUrl)));
	return store;
}

/**
 * Gewässerstücke aus den geladenen Kacheln wieder zu Linien verbinden: aufeinanderfolgende Stücke derselben Linie
 * überlappen um einen Punkt davor und danach (siehe scripts/build-tiles.ts); fehlt eine Kachel, bleibt die Linie getrennt.
 */
export function joinStreams(pieces: StreamPiece[]): Watercourse[] {
	const byLine = new Map<number, StreamPiece[]>();
	for (const piece of pieces) (byLine.get(piece.id) ?? byLine.set(piece.id, []).get(piece.id)!).push(piece);
	const out: Watercourse[] = [];
	for (const parts of byLine.values()) {
		parts.sort((a, b) => a.seq - b.seq);
		let current: { name: string; line: [number, number][]; seq: number } | undefined;
		for (const part of parts) {
			const points = decodePolyline(part.line);
			if (current && part.seq === current.seq + 1) {
				// die ersten beiden Punkte dieses Stücks stehen schon am Ende des vorigen
				current.line.push(...points.slice(2));
				current.seq = part.seq;
			} else {
				if (current) out.push({ name: current.name, line: current.line });
				current = { name: part.name, line: [...points], seq: part.seq };
			}
		}
		if (current) out.push({ name: current.name, line: current.line });
	}
	return out;
}
