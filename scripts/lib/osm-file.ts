/**
 * OpenStreetMap-Daten direkt aus der Regionsdatei lesen (dieselbe Datei, die auch GraphHopper nutzt) –
 * statt über die öffentlichen Overpass-Server, die oft überlastet sind.
 *
 * Datei: routing/data/*.osm.pbf (Geofabrik-Auszug, `npm run routing:setup`), anders über OSM_FILE=…
 * Gilt für jede Region: andere Datei → andere Daten, dieselben Skripte.
 *
 * Ergebnis im selben Format wie früher die Overpass-Antworten („out geom“ / „out center“), damit die
 * Skripte unverändert damit arbeiten. Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { readOsmPbf, type OsmPbfBlock } from '@osmix/pbf';

export interface OsmElement {
	type: 'node' | 'way' | 'relation';
	id: number;
	lat?: number;
	lon?: number;
	center?: { lat: number; lon: number };
	tags?: Record<string, string>;
	geometry?: { lat: number; lon: number }[];
	members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
}

export type Tags = Record<string, string>;
export type OsmKind = 'node' | 'way' | 'relation';
/** Auswahl wie früher die Overpass-Abfrage: welche Objekte gehören dazu? */
export type OsmQuery = (tags: Tags, kind: OsmKind) => boolean;

export interface Bounds {
	west: number;
	south: number;
	east: number;
	north: number;
}

const MEMBER_TYPES = ['node', 'way', 'relation'] as const;
const EMPTY: Tags = Object.freeze({}) as Tags;
const noTags = () => EMPTY;

/** Pfad zur Regionsdatei: OSM_FILE oder die (einzige) .osm.pbf in routing/data */
export async function osmFilePath(): Promise<string> {
	if (process.env.OSM_FILE) return process.env.OSM_FILE;
	const dir = new URL('../../routing/data/', import.meta.url);
	const files = (await readdir(dir)).filter((f) => f.endsWith('.osm.pbf'));
	if (files.length !== 1) {
		throw new Error(
			`Erwarte genau eine .osm.pbf in routing/data (gefunden: ${files.length}). Erst „npm run routing:setup“ ausführen oder OSM_FILE setzen.`
		);
	}
	return new URL(files[0], dir).pathname.replace(/^\/([A-Za-z]:)/, '$1');
}

async function openBlocks(path: string) {
	const stream = Readable.toWeb(createReadStream(path)) as unknown as WebReadableStream<Uint8Array>;
	return readOsmPbf(stream as unknown as ReadableStream<Uint8Array>);
}

/** Ausdehnung der Region aus dem Kopf der Datei */
export async function osmFileBounds(path: string): Promise<Bounds> {
	const { header } = await openBlocks(path);
	const b = header.bbox;
	if (!b) throw new Error('Die OSM-Datei nennt keine Ausdehnung (bbox).');
	return { west: b.left, east: b.right, north: b.top, south: b.bottom };
}

