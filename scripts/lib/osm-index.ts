/**
 * OSM-Regionsdatei einmal einlesen und danach Fenster für Fenster auslesen – für große Gebiete (ganz NRW + Niederlande),
 * bei denen `readOsm` (alle passenden Objekte samt Geometrie auf einmal) zu viel Speicher brauchte.
 *
 * Merkt sich je passendem Weg nur Verweise auf die Koordinaten (Int32 in einem großen Feld) und den Umriss;
 * die Geometrie-Objekte (OsmElement) entstehen erst in `elements(name, fenster)` und nur für das Fenster.
 * Läufe durch die Datei wie bei readOsm: (1) passende Objekte, (2) Teil-Wege von Flächen, (3) Koordinaten.
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import {
	centerOf,
	indexOf,
	scan,
	sortedIds,
	type Bounds,
	type OsmElement,
	type OsmKind,
	type OsmQuery,
	type Tags
} from './osm-file.ts';

interface IndexedWay {
	id: number;
	names: string[];
	tags: Tags;
	/** Anfang und Länge im gemeinsamen Verweis-Feld */
	start: number;
	length: number;
}

interface IndexedRelation {
	id: number;
	names: string[];
	tags: Tags;
	members: { type: OsmKind; ref: number; role: string }[];
}

interface IndexedNode {
	id: number;
	lat: number;
	lon: number;
	names: string[];
	tags: Tags;
}

export interface OsmIndex {
	/** Objekte einer Auswahl, deren Umriss das Fenster berührt (ohne Fenster: alle) */
	elements(name: string, window?: Bounds): OsmElement[];
	counts: Record<string, number>;
	/** Ausdehnung aller gelesenen Punkte */
	bounds: Bounds;
}

const EMPTY: Tags = Object.freeze({}) as Tags;

