/**
 * Sofort-Vorschläge beim Tippen aus der eigenen Ortsliste (static/data/places.json: Städte, Dörfer, Stadtteile).
 * Der Suchdienst Photon braucht für jede Anfrage gut eine Sekunde – Orte wie „Kempen“ erscheinen so schon
 * beim Tippen, Straßen und Adressen kommen danach von Photon dazu.
 */
import { distance, type LngLat } from '$lib/geo/geo';
import type { Place } from '$lib/tour/model';

interface LocalPlace {
	name: string;
	/** für den Vergleich: klein, ohne Akzente, ß → ss */
	key: string;
	lngLat: LngLat;
	/** 0 = Stadt, 1 = Kleinstadt, 2 = Dorf/Stadtteil, 3 = Viertel */
	rank: number;
}

export function normalize(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/ß/g, 'ss')
		.trim();
}

export function parseLocalPlaces(json: { places: [number, number, number, string][] }): LocalPlace[] {
	return json.places.map(([lon, lat, rank, name]) => ({ name, key: normalize(name), lngLat: [lon / 1e4, lat / 1e4], rank }));
}

/** Zusatz zur Unterscheidung: Dorf oder Stadtteil → nächste Stadt („Linn“ → „Krefeld“) */
function detailOf(place: LocalPlace, all: LocalPlace[]): string | undefined {
	if (place.rank <= 1) return undefined;
	let best: LocalPlace | undefined;
	let bestDistance = 15_000;
	for (const p of all) {
		if (p.rank > 1 || p.name === place.name) continue;
		const d = distance(p.lngLat, place.lngLat);
		if (d < bestDistance) {
			best = p;
			bestDistance = d;
		}
	}
	return best?.name;
}

/**
 * Orte, deren Name (oder ein Namensteil, z. B. „vluyn“ → „Neukirchen-Vluyn“) mit der Eingabe beginnt.
 * Genaue Treffer zuerst, dann Städte vor Dörfern, dann nach Nähe.
 */
export function matchLocalPlaces(query: string, all: LocalPlace[], near?: LngLat, max = 3): Place[] {
	const q = normalize(query);
	if (q.length < 2) return [];
	const hits = all.filter((p) => p.key.startsWith(q) || p.key.split(/[\s-]+/).some((word) => word.startsWith(q)));
	hits.sort(
		(a, b) =>
			Number(b.key === q) - Number(a.key === q) ||
			a.rank - b.rank ||
			(near ? distance(a.lngLat, near) - distance(b.lngLat, near) : 0)
	);
	const seen = new Set<string>();
	const out: Place[] = [];
	for (const p of hits) {
		const detail = detailOf(p, all);
		const key = `${p.name}|${detail ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ name: p.name, ...(detail ? { detail } : {}), lngLat: p.lngLat, settlement: true });
		if (out.length >= max) break;
	}
	return out;
}

let loading: Promise<LocalPlace[]> | undefined;

/** Ortsliste einmalig laden (klein, ca. 25 KB) */
export function loadLocalPlaces(url: string): Promise<LocalPlace[]> {
	loading ??= fetch(url)
		.then((r) => {
			if (!r.ok) throw new Error('Ortsliste nicht gefunden');
			return r.json();
		})
		.then(parseLocalPlaces);
	loading.catch(() => (loading = undefined));
	return loading;
}
