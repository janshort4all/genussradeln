import { describe, expect, it } from 'vitest';
import { inRegion, toPlaces } from './photon';

const feature = (properties: Record<string, string>, coordinates: [number, number] = [6.63, 51.33]) => ({
	geometry: { coordinates },
	properties
});

describe('toPlaces', () => {
	it('macht aus Treffern verständliche Orte und lässt Haltestellen weg', () => {
		const places = toPlaces([
			feature({ name: 'Burg Linn', osm_key: 'building', osm_value: 'yes', street: 'Rue de Sappeure', city: 'Krefeld', district: 'Linn' }),
			feature({ name: 'Burg Linn', osm_key: 'highway', osm_value: 'bus_stop', city: 'Krefeld' }),
			feature({ name: 'Burg Linn', osm_key: 'railway', osm_value: 'tram_stop', city: 'Krefeld' })
		]);
		expect(places).toHaveLength(1);
		expect(places[0]).toEqual({
			name: 'Burg Linn',
			detail: 'Rue de Sappeure, Krefeld, Linn',
			lngLat: [6.63, 51.33]
		});
	});

	it('benennt Adressen ohne Namen nach Straße und Hausnummer', () => {
		const [place] = toPlaces([feature({ street: 'Rheinstraße', housenumber: '12', city: 'Krefeld', osm_key: 'place', osm_value: 'house' })]);
		expect(place.name).toBe('Rheinstraße 12');
		expect(place.detail).toBe('Krefeld');
	});

	it('fasst gleichnamige Treffer in der Nähe zusammen, entfernte bleiben', () => {
		const places = toPlaces([
			feature({ name: 'Burg Linn', street: 'Rue de Sappeure', city: 'Krefeld' }, [6.6349, 51.3329]),
			feature({ name: 'Burg Linn', street: 'Rheinbabenstraße', city: 'Krefeld' }, [6.6365, 51.3340]),
			feature({ name: 'Burg Linn', street: 'Woanders', city: 'Kleve' }, [6.14, 51.79])
		]);
		expect(places.map((p) => p.detail)).toEqual(['Rue de Sappeure, Krefeld', 'Woanders, Kleve']);
	});

	it('entfernt doppelte Treffer', () => {
		const places = toPlaces([
			feature({ name: 'Krefeld', city: 'Krefeld' }),
			feature({ name: 'Krefeld', city: 'Krefeld' })
		]);
		expect(places).toHaveLength(1);
		expect(places[0].detail).toBeUndefined();
	});
});

describe('inRegion', () => {
	it('kennt die Testregion', () => {
		expect(inRegion([6.63, 51.33])).toBe(true); // Krefeld
		expect(inRegion([13.4, 52.5])).toBe(false); // Berlin
	});
});
