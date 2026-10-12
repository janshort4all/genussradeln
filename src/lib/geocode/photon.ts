/**
 * Ortssuche mit Photon (offene OpenStreetMap-Suche, https://photon.komoot.io).
 * Es werden nur die Suchbegriffe übertragen; die Suche ist auf unser Gebiet begrenzt.
 */
import { distance, type LngLat } from '$lib/geo/geo';
import type { Place } from '$lib/tour/model';

const PHOTON_URL = 'https://photon.komoot.io/api/';

/** Suchgebiet der Ortssuche: Nordrhein-Westfalen und die angrenzenden niederländischen Provinzen Limburg und Gelderland */
export const REGION = { west: 4.95, south: 50.3, east: 9.55, north: 52.6 };

/** Treffer, die keine sinnvollen Ziele sind (Haltestellen, Bahnsteige …) */
const SKIP = new Set([
	'highway=bus_stop',
	'highway=platform',
	'railway=tram_stop',
	'railway=platform',
	'railway=stop',
	'public_transport=platform',
	'public_transport=stop_position'
]);

interface PhotonFeature {
	geometry: { coordinates: [number, number] };
	properties: {
		name?: string;
		street?: string;
		housenumber?: string;
		postcode?: string;
		city?: string;
		district?: string;
		locality?: string;
		osm_key?: string;
		osm_value?: string;
		type?: string;
	};
}

/** Orte (Stadt, Dorf, Ortsteil): Photon-Typ bzw. OSM place=… – Adressen (place=house) zählen nicht */
const SETTLEMENT_TYPES = new Set(['city', 'district', 'locality']);
const SETTLEMENT_VALUES = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'quarter', 'neighbourhood', 'borough']);

/** Gleichnamige Treffer so nah beieinander gelten als derselbe Ort (z. B. Gebäude einer Burg) */
const SAME_PLACE_M = 500;

/** Photon-Treffer → Ort mit verständlichem Namen; Doppelte und Haltestellen fallen weg */
export function toPlaces(features: PhotonFeature[]): Place[] {
	const places: Place[] = [];
	const seen = new Set<string>();
	for (const { geometry, properties: p } of features) {
		if (SKIP.has(`${p.osm_key}=${p.osm_value}`)) continue;
		const street = [p.street, p.housenumber].filter(Boolean).join(' ');
		const name = p.name ?? (street || p.city);
		if (!name) continue;
		const area = [p.city, p.district ?? p.locality].filter(Boolean);
		const detailParts = p.name && street ? [street, ...area] : area;
		const detail = [...new Set(detailParts)].filter((d) => d !== name).join(', ') || undefined;
		const key = `${name}|${detail ?? ''}`;
		if (seen.has(key)) continue;
		const lngLat = geometry.coordinates as LngLat;
		if (places.some((p) => p.name === name && distance(p.lngLat, lngLat) < SAME_PLACE_M)) continue;
		seen.add(key);
		const settlement =
			(p.osm_key === 'place' && SETTLEMENT_VALUES.has(p.osm_value ?? '')) || SETTLEMENT_TYPES.has(p.type ?? '');
		places.push({ name, detail, lngLat, ...(settlement ? { settlement } : {}) });
	}
	return places;
}

/** Orte suchen; `near` bevorzugt Treffer in der Nähe (z. B. Startpunkt) */
export async function searchPlaces(query: string, near?: LngLat, signal?: AbortSignal): Promise<Place[]> {
	const params = new URLSearchParams({
		q: query,
		lang: 'de',
		limit: '8',
		bbox: `${REGION.west},${REGION.south},${REGION.east},${REGION.north}`
	});
	if (near) {
		params.set('lon', String(near[0]));
		params.set('lat', String(near[1]));
	}
	const response = await fetch(`${PHOTON_URL}?${params}`, { signal });
	if (!response.ok) throw new Error(`Suche nicht möglich (${response.status})`);
	const json = await response.json();
	return toPlaces(json.features ?? []).slice(0, 6);
}

export function inRegion([lon, lat]: LngLat): boolean {
	return lon >= REGION.west && lon <= REGION.east && lat >= REGION.south && lat <= REGION.north;
}
