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

/** Adressen (Hausnummern) – für die Sofort-Suche beim Tippen (addresses.ts) */
export const ADDRESSES: OsmQuery = (t, kind) => kind !== 'relation' && !!t['addr:housenumber'] && !!t['addr:street'];

/** Benannte Straßen und Wege – Straßen ohne eingetragene Hausnummern (addresses.ts) */
export const STREET_NAMES: OsmQuery = (t, kind) =>
	kind === 'way' &&
	!!t.name &&
	match(t.highway, /^(residential|living_street|unclassified|tertiary|secondary|primary|pedestrian|road|service|track|cycleway|path|footway|bridleway)$/);

/** Große Straßen – für „Radweg direkt neben der Straße“ (roads.ts) */
export const MAJOR_ROADS: OsmQuery = (t, kind) =>
	kind === 'way' && match(t.highway, /^(motorway|trunk|primary|secondary)(_link)?$/);
