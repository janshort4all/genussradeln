/**
 * Stopp-Datei (F9): Restaurants, Biergärten, Cafés, Bäckereien, Eiscafés, Toiletten, Aussichtspunkte, Rastplätze, Bänke und E-Bike-Ladepunkte.
 *
 * Ausgabe: static/data/pois.json – kompakt:
 *   { kinds: [...], items: [[lon·1e5, lat·1e5, Art-Index, Merkmal-Bits, Name?, Öffnungszeiten?], …] }
 * Öffnungszeiten (OpenStreetMap-Schreibweise, z. B. „Mo-Fr 08:00-18:00; Sa 08:00-13:00“) nur bei Orten zum Einkehren.
 * Bänke werden ausgedünnt (höchstens eine je ca. 500 m), damit die Datei klein bleibt.
 * „Am Wasser / am Wald / im Grünen“ wird aus den echten Ufer- und Waldrändern bestimmt (höchstens ca. 60 m).
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { FLAG, STOP_KINDS, type StopKind } from '../../src/lib/stops/kinds.ts';
import { NearbyIndex } from '../lib/nearby.ts';
import type { OsmElement } from '../lib/osm-file.ts';

export type PoiItem = [number, number, number, number, string?, string?];
type Item = PoiItem;

const EAT: StopKind[] = ['cafe', 'eis', 'biergarten', 'restaurant', 'baeckerei'];
const BENCH_CELL_LON = 0.0072; // ≈ 500 m
const BENCH_CELL_LAT = 0.0045; // ≈ 500 m
const NEAR_M = 60;

/** Stopps aus den OSM-Objekten, mit Lage zu Wasser/Wald/Grün aus den Landschaftsflächen; `keep` wählt die Stopps (Lage in Grad) */
export function poiItems(elements: OsmElement[], landscape: OsmElement[], keep: (lon: number, lat: number) => boolean = () => true): Item[] {
	const items: Item[] = [];
	/** beste Bank je Rasterzelle */
	const benches = new Map<string, { item: Item; quality: number }>();

	for (const element of elements) {
		const tags = element.tags ?? {};
		const kind = kindOf(tags);
		if (!kind) continue;
		const lat = element.lat ?? element.center?.lat;
		const lon = element.lon ?? element.center?.lon;
		if (lat === undefined || lon === undefined || !keep(lon, lat)) continue;

		const flags = flagsOf(tags, kind);
		const item: Item = [Math.round(lon * 1e5), Math.round(lat * 1e5), STOP_KINDS.indexOf(kind), flags];
		const name = tags.name?.trim();
		if (name && kind !== 'bank') item.push(name);
		const hours = tags.opening_hours?.trim();
		if (hours && EAT.includes(kind) && hours.length <= 120) {
			if (item.length === 4) item.push(''); // Platz für den Namen
			item.push(hours);
		}

		if (kind === 'bank') {
			const cell = `${Math.floor(lon / BENCH_CELL_LON)}:${Math.floor(lat / BENCH_CELL_LAT)}`;
			const quality = flags & FLAG.backrest ? 1 : 0;
			const existing = benches.get(cell);
			if (!existing || quality > existing.quality) benches.set(cell, { item, quality });
			continue;
		}
		items.push(item);
	}
	const all = [...items, ...[...benches.values()].map((b) => b.item)];

	// Lage genau bestimmen (echte Ufer- und Waldränder statt 100-m-Raster)
	const nearby = buildNearbyIndex(landscape);
	let flagged = 0;
	for (const item of all) {
		const point: [number, number] = [item[0] / 1e5, item[1] / 1e5];
		const before = item[3];
		if (nearby.distance(point, 'water', NEAR_M) <= NEAR_M) item[3] |= FLAG.waterside;
		if (nearby.distance(point, 'forest', NEAR_M) <= NEAR_M) item[3] |= FLAG.forestside;
		if (nearby.distance(point, 'green', NEAR_M) <= NEAR_M) item[3] |= FLAG.greenside;
		if (item[3] !== before) flagged++;
	}
	return all;
}

