/**
 * Erzeugt die Ortsnamen für Weg-Titel wie „… über Meerbusch und Kaarst“:
 * Städte, Orte, Dörfer und Stadtteile im Regierungsbezirk Düsseldorf aus OpenStreetMap (Overpass).
 *
 * Ausgabe: static/data/places.json – kompakt:
 *   { places: [[lon·1e4, lat·1e4, Rang, Name], …] }   Rang: 0 = Stadt, 1 = Kleinstadt, 2 = Dorf/Stadtteil, 3 = Viertel
 *
 * Aufruf: npm run data:places   (Overpass-Antworten werden in scripts/.cache/ zwischengespeichert)
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { writeFile } from 'node:fs/promises';
import { loadRegionTiles } from './lib/overpass.ts';

const RANK: Record<string, number> = { city: 0, town: 1, village: 2, suburb: 2, quarter: 3 };

const places = new Map<string, [number, number, number, string]>();

await loadRegionTiles({
	cacheName: 'places',
	tiles: [2, 2],
	body: (bbox) => `  node["place"~"^(city|town|village|suburb|quarter)$"]["name"](${bbox});`,
	output: 'out;',
	onTile: (elements, tx, ty) => {
		for (const e of elements) {
			const name = e.tags?.name?.trim();
			const rank = RANK[e.tags?.place ?? ''];
			if (!name || rank === undefined || e.lat === undefined || e.lon === undefined) continue;
			places.set(`${e.id}`, [Math.round(e.lon * 1e4), Math.round(e.lat * 1e4), rank, name]);
		}
		console.log(`Kachel ${tx},${ty}: ${elements.length} Orte`);
	}
});

const json = JSON.stringify({ places: [...places.values()], source: '© OpenStreetMap-Mitwirkende (ODbL)' });
await writeFile(new URL('../static/data/places.json', import.meta.url), json + '\n');
console.log(`Fertig: static/data/places.json (${Math.round(json.length / 1024)} KB, ${places.size} Orte)`);
