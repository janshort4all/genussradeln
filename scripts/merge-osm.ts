/**
 * Mehrere OSM-Auszüge (Geofabrik) zu einer Datei zusammenfügen – z. B. NRW + niederländische Grenzprovinzen für GraphHopper
 * (das nur eine Datei liest). Ohne osmium: dieses Skript genügt.
 *
 *   node scripts/merge-osm.ts ziel.osm.pbf quelle1.osm.pbf quelle2.osm.pbf …
 *
 * Aufbau der Ausgabe wie erwartet: erst alle Punkte, dann alle Wege, dann alle Beziehungen (je Quelle nacheinander, daher drei Durchgänge
 * über jede Datei). Wege und Beziehungen, die in mehreren Auszügen vorkommen (an den Grenzen), werden nur einmal übernommen; Punkte mit
 * gleicher Nummer sind in allen Auszügen gleich und stören nicht. Die Ausgabe ist deshalb nicht nach Nummern sortiert – der Kopf sagt das nicht.
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable, Writable } from 'node:stream';
import {
	OsmBlocksToPbfBytesTransformStream,
	readOsmPbf,
	type OsmPbfBlock,
	type OsmPbfGroup,
	type OsmPbfHeaderBlock
} from '@osmix/pbf';

const [target, ...sources] = process.argv.slice(2);
if (!target || sources.length < 2) {
	console.error('Aufruf: node scripts/merge-osm.ts ziel.osm.pbf quelle1.osm.pbf quelle2.osm.pbf …');
	process.exit(1);
}

type Pass = 'nodes' | 'ways' | 'relations';

async function open(path: string) {
	const stream = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream<Uint8Array>;
	return readOsmPbf(stream);
}

// Wege: ein Bit je Nummer (die Nummern gehen über 1,5 Milliarden, ein Set fasst nur ca. 16 Millionen Einträge)
const wayBits = new Uint8Array(2 ** 29);
let wayCount = 0;
function firstSeen(id: number): boolean {
	const byte = id >>> 3;
	const bit = 1 << (id & 7);
	if (id < 0 || byte >= wayBits.length) throw new Error(`Wegnummer ${id} zu groß`);
	if (wayBits[byte] & bit) return false;
	wayBits[byte] |= bit;
	wayCount++;
	return true;
}
const seenRelations = new Set<number>();

// Punkte: GraphHopper bricht bei doppelten Punktnummern ab (Grenzgebiete liegen in mehreren Auszügen) – ein Bit je Nummer (Nummern bis ca. 14 Milliarden)
const nodeBits = new Uint8Array(2 ** 31);
let nodeCount = 0;
function nodeFirstSeen(id: number): boolean {
	const byte = Math.floor(id / 8);
	const bit = 1 << (id % 8);
	if (id < 0 || byte >= nodeBits.length) throw new Error(`Punktnummer ${id} zu groß`);
	if (nodeBits[byte] & bit) return false;
	nodeBits[byte] |= bit;
	nodeCount++;
	return true;
}

/** Dichte Punkte (Unterschiede zum Vorgänger gespeichert) ohne die schon bekannten neu zusammensetzen; Zusatzangaben (Version, Zeit …) entfallen */
function filterDense(dense: NonNullable<OsmPbfGroup['dense']>): OsmPbfGroup['dense'] | undefined {
	const out = { id: [] as number[], lat: [] as number[], lon: [] as number[], keys_vals: [] as number[] };
	const hasTags = dense.keys_vals.length > 0;
	let id = 0, lat = 0, lon = 0, kv = 0, prevId = 0, prevLat = 0, prevLon = 0;
	for (let i = 0; i < dense.id.length; i++) {
		id += dense.id[i];
		lat += dense.lat[i];
		lon += dense.lon[i];
		let end = kv;
		if (hasTags) {
			while (dense.keys_vals[end] !== 0) end += 2;
			end++;
		}
		if (nodeFirstSeen(id)) {
			out.id.push(id - prevId);
			out.lat.push(lat - prevLat);
			out.lon.push(lon - prevLon);
			prevId = id;
			prevLat = lat;
			prevLon = lon;
			for (let k = kv; k < end; k++) out.keys_vals.push(dense.keys_vals[k]);
		}
		kv = end;
	}
	return out.id.length ? out : undefined;
}

/** Nur die Gruppen der gewünschten Art; Wege und Beziehungen, die schon vorkamen, entfallen */
function pick(group: OsmPbfGroup, pass: Pass): OsmPbfGroup | undefined {
	if (pass === 'nodes') {
		const nodes = group.nodes.filter((n) => nodeFirstSeen(n.id));
		const dense = group.dense?.id.length ? filterDense(group.dense) : undefined;
		return nodes.length || dense ? { nodes, dense, ways: [], relations: [] } : undefined;
	}
	if (pass === 'ways') {
		const ways = group.ways.filter((w) => firstSeen(w.id));
		return ways.length ? { nodes: [], ways, relations: [] } : undefined;
	}
	const relations = group.relations.filter((r) => !seenRelations.has(r.id) && !!seenRelations.add(r.id));
	return relations.length ? { nodes: [], ways: [], relations } : undefined;
}

async function* output(): AsyncGenerator<OsmPbfHeaderBlock | OsmPbfBlock> {
	const first = await open(sources[0]);
	const header: OsmPbfHeaderBlock = {
		...first.header,
		bbox: undefined,
		optional_features: first.header.optional_features.filter((f) => !f.startsWith('Sort.')),
		writingprogram: 'genuss-radeln merge-osm',
		source: sources.join(' + ')
	};
	yield header;
	for (const pass of ['nodes', 'ways', 'relations'] as const) {
		let count = 0;
		for (const source of sources) {
			const { blocks } = await open(source);
			for await (const raw of blocks) {
				const block = raw as OsmPbfBlock;
				const groups = block.primitivegroup.map((g) => pick(g, pass)).filter((g): g is OsmPbfGroup => !!g);
				if (!groups.length) continue;
				count += groups.length;
				yield { ...block, primitivegroup: groups };
			}
			console.log(`  ${pass}: ${source} fertig`);
		}
		console.log(`${pass}: ${count} Gruppen geschrieben`);
	}
}

const started = Date.now();
const encoded = ReadableStream.from(output()).pipeThrough(new OsmBlocksToPbfBytesTransformStream());
await encoded.pipeTo(Writable.toWeb(createWriteStream(target)) as unknown as WritableStream<Uint8Array>);
console.log(`Fertig: ${target} nach ${Math.round((Date.now() - started) / 1000)} s (${nodeCount} Punkte, ${wayCount} Wege, ${seenRelations.size} Beziehungen)`);
