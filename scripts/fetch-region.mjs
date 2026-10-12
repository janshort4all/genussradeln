/**
 * Kartendaten für das ganze Gebiet holen: die Geofabrik-Auszüge von Nordrhein-Westfalen und den niederländischen Provinzen
 * Limburg und Gelderland laden und zu einer Datei zusammenfügen (GraphHopper liest nur eine Datei).
 *
 *   npm run routing:region          lädt, was fehlt oder älter als 14 Tage ist, und fügt zusammen
 *   npm run routing:region -- neu   lädt alles neu
 *
 * Ergebnis: routing/data/region/merged.osm.pbf (ca. 1,1 GB; Quellen ca. 1,2 GB). Anderes Gebiet: REGIONS ändern.
 * Daten: © OpenStreetMap-Mitwirkende, ODbL (Geofabrik).
 */
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const REGIONS = [
	['nordrhein-westfalen', 'https://download.geofabrik.de/europe/germany/nordrhein-westfalen-latest.osm.pbf'],
	['limburg', 'https://download.geofabrik.de/europe/netherlands/limburg-latest.osm.pbf'],
	['gelderland', 'https://download.geofabrik.de/europe/netherlands/gelderland-latest.osm.pbf']
];
const DIR = new URL('../routing/data/region/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const fresh = process.argv.includes('neu');
const MAX_AGE_MS = 14 * 24 * 3600 * 1000;

mkdirSync(DIR, { recursive: true });
let changed = false;
for (const [name, url] of REGIONS) {
	const file = `${DIR}${name}.osm.pbf`;
	if (!fresh && existsSync(file) && Date.now() - statSync(file).mtimeMs < MAX_AGE_MS) {
		console.log(`${name}: vorhanden (${(statSync(file).size / 1048576).toFixed(0)} MB)`);
		continue;
	}
	console.log(`${name}: wird geladen …`);
	const response = await fetch(url);
	if (!response.ok || !response.body) throw new Error(`${url}: ${response.status}`);
	await pipeline(Readable.fromWeb(response.body), createWriteStream(`${file}.teil`));
	renameSync(`${file}.teil`, file);
	console.log(`${name}: ${(statSync(file).size / 1048576).toFixed(0)} MB`);
	changed = true;
}

const merged = `${DIR}merged.osm.pbf`;
if (changed || fresh || !existsSync(merged)) {
	console.log('Zusammenfügen …');
	const result = spawnSync(
		process.execPath,
		['--max-old-space-size=6000', new URL('./merge-osm.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), merged, ...REGIONS.map(([name]) => `${DIR}${name}.osm.pbf`)],
		{ stdio: 'inherit' }
	);
	if (result.status !== 0) process.exit(result.status ?? 1);
} else console.log('merged.osm.pbf ist aktuell.');
