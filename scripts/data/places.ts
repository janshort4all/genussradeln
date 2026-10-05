/**
 * Ortsnamen für Weg-Titel wie „… über Meerbusch und Kaarst“: Städte, Orte, Dörfer und Stadtteile.
 *
 * Ausgabe: static/data/places.json – kompakt:
 *   { places: [[lon·1e4, lat·1e4, Rang, Name], …] }   Rang: 0 = Stadt, 1 = Kleinstadt, 2 = Dorf/Stadtteil, 3 = Viertel
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { writeFile } from 'node:fs/promises';
import type { OsmElement } from '../lib/osm-file.ts';

const RANK: Record<string, number> = { city: 0, town: 1, village: 2, suburb: 2, quarter: 3 };

export async function buildPlaces(elements: OsmElement[]) {
	const places: [number, number, number, string][] = [];
	for (const e of elements) {
		const name = e.tags?.name?.trim();
		const rank = RANK[e.tags?.place ?? ''];
		if (!name || rank === undefined || e.lat === undefined || e.lon === undefined) continue;
		places.push([Math.round(e.lon * 1e4), Math.round(e.lat * 1e4), rank, name]);
	}
	const json = JSON.stringify({ places, source: '© OpenStreetMap-Mitwirkende (ODbL)' });
	await writeFile(new URL('../../static/data/places.json', import.meta.url), json + '\n');
	console.log(`Fertig: static/data/places.json (${Math.round(json.length / 1024)} KB, ${places.length} Orte)`);
}