export async function buildPois(elements: OsmElement[], landscape: OsmElement[]) {
	const all = poiItems(elements, landscape);
	const counts = Object.fromEntries(STOP_KINDS.map((k, i) => [k, all.filter((it) => it[2] === i).length]));
	console.log('Stopps je Art:', counts);

	await mkdir(new URL('../../static/data/', import.meta.url), { recursive: true });
	const json = JSON.stringify({
		kinds: STOP_KINDS,
		items: all,
		source: '© OpenStreetMap-Mitwirkende (ODbL)',
		created: new Date().toISOString().slice(0, 10)
	});
	await writeFile(new URL('../../static/data/pois.json', import.meta.url), json + '\n');
	console.log(`Fertig: static/data/pois.json (${Math.round(json.length / 1024)} KB, ${all.length} Stopps)`);
}

/**
 * Wasser nur als Fläche (See, Teich, Flussfläche) mit mindestens 300 m Umfang – Bäche, Gräben und Kanäle, die nur
 * als Linie eingetragen sind, zählen nicht („am Wasser“ heißt: man sitzt mit Blick aufs Wasser).
 */
function buildNearbyIndex(landscape: OsmElement[]): NearbyIndex {
	const index = new NearbyIndex();
	for (const e of landscape) {
		const t = e.tags ?? {};
		if (t.natural === 'water' || t.waterway === 'riverbank') {
			if (perimeter(e) >= 300) index.add(e, 'water', true);
		} else if (t.landuse === 'forest' || t.natural === 'wood') index.add(e, 'forest', true);
		else if (
			t.leisure === 'park' ||
			t.leisure === 'nature_reserve' ||
			t.landuse === 'meadow' ||
			t.natural === 'grassland' ||
			t.natural === 'heath'
		) {
			index.add(e, 'green', true);
		}
	}
	return index;
}

function perimeter(e: OsmElement): number {
	const rings = e.type === 'way' ? [e.geometry ?? []] : (e.members ?? []).map((m) => m.geometry ?? []);
	let sum = 0;
	for (const ring of rings) {
		for (let i = 1; i < ring.length; i++) {
			const a = ring[i - 1];
			const b = ring[i];
			if (!a || !b) continue;
			sum += Math.hypot((b.lon - a.lon) * 69_600, (b.lat - a.lat) * 110_540);
		}
	}
	return sum;
}

/** Namen von Bäckereien (auch als Café eingetragen) */
const BAKERY_NAME = /b[äa]cker|backhaus|backstube|kamps|b[äa]ckerei|konditor/i;

function kindOf(t: Record<string, string>): StopKind | undefined {
	if (t.access === 'private' || t.access === 'no') return undefined;
	switch (t.amenity) {
		case 'cafe':
			if (t.cuisine?.includes('ice_cream')) return 'eis';
			// Bäckerei mit Café (Kamps, Bäckerei Hoenen …) zählt als Bäckerei: Zwischenstopp, kein Hauptpause
			return BAKERY_NAME.test(t.name ?? '') || t.cuisine?.includes('bakery') ? 'baeckerei' : 'cafe';
		case 'ice_cream':
			return 'eis';
		case 'biergarten':
			return 'biergarten';
		case 'restaurant':
			// Fast Food und Imbisse sind keine Pause zum Einkehren; ein Restaurant mit Biergarten zählt als Biergarten
			if (t.cuisine === 'fast_food' || t.cuisine === 'kebab' || t.cuisine === 'pizza;kebab') return undefined;
			return t.beer_garden === 'yes' ? 'biergarten' : 'restaurant';
		case 'pub':
			return t.beer_garden === 'yes' ? 'biergarten' : 'restaurant';
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
	if (t.shop === 'bakery') return 'baeckerei';
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
