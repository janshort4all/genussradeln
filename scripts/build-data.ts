/**
 * Erzeugt die Daten der Sofort-Suche beim Tippen aus der OpenStreetMap-Regionsdatei (routing/data/*.osm.pbf):
 *   static/data/places.json             Ortsnamen (Vorlage für die Ortszuordnung der Adressen)
 *   static/data/search/                 Straßen und Hausnummern für die Sofort-Suche beim Tippen
 *
 * Die Karten für die Planung (Landschaft, Wald/Wasser, Straßen, Stopps, Namen, Gewässer) liegen seit Oktober 2026 in Kacheln:
 * `npm run tiles` (scripts/build-tiles.ts).
 *
 * Aufruf: npm run data   (vorher einmalig npm run routing:setup – lädt die Regionsdatei)
 * Eine andere Region: andere .osm.pbf in routing/data legen oder OSM_FILE=… setzen.
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { readFile } from 'node:fs/promises';
import { buildAddresses } from './data/addresses.ts';
import { buildPlaces } from './data/places.ts';
import { ADDRESSES, PLACES, STREET_NAMES } from './data/queries.ts';
import { osmFilePath, readOsm } from './lib/osm-file.ts';

const started = Date.now();
const path = await osmFilePath();
console.log(`Regionsdatei: ${path}`);

const osm = await readOsm({ places: PLACES, addresses: ADDRESSES, streets: STREET_NAMES }, { path });

await buildPlaces(osm.places);
const places = JSON.parse(await readFile(new URL('../static/data/places.json', import.meta.url), 'utf8')).places;
await buildAddresses(osm.addresses, osm.streets, places);

console.log(`Alles fertig nach ${Math.round((Date.now() - started) / 1000)} s.`);
