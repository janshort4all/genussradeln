/**
 * Welche OpenStreetMap-Objekte die Datenskripte brauchen (früher die Overpass-Abfragen).
 */
import type { OsmQuery } from '../lib/osm-file.ts';

const match = (value: string | undefined, pattern: RegExp) => value !== undefined && pattern.test(value);

/** Wasser, Wald, Grünflächen – für Landschaftskarte, Namen und die Lage der Stopps */
export const LANDSCAPE: OsmQuery = (t, kind) =>
	kind !== 'node' &&
	(match(t.natural, /^(water|wood|grassland|heath|wetland)$/) ||
		match(t.waterway, /^(riverbank|river|canal)$/) ||
		match(t.landuse, /^(forest|meadow|orchard)$/) ||
		match(t.leisure, /^(park|nature_reserve)$/));

/** Felder (Äcker) */
export const FIELDS: OsmQuery = (t, kind) => kind !== 'node' && t.landuse === 'farmland';

/** Stopps unterwegs (F9) */
export const POIS: OsmQuery = (t) =>
	match(t.amenity, /^(cafe|ice_cream|biergarten|toilets|bench|shelter)$/) ||
	(t.amenity === 'restaurant' && t.beer_garden === 'yes') ||
	(t.amenity === 'charging_station' && (t.bicycle === 'yes' || match(t.name, /[Ee]-?[Bb]ike|Fahrrad|Pedelec/))) ||
	match(t.tourism, /^(viewpoint|picnic_site)$/);

/** Orte für Weg-Titel („über Meerbusch“) */
export const PLACES: OsmQuery = (t, kind) =>
	kind === 'node' && match(t.place, /^(city|town|village|suburb|quarter)$/) && !!t.name?.trim();

/** Große Straßen – für „Radweg direkt neben der Straße“ (roads.ts) */
export const MAJOR_ROADS: OsmQuery = (t, kind) =>
	kind === 'way' && match(t.highway, /^(motorway|trunk|primary|secondary)(_link)?$/);