export async function indexOsm(
	queries: Record<string, OsmQuery>,
	options: { path: string; log?: (text: string) => void }
): Promise<OsmIndex> {
	const log = options.log ?? ((text: string) => console.log(text));
	const names = Object.keys(queries);
	const matching = (tags: Tags, kind: OsmKind) => names.filter((name) => queries[name](tags, kind));
	const { path } = options;

	const nodes: IndexedNode[] = [];
	const wayRefs = new Map<number, number[]>(); // alle benötigten Wege (passende und Teil-Wege von Flächen)
	const hitWays = new Map<number, { names: string[]; tags: Tags }>();
	const relations: IndexedRelation[] = [];

	log('OSM-Datei, Lauf 1 von 3: passende Objekte suchen …');
	await scan(path, {
		node(id, lat, lon, tags) {
			const t = tags();
			if (t === EMPTY) return;
			const hit = matching(t, 'node');
			if (hit.length) nodes.push({ id, lat, lon, names: hit, tags: t });
		},
		way(id, refs, tags) {
			const t = tags();
			const hit = matching(t, 'way');
			if (!hit.length) return;
			hitWays.set(id, { names: hit, tags: t });
			wayRefs.set(id, refs());
		},
		relation(id, members, tags) {
			const t = tags();
			const hit = matching(t, 'relation');
			if (hit.length) relations.push({ id, names: hit, tags: t, members: members() });
		}
	});
	log(`  ${nodes.length} Punkte, ${hitWays.size} Wege, ${relations.length} Beziehungen`);

	const memberWays = new Set<number>();
	for (const r of relations) for (const m of r.members) if (m.type === 'way' && !wayRefs.has(m.ref)) memberWays.add(m.ref);
	if (memberWays.size) {
		log(`OSM-Datei, Lauf 2 von 3: ${memberWays.size} Teil-Wege von Flächen …`);
		await scan(path, {
			way(id, refs) {
				if (memberWays.has(id)) wayRefs.set(id, refs());
			}
		});
	}
	memberWays.clear();

	// Lauf 3: Koordinaten aller benötigten Punkte
	const needed = sortedIds(
		(function* () {
			for (const refs of wayRefs.values()) yield* refs;
		})()
	);
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

	// Verweise auf Koordinaten statt Punkt-Nummern (4 statt 8 Byte, und die Suche entfällt später)
	let total = 0;
	for (const refs of wayRefs.values()) total += refs.length;
	const pool = new Int32Array(total);
	const span = new Map<number, { start: number; length: number }>();
	let at = 0;
	for (const [id, refs] of wayRefs) {
		const start = at;
		for (const ref of refs) {
			const i = indexOf(needed, ref);
			if (i >= 0 && !Number.isNaN(lats[i])) pool[at++] = i;
		}
		span.set(id, { start, length: at - start });
	}
	wayRefs.clear();

	const ways: IndexedWay[] = [];
	const bbox = new Float32Array(hitWays.size * 4); // west, south, east, north je passendem Weg
	let w = 0;
	for (const [id, hit] of hitWays) {
		const s = span.get(id)!;
		ways.push({ id, names: hit.names, tags: hit.tags, start: s.start, length: s.length });
		let west = Infinity;
		let south = Infinity;
		let east = -Infinity;
		let north = -Infinity;
		for (let k = s.start; k < s.start + s.length; k++) {
			const lon = lons[pool[k]];
			const lat = lats[pool[k]];
			if (lon < west) west = lon;
			if (lon > east) east = lon;
			if (lat < south) south = lat;
			if (lat > north) north = lat;
		}
		bbox.set([west, south, east, north], w * 4);
		w++;
	}
	hitWays.clear();

	const geometryAt = (s: { start: number; length: number }) => {
		const out: { lat: number; lon: number }[] = new Array(s.length);
		for (let k = 0; k < s.length; k++) out[k] = { lat: lats[pool[s.start + k]], lon: lons[pool[s.start + k]] };
		return out;
	};
	const touches = (b: Bounds | undefined, west: number, south: number, east: number, north: number) =>
		!b || (east >= b.west && west <= b.east && north >= b.south && south <= b.north);

	// nach Auswahl vorsortiert, damit elements() nicht alles durchsucht
	const waysByName = new Map<string, number[]>();
	ways.forEach((way, i) => way.names.forEach((n) => (waysByName.get(n) ?? waysByName.set(n, []).get(n)!).push(i)));

	const counts: Record<string, number> = {};
	for (const n of names) {
		counts[n] =
			nodes.filter((x) => x.names.includes(n)).length +
			(waysByName.get(n)?.length ?? 0) +
			relations.filter((r) => r.names.includes(n)).length;
	}
	for (const n of names) log(`  ${n}: ${counts[n]} Objekte`);

	const bounds: Bounds = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
	for (let i = 0; i < needed.length; i++) {
		if (Number.isNaN(lats[i])) continue;
		bounds.west = Math.min(bounds.west, lons[i]);
		bounds.east = Math.max(bounds.east, lons[i]);
		bounds.south = Math.min(bounds.south, lats[i]);
		bounds.north = Math.max(bounds.north, lats[i]);
	}

	return {
		counts,
		bounds,
		elements(name, window) {
			const out: OsmElement[] = [];
			for (const n of nodes) {
				if (!n.names.includes(name)) continue;
				if (window && !touches(window, n.lon, n.lat, n.lon, n.lat)) continue;
				out.push({ type: 'node', id: n.id, lat: n.lat, lon: n.lon, tags: n.tags });
			}
			for (const i of waysByName.get(name) ?? []) {
				const way = ways[i];
				if (!way.length || !touches(window, bbox[i * 4], bbox[i * 4 + 1], bbox[i * 4 + 2], bbox[i * 4 + 3])) continue;
				const geometry = geometryAt(way);
				out.push({ type: 'way', id: way.id, tags: way.tags, geometry, center: centerOf(geometry) });
			}
			for (const r of relations) {
				if (!r.names.includes(name)) continue;
				const members = r.members.map((m) => ({
					type: m.type,
					role: m.role,
					span: m.type === 'way' ? span.get(m.ref) : undefined
				}));
				// Fenster-Prüfung über die Teil-Wege (Umriss der Beziehung)
				let west = Infinity;
				let south = Infinity;
				let east = -Infinity;
				let north = -Infinity;
				for (const m of members) {
					if (!m.span) continue;
					for (let k = m.span.start; k < m.span.start + m.span.length; k++) {
						const lon = lons[pool[k]];
						const lat = lats[pool[k]];
						if (lon < west) west = lon;
						if (lon > east) east = lon;
						if (lat < south) south = lat;
						if (lat > north) north = lat;
					}
				}
				if (west === Infinity || !touches(window, west, south, east, north)) continue;
				const resolved = members.map((m) => ({ type: m.type, role: m.role, geometry: m.span ? geometryAt(m.span) : undefined }));
				const center = centerOf(resolved.flatMap((m) => m.geometry ?? []));
				out.push({ type: 'relation', id: r.id, tags: r.tags, members: resolved, center });
			}
			return out;
		}
	};
}
