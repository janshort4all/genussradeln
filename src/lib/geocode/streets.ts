/**
 * Sofort-Vorschläge für Straßen und Adressen aus dem eigenen Verzeichnis (static/data/search/, erzeugt von
 * `npm run data` aus der OSM-Regionsdatei). Der öffentliche Suchdienst Photon braucht 2–4 s je Anfrage –
 * so erscheinen „Kurkölner Straße 80, Krefeld“ schon beim Tippen. Photon ergänzt danach Ausflugsziele.
 */
import type { LngLat } from '$lib/geo/geo';
import { distance } from '$lib/geo/geo';
import type { Place } from '$lib/tour/model';
import { normalize } from './local';

export interface LocalStreet {
	name: string;
	/** für den Vergleich: klein, ohne Akzente, „straße“/„str.“ → „str“, Bindestriche → Leerzeichen */
	key: string;
	city: string;
	cityIndex: number;
	lngLat: LngLat;
}

/** Vergleichsform für Straßennamen und Eingaben („Kurkölner Straße“, „kurkoelner str.“ → „kurkolner str“) */
export function streetKey(text: string): string {
	return normalize(text)
		.replace(/oe/g, 'o')
		.replace(/ue/g, 'u')
		.replace(/ae/g, 'a')
		.replace(/[-/.,]+/g, ' ')
		.replace(/strasse\b/g, ' str')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Anfangsbuchstabe für die Hausnummer-Dateien (gleiche Regel wie scripts/data/addresses.ts) */
function letterOf(street: string): string {
	const c = street
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.charAt(0);
	return c >= 'a' && c <= 'z' ? c : '_';
}

/** Eingabe zerlegen: „Kurkölner Str 80a, Krefeld“ → Straße, Hausnummer, Ort */
export function parseAddress(query: string): { street: string; number?: string; city?: string } {
	const m = query.match(/^(.*?\D)\s+(\d+\s?[a-zA-Z]?)(?:\s*,?\s+(\D.*))?$/);
	if (m) return { street: m[1].replace(/,\s*$/, '').trim(), number: m[2].replace(/\s/g, ''), city: m[3]?.trim() };
	const [street, city] = query.split(',').map((s) => s.trim());
	return { street, city: city || undefined };
}

export function parseStreets(json: { cities: [string, string][] }): LocalStreet[] {
	const out: LocalStreet[] = [];
	json.cities.forEach(([city, packed], cityIndex) => {
		let lon = 0;
		let lat = 0;
		if (!packed) return;
		for (const item of packed.split(';')) {
			const [name, dx, dy] = item.split('|');
			lon += Number(dx);
			lat += Number(dy);
			out.push({ name, key: streetKey(name), city, cityIndex, lngLat: [lon / 1e4, lat / 1e4] });
		}
	});
	return out;
}

/**
 * Straßen, deren Name (oder ein Namensteil) mit der Eingabe beginnt. Mit Ort („…, Krefeld“) nur dort;
 * sonst die in der Nähe zuerst.
 */
export function matchStreets(query: string, all: LocalStreet[], near?: LngLat, max = 4): LocalStreet[] {
	const { street, city } = parseAddress(query);
	const q = streetKey(street);
	if (q.length < 3) return [];
	const compact = q.replace(/ /g, '');
	const cityKey = city ? normalize(city) : undefined;
	const hits: { s: LocalStreet; rank: number }[] = [];
	for (const s of all) {
		// „kurkolnerstr“ (ohne Leerzeichen getippt) passt auch zu „kurkolner str“
		const rank = s.key.startsWith(q) || s.key.replace(/ /g, '').startsWith(compact) ? 0 : s.key.includes(` ${q}`) ? 1 : -1;
		if (rank < 0) continue;
		if (cityKey && !normalize(s.city).startsWith(cityKey)) continue;
		hits.push({ s, rank });
	}
	hits.sort(
		(a, b) =>
			a.rank - b.rank ||
			(near ? distance(a.s.lngLat, near) - distance(b.s.lngLat, near) : 0) ||
			a.s.name.length - b.s.name.length
	);
	// gleiche Straße im gleichen Ort (lange Straßen stehen mehrfach drin) nur einmal – die nächste
	const seen = new Set<string>();
	const out: LocalStreet[] = [];
	for (const { s } of hits) {
		const key = `${s.name}|${s.city}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(s);
		if (out.length >= max) break;
	}
	return out;
}

const numberFiles = new Map<string, Promise<Record<string, string>>>();

/** Hausnummer einer Straße suchen (lädt die kleine Datei dieses Orts/Anfangsbuchstabens, ca. 5–50 KB) */
export async function findHouse(street: LocalStreet, number: string, baseUrl: string): Promise<LngLat | undefined> {
	const file = `${street.cityIndex}-${letterOf(street.name)}`;
	let loading = numberFiles.get(file);
	if (!loading) {
		loading = fetch(`${baseUrl}/${file}.json`).then((r) => (r.ok ? r.json() : {}));
		loading.catch(() => numberFiles.delete(file));
		numberFiles.set(file, loading);
	}
	const packed = (await loading)[street.name];
	if (!packed) return undefined;
	const wanted = number.toLowerCase();
	let lon = 0;
	let lat = 0;
	for (const item of packed.split(';')) {
		const [n, dx, dy] = item.split('|');
		lon += Number(dx);
		lat += Number(dy);
		if (n.toLowerCase().replace(/\s/g, '') === wanted) return [lon / 1e5, lat / 1e5];
	}
	return undefined;
}

/** Vorschläge fürs Suchfeld: Straße mit Hausnummer (wenn gefunden), sonst die Straße selbst */
export async function streetPlaces(
	query: string,
	all: LocalStreet[],
	numbersUrl: string,
	near?: LngLat
): Promise<Place[]> {
	const { number } = parseAddress(query);
	const streets = matchStreets(query, all, near);
	const found = await Promise.all(
		streets.map(async (s) => {
			const house = number ? await findHouse(s, number, numbersUrl).catch(() => undefined) : undefined;
			return house
				? { place: { name: `${s.name} ${number}`, detail: s.city, lngLat: house }, exact: true }
				: { place: { name: s.name, detail: s.city, lngLat: s.lngLat }, exact: false };
		})
	);
	// Straßen, in denen es die getippte Hausnummer wirklich gibt, zuerst
	return found.sort((a, b) => Number(b.exact) - Number(a.exact)).map((f) => f.place);
}

let loading: Promise<LocalStreet[]> | undefined;

/** Straßenverzeichnis einmalig laden (ca. 430 KB gepackt) – erst, wenn jemand ins Suchfeld tippt */
export function loadStreets(url: string): Promise<LocalStreet[]> {
	loading ??= fetch(url)
		.then((r) => {
			if (!r.ok) throw new Error('Straßenverzeichnis nicht gefunden');
			return r.json();
		})
		.then(parseStreets);
	loading.catch(() => (loading = undefined));
	return loading;
}
