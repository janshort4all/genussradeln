/**
 * Erzeugt die Stopp-Datei (F9): Cafés, Eiscafés, Biergärten, Toiletten, Aussichtspunkte, Rastplätze, Bänke
 * und E-Bike-Ladepunkte im Regierungsbezirk Düsseldorf aus OpenStreetMap (Overpass).
 *
 * Ausgabe: static/data/pois.json – kompakt:
 *   { kinds: [...], items: [[lon·1e5, lat·1e5, Art-Index, Merkmal-Bits, Name?], …] }
 * Bänke werden ausgedünnt (höchstens eine je ca. 300 m), damit die Datei klein bleibt.
 *
 * Aufruf: npm run data:pois   (Overpass-Antworten werden in scripts/.cache/ zwischengespeichert)
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { FLAG, STOP_KINDS, type StopKind } from '../src/lib/stops/kinds.ts';
import { loadRegionTiles, type OsmElement } from './lib/overpass.ts';

type Item = [number, number, number, number, string?];

const BENCH_CELL_LON = 0.0045; // ≈ 310 m
const BENCH_CELL_LAT = 0.0027; // ≈ 300 m

const items = new Map<string, Item>();
/** beste Bank je Rasterzelle */
const benches = new Map<string, { item: Item; quality: number }>();

await loadRegionTiles({
	cacheName: 'pois',
	tiles: [4, 4],
	body: (bbox) => `  nwr["amenity"~"^(cafe|ice_cream|biergarten|toilets|bench|shelter)$"](${bbox});
  nwr["amenity"="restaurant"]["beer_garden"="yes"](${bbox});
  nwr["amenity"="charging_station"]["bicycle"="yes"](${bbox});
  nwr["amenity"="charging_station"]["name"~"[Ee]-?[Bb]ike|Fahrrad|Pedelec"](${bbox});
  nwr["tourism"~"^(viewpoint|picnic_site)$"](${bbox});`,
	output: 'out center tags;',
	onTile: (elements, tx, ty) => {
		let before = items.size + benches.size;
		for (const element of elements) add(element);
		console.log(`Kachel ${tx},${ty}: ${elements.length} Objekte, ${items.size + benches.size - before} neu`);
	}
});

const all = [...items.values(), ...[...benches.values()].map((b) => b.item)];
const counts = Object.fromEntries(STOP_KINDS.map((k, i) => [k, all.filter((it) => it[2] === i).length]));
console.log('Anzahl je Art:', counts);

await mkdir(new URL('../static/data/', import.meta.url), { recursive: true });
const json = JSON.stringify({
	kinds: STOP_KINDS,
	items: all,
	source: '© OpenStreetMap-Mitwirkende (ODbL)',
	created: new Date().toISOString().slice(0, 10)
});
await writeFile(new URL('../static/data/pois.json', import.meta.url), json + '\n');
console.log(`Fertig: static/data/pois.json (${Math.round(json.length / 1024)} KB, ${all.length} Stopps)`);

// ---------------------------------------------------------------------------

function kindOf(t: Record<string, string>): StopKind | undefined {
	if (t.access === 'private' || t.access === 'no') return undefined;
	switch (t.amenity) {
		case 'cafe':
			return t.cuisine?.includes('ice_cream') ? 'eis' : 'cafe';
		case 'ice_cream':
			return 'eis';
		case 'biergarten':
			return 'biergarten';
		case 'restaurant':
			return t.beer_garden === 'yes' ? 'biergarten' : undefined;
		case 'toilets':
			return 'toilette';
		case 'bench':
			return 'bank';
		case 'charging_station':
			return 'laden';
		case 'shelter':
			// Wartehäuschen an Haltestellen sind keine Rastplätze
			return t.shelter_type === 'public_transport' || t.public_transport ? undefined : 'rast';
	}
	if (t.tourism === 'viewpoint') return 'aussicht';
	if (t.tourism === 'picnic_site') return 'rast';
	return undefined;
}

function flagsOf(t: Record<string, string>, kind: StopKind): number {
	let flags = 0;
	if (t.outdoor_seating === 'yes' || t.beer_garden === 'yes' || kind === 'biergarten') flags |= FLAG.outdoor;
	if (t.website || t['contact:website'] || t.url) flags |= FLAG.website;
	if (t.opening_hours) flags |= FLAG.hours;
	if (t.wheelchair === 'yes' || t['toilets:wheelchair'] === 'yes') flags |= FLAG.wheelchair;
	if (t.backrest === 'yes') flags |= FLAG.backrest;
	if (t.covered === 'yes' || t.amenity === 'shelter') flags |= FLAG.covered;
	return flags;
}

function add(element: OsmElement) {
	const key = `${element.type}/${element.id}`;
	if (items.has(key)) return;
	const tags = element.tags ?? {};
	const kind = kindOf(tags);
	if (!kind) return;
	const lat = element.lat ?? element.center?.lat;
	const lon = element.lon ?? element.center?.lon;
	if (lat === undefined || lon === undefined) return;

	const flags = flagsOf(tags, kind);
	const item: Item = [Math.round(lon * 1e5), Math.round(lat * 1e5), STOP_KINDS.indexOf(kind), flags];
	const name = tags.name?.trim();
	if (name && kind !== 'bank') item.push(name);

	if (kind === 'bank') {
		const cell = `${Math.floor(lon / BENCH_CELL_LON)}:${Math.floor(lat / BENCH_CELL_LAT)}`;
		const quality = flags & FLAG.backrest ? 1 : 0;
		const existing = benches.get(cell);
		if (!existing || quality > existing.quality) benches.set(cell, { item, quality });
		return;
	}
	items.set(key, item);
}