/** Alle Blöcke einer Datei durchgehen; `visit` bekommt Hilfen zum Entschlüsseln */
async function scan(
	path: string,
	visit: {
		node?: (id: number, lat: number, lon: number, tags: () => Tags) => void;
		way?: (id: number, refs: () => number[], tags: () => Tags) => void;
		relation?: (id: number, members: () => { type: OsmKind; ref: number; role: string }[], tags: () => Tags) => void;
	}
) {
	const { blocks } = await openBlocks(path);
	const decoder = new TextDecoder();
	for await (const raw of blocks) {
		const block = raw as OsmPbfBlock;
		const strings: (string | undefined)[] = [];
		const str = (i: number) => (strings[i] ??= decoder.decode(block.stringtable[i]));
		const granularity = block.granularity ?? 100;
		const latOffset = block.lat_offset ?? 0;
		const lonOffset = block.lon_offset ?? 0;
		const toDeg = (value: number, offset: number) => (offset + granularity * value) / 1e9;
		const keyedTags = (keys: number[], vals: number[]) => () => {
			const tags: Tags = {};
			for (let i = 0; i < keys.length; i++) tags[str(keys[i])] = str(vals[i]);
			return tags;
		};

		for (const group of block.primitivegroup) {
			if (visit.node) {
				for (const n of group.nodes) visit.node(n.id, toDeg(n.lat, latOffset), toDeg(n.lon, lonOffset), keyedTags(n.keys, n.vals));
				const dense = group.dense;
				if (dense && dense.id.length) {
					// Dichte Knoten: IDs und Koordinaten als Differenzen, Tags als k,v,…,0 hintereinander
					let id = 0;
					let lat = 0;
					let lon = 0;
					let kv = 0;
					const kvs = dense.keys_vals;
					for (let i = 0; i < dense.id.length; i++) {
						id += dense.id[i];
						lat += dense.lat[i];
						lon += dense.lon[i];
						const start = kv;
						if (kvs.length) {
							while (kvs[kv] !== 0) kv += 2;
							kv++;
						}
						const end = kv - 1;
						visit.node(
							id,
							toDeg(lat, latOffset),
							toDeg(lon, lonOffset),
							start >= end
								? noTags
								: () => {
										const tags: Tags = {};
										for (let k = start; k < end; k += 2) tags[str(kvs[k])] = str(kvs[k + 1]);
										return tags;
									}
						);
					}
				}
			}
			if (visit.way) {
				for (const w of group.ways) {
					visit.way(
						w.id,
						() => {
							const refs: number[] = new Array(w.refs.length);
							let ref = 0;
							for (let i = 0; i < w.refs.length; i++) refs[i] = ref += w.refs[i];
							return refs;
						},
						keyedTags(w.keys, w.vals)
					);
				}
			}
			if (visit.relation) {
				for (const r of group.relations) {
					visit.relation(
						r.id,
						() => {
							let ref = 0;
							return r.memids.map((delta, i) => ({
								type: MEMBER_TYPES[r.types[i]],
								ref: (ref += delta),
								role: str(r.roles_sid[i])
							}));
						},
						keyedTags(r.keys, r.vals)
					);
				}
			}
		}
	}
}

/** Sortierte, eindeutige IDs für schnelles Nachschlagen (spart viel Speicher gegenüber einem Set) */
function sortedIds(ids: Iterable<number>): Float64Array {
	const array = Float64Array.from(ids).sort();
	let n = 0;
	for (let i = 0; i < array.length; i++) if (i === 0 || array[i] !== array[i - 1]) array[n++] = array[i];
	return array.subarray(0, n);
}

function indexOf(sorted: Float64Array, id: number): number {
	let lo = 0;
	let hi = sorted.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1;
		const v = sorted[mid];
		if (v === id) return mid;
		if (v < id) lo = mid + 1;
		else hi = mid - 1;
	}
	return -1;
}

function centerOf(points: { lat: number; lon: number }[]): { lat: number; lon: number } | undefined {
	if (!points.length) return undefined;
	let west = Infinity;
	let east = -Infinity;
	let south = Infinity;
	let north = -Infinity;
	for (const p of points) {
		west = Math.min(west, p.lon);
		east = Math.max(east, p.lon);
		south = Math.min(south, p.lat);
		north = Math.max(north, p.lat);
	}
	return { lat: (south + north) / 2, lon: (west + east) / 2 };
}

/**
 * Liest die Objekte zu mehreren Auswahlen in einem Durchgang (drei Läufe durch die Datei:
 * Wege/Beziehungen, Teil-Wege der Beziehungen, Knoten-Koordinaten).
 * Wege und Beziehungen bekommen ihre Geometrie und einen Mittelpunkt (`center`).
 */
