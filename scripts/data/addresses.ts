/**
 * Eigenes Straßen- und Adressverzeichnis für die Sofort-Suche beim Tippen (der öffentliche Suchdienst Photon
 * braucht 2–4 s je Anfrage).
 *
 * Ausgabe in static/data/search/ (nicht im Offline-Speicher – gesucht wird nur mit Netz):
 *   streets.json   { cities: [[Ortsname, "Straße|dlon|dlat;Straße|dlon|dlat;…"], …] }
 *                  Lage in 1e-4 Grad (≈ 10 m), jeweils als Abstand zum vorigen Eintrag (erster: zu 0).
 *                  Ort = addr:city der Adressen; Straßen ohne Adressen bekommen den nächsten Ort.
 *   addr/<Ort-Nr.>-<Buchstabe>.json   Hausnummern der Straßen dieses Orts mit diesem Anfangsbuchstaben:
 *                  { "<Straße>": "Nr|dlon|dlat;Nr|dlon|dlat;…" } – Lage in 1e-5 Grad (≈ 1 m), als Abstand zum vorigen.
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import type { OsmElement } from '../lib/osm-file.ts';

const OUT = new URL('../../static/data/search/', import.meta.url);

/** Anfangsbuchstabe für die Aufteilung der Hausnummern (gleiche Regel wie in src/lib/geocode/streets.ts) */
export function letterOf(street: string): string {
	const c = street
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.charAt(0);
	return c >= 'a' && c <= 'z' ? c : '_';
}

/** Mittelpunkt eines Objekts (Knoten: Lage, Weg/Gebäude: Mittel der Punkte) */
function centerOf(e: OsmElement): [number, number] | undefined {
	if (e.lat !== undefined && e.lon !== undefined) return [e.lon, e.lat];
	const g = e.geometry;
	if (!g?.length) return undefined;
	let lon = 0;
	let lat = 0;
	for (const p of g) {
		lon += p.lon;
		lat += p.lat;
	}
	return [lon / g.length, lat / g.length];
}

const fixed = (v: number) => Math.round(v * 1e5);
const dist2 = (a: [number, number], b: [number, number]) => {
	const dx = (a[0] - b[0]) * 0.62;
	const dy = a[1] - b[1];
	return dx * dx + dy * dy;
};

/**
 * @param addresses Objekte mit addr:street + addr:housenumber
 * @param streets   benannte Wege (für Straßen ohne eingetragene Adressen)
 * @param places    Orte [lon·1e4, lat·1e4, Rang, Name] aus places.json (Rang ≤ 1 = Stadt/Kleinstadt)
 */
