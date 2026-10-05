/**
 * Erzeugt alle Datendateien der App aus der OpenStreetMap-Regionsdatei (routing/data/*.osm.pbf):
 *   static/data/landscape.png + .json   Landschaftskarte (Wasser, Wald, Grün, Felder)
 *   static/data/pois.json               Stopps unterwegs
 *   static/data/places.json             Ortsnamen für Weg-Titel
 *   static/data/landmarks.json          Gewässer-, Wald- und Parknamen für Weg-Titel
 *
 * Aufruf: npm run data   (vorher einmalig npm run routing:setup – lädt die Regionsdatei)
 * Eine andere Region: andere .osm.pbf in routing/data legen oder OSM_FILE=… setzen.
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { buildLandmarks } from './data/landmarks.ts';
import { buildLandscape } from './data/landscape.ts';
import { buildPlaces } from './data/places.ts';
import { buildPois } from './data/pois.ts';
import { FIELDS, LANDSCAPE, PLACES, POIS } from './data/queries.ts';
import { osmFileBounds, osmFilePath, readOsm } from './lib/osm-file.ts';

const started = Date.now();
const path = await osmFilePath();
const bounds = await osmFileBounds(path);
console.log(`Regionsdatei: ${path}`);

const osm = await readOsm({ landscape: LANDSCAPE, fields: FIELDS, pois: POIS, places: PLACES }, { path });

await buildLandscape([...osm.landscape, ...osm.fields], bounds);
await buildPois(osm.pois, osm.landscape);
await buildPlaces(osm.places);
await buildLandmarks(osm.landscape, bounds);

console.log(`Alles fertig nach ${Math.round((Date.now() - started) / 1000)} s.`);