export async function readOsm<Q extends Record<string, OsmQuery>>(
	queries: Q,
	options: { path?: string; log?: (text: string) => void } = {}
): Promise<Record<keyof Q, OsmElement[]>> {
	const path = options.path ?? (await osmFilePath());
	const log = options.log ?? ((text: string) => console.log(text));
	const names = Object.keys(queries) as (keyof Q)[];
	const matching = (tags: Tags, kind: OsmKind) => names.filter((name) => queries[name](tags, kind));

	type Hit = { names: (keyof Q)[]; tags: Tags };
	const nodes: { id: number; lat: number; lon: number; hit: Hit }[] = [];
	const ways = new Map<number, { refs: number[]; hit?: Hit }>();
	const relations: { id: number; members: { type: OsmKind; ref: number; role: string }[]; hit: Hit }[] = [];

	// Lauf 1: passende Knoten (mit Koordinaten), Wege (mit Knoten-IDs) und Beziehungen
	log('OSM-Datei, Lauf 1 von 3: passende Objekte suchen …');
	await scan(path, {
		node(id, lat, lon, tags) {
			const t = tags();
			if (t === EMPTY) return;
			const hit = matching(t, 'node');
			if (hit.length) nodes.push({ id, lat, lon, hit: { names: hit, tags: t } });
		},
		way(id, refs, tags) {
			const t = tags();
			const hit = matching(t, 'way');
			if (hit.length) ways.set(id, { refs: refs(), hit: { names: hit, tags: t } });
		},
		relation(id, members, tags) {
			const t = tags();
			const hit = matching(t, 'relation');
			if (hit.length) relations.push({ id, members: members(), hit: { names: hit, tags: t } });
		}
	});

	// Lauf 2: Wege, die Teil einer passenden Beziehung sind (z. B. Außenränder großer Wälder)
	const memberWays = new Set<number>();
	for (const r of relations) for (const m of r.members) if (m.type === 'way' && !ways.has(m.ref)) memberWays.add(m.ref);
	if (memberWays.size) {
		log(`OSM-Datei, Lauf 2 von 3: ${memberWays.size} Teil-Wege von Flächen …`);
		await scan(path, {
			way(id, refs) {
				if (memberWays.has(id)) ways.set(id, { refs: refs() });
			}
		});
	}

	// Lauf 3: Koordinaten aller benötigten Knoten
	const needed = sortedIds((function* () {
		for (const w of ways.values()) yield* w.refs;
	})());
	log(`OSM-Datei, Lauf 3 von 3: Koordinaten für ${needed.length} Punkte …`);
	const lats = new Float64Array(needed.length).fill(NaN);
	const lons = new Float64Array(needed.length);
	await scan(path, {
		node(id, lat, lon) {
			const i = indexOf(needed, id);
			if (i >= 0) {
				lats[i] = lat;
				lons[i] = lon;
			}
		}
	});
	const geometryOf = (refs: number[]) => {
		const out: { lat: number; lon: number }[] = [];
		for (const ref of refs) {
			const i = indexOf(needed, ref);
			// Knoten außerhalb des Auszugs fehlen – solche Punkte einfach auslassen
			if (i >= 0 && !Number.isNaN(lats[i])) out.push({ lat: lats[i], lon: lons[i] });
		}
		return out;
	};

	const result = Object.fromEntries(names.map((name) => [name, [] as OsmElement[]])) as Record<keyof Q, OsmElement[]>;
	for (const n of nodes) {
		for (const name of n.hit.names) result[name].push({ type: 'node', id: n.id, lat: n.lat, lon: n.lon, tags: n.hit.tags });
	}
	for (const [id, w] of ways) {
		if (!w.hit) continue;
		const geometry = geometryOf(w.refs);
		if (geometry.length < 1) continue;
		const element: OsmElement = { type: 'way', id, tags: w.hit.tags, geometry, center: centerOf(geometry) };
		for (const name of w.hit.names) result[name].push(element);
	}
	for (const r of relations) {
		const members = r.members.map((m) => ({
			type: m.type,
			role: m.role,
			geometry: m.type === 'way' ? geometryOf(ways.get(m.ref)?.refs ?? []) : undefined
		}));
		const center = centerOf(members.flatMap((m) => m.geometry ?? []));
		const element: OsmElement = { type: 'relation', id: r.id, tags: r.hit.tags, members, center };
		for (const name of r.hit.names) result[name].push(element);
	}
	for (const name of names) log(`  ${String(name)}: ${result[name].length} Objekte`);
	return result;
}