export async function buildAddresses(
	addresses: OsmElement[],
	streets: OsmElement[],
	places: [number, number, number, string][]
) {
	// nur den Inhalt löschen (den Ordner selbst hält der Entwicklungsserver ggf. offen)
	await rm(new URL('addr/', OUT), { recursive: true, force: true });
	await mkdir(new URL('addr/', OUT), { recursive: true });

	const towns = places.filter((p) => p.at(2)! <= 1).map((p) => ({ name: p[3], at: [p[0] / 1e4, p[1] / 1e4] as [number, number] }));
	const nearestTown = (at: [number, number]) => {
		let best = towns[0];
		for (const t of towns) if (dist2(t.at, at) < dist2(best.at, at)) best = t;
		return best.name;
	};

	// Adressen nach Ort und Straße sammeln
	const cities: string[] = [];
	const cityIndex = new Map<string, number>();
	const indexOf = (city: string) => {
		let i = cityIndex.get(city);
		if (i === undefined) {
			i = cities.length;
			cities.push(city);
			cityIndex.set(city, i);
		}
		return i;
	};
	type Entry = { number: string; at: [number, number] };
	const byStreet = new Map<string, { city: number; name: string; entries: Entry[] }>();
	for (const a of addresses) {
		const t = a.tags!;
		const at = centerOf(a);
		const name = t['addr:street']?.trim();
		const number = t['addr:housenumber']?.trim();
		if (!at || !name || !number) continue;
		const city = indexOf(t['addr:city']?.trim() || nearestTown(at));
		const key = `${city}|${name}`;
		let s = byStreet.get(key);
		if (!s) byStreet.set(key, (s = { city, name, entries: [] }));
		// mehrere Nummern an einem Haus („12-14“, „12;14“) einzeln
		for (const n of number.split(/[;,]/)) if (n.trim()) s.entries.push({ number: n.trim(), at });
	}

	// Straßenliste: Lage = mittlere Hausnummer
	const list: [string, number, number, number][] = [];
	const files = new Map<string, Record<string, string>>();
	const covered = new Map<string, [number, number][]>();
	for (const s of byStreet.values()) {
		s.entries.sort((a, b) => parseInt(a.number) - parseInt(b.number) || a.number.localeCompare(b.number));
		const mid = s.entries[Math.floor(s.entries.length / 2)].at;
		list.push([s.name, s.city, mid[0], mid[1]]);
		(covered.get(s.name) ?? covered.set(s.name, []).get(s.name)!).push(mid);
		const file = `${s.city}-${letterOf(s.name)}`;
		const content = files.get(file) ?? files.set(file, {}).get(file)!;
		const seen = new Set<string>();
		let lon = 0;
		let lat = 0;
		content[s.name] = s.entries
			.filter((e) => !seen.has(e.number.toLowerCase()) && seen.add(e.number.toLowerCase()))
			.map((e) => {
				const x = fixed(e.at[0]);
				const y = fixed(e.at[1]);
				const part = `${e.number.replace(/[|;]/g, ' ')}|${x - lon}|${y - lat}`;
				lon = x;
				lat = y;
				return part;
			})
			.join(';');
	}

	// Straßen ohne Adressen (z. B. „Deichweg“): ein Eintrag je Name und Gegend (> 2 km von gleichnamigen entfernt)
	let extra = 0;
	for (const w of streets) {
		const name = w.tags?.name?.trim();
		const g = w.geometry;
		if (!name || !g?.length) continue;
		const p = g[Math.floor(g.length / 2)];
		const at: [number, number] = [p.lon, p.lat];
		const same = covered.get(name) ?? [];
		if (same.some((o) => dist2(o, at) < 0.02 ** 2)) continue; // ≈ 2 km
		same.push(at);
		covered.set(name, same);
		list.push([name, indexOf(nearestTown(at)), at[0], at[1]]);
		extra++;
	}

	// nach Ort gruppiert, je Ort nach Name sortiert, Lage als Abstand zum vorigen Eintrag
	const grouped = cities.map((name, index) => {
		let lon = 0;
		let lat = 0;
		const items = list
			.filter((l) => l[1] === index)
			.sort((a, b) => a[0].localeCompare(b[0], 'de'))
			.map(([street, , x, y]) => {
				const gx = Math.round(x * 1e4);
				const gy = Math.round(y * 1e4);
				const part = `${street.replace(/[|;]/g, ' ')}|${gx - lon}|${gy - lat}`;
				lon = gx;
				lat = gy;
				return part;
			});
		return [name, items.join(';')];
	});
	const json = JSON.stringify({ cities: grouped, source: '© OpenStreetMap-Mitwirkende (ODbL)' });
	await writeFile(new URL('streets.json', OUT), json + '\n');
	let bytes = 0;
	for (const [file, content] of files) {
		const text = JSON.stringify(content);
		bytes += text.length;
		await writeFile(new URL(`addr/${file}.json`, OUT), text + '\n');
	}
	console.log(
		`Fertig: static/data/search/streets.json (${Math.round(json.length / 1024)} KB, ${list.length} Straßen, davon ${extra} ohne Adressen, ${cities.length} Orte), ` +
			`${files.size} Hausnummer-Dateien (${Math.round(bytes / 1024 / 1024)} MB)`
	);
}
