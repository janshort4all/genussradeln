/**
 * Erzeugt alle Datendateien der App aus der OpenStreetMap-Regionsdatei (routing/data/*.osm.pbf):
 *   static/data/landscape.png + .json   Landschaftskarte (Wasser, Wald, Grün, Felder)
 *   static/data/pois.json               Stopps unterwegs
 *   static/data/places.json             Ortsnamen für Weg-Titel
 *   static/data/landmarks.json          Gewässer-, Wald- und Parknamen für Weg-Titel
 *   static/data/roads.bin + .json       große Straßen (für Radwege direkt daneben)
 *   static/data/search/                 Straßen und Hausnummern für die Sofort-Suche beim Tippen
 *
 * Aufruf: npm run data   (vorher einmalig npm run routing:setup – lädt die Regionsdatei)
 * Eine andere Region: andere .osm.pbf in routing/data legen oder OSM_FILE=… setzen.
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { readFile } from 'node:fs/promises';
import { buildAddresses } from './data/addresses.ts';
import { buildLandmarks } from './data/landmarks.ts';
import { buildLandscape } from './data/landscape.ts';
import { buildPlaces } from './data/places.ts';
import { buildPois } from './data/pois.ts';
import { buildRoads } from './data/roads.ts';
import { ADDRESSES, FIELDS, LANDSCAPE, MAJOR_ROADS, PLACES, POIS, STREET_NAMES } from './data/queries.ts';
import { osmFileBounds, osmFilePath, readOsm } from './lib/osm-file.ts';

const started = Date.now();
const path = await osmFilePath();
const bounds = await osmFileBounds(path);
console.log(`Regionsdatei: ${path}`);

const osm = await readOsm(
	{
		landscape: LANDSCAPE,
		fields: FIELDS,
		pois: POIS,
		places: PLACES,
		roads: MAJOR_ROADS,
		addresses: ADDRESSES,
		streets: STREET_NAMES
	},
	{ path }
);

await buildLandscape([...osm.landscape, ...osm.fields], bounds);
await buildPois(osm.pois, osm.landscape);
await buildPlaces(osm.places);
await buildLandmarks(osm.landscape, bounds);
await buildRoads(osm.roads, bounds);
const places = JSON.parse(await readFile(new URL('../static/data/places.json', import.meta.url), 'utf8')).places;
await buildAddresses(osm.addresses, osm.streets, places);

console.log(`Alles fertig nach ${Math.round((Date.now() - started) / 1000)} s.`);
