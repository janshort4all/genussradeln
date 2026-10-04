import { describe, expect, it } from 'vitest';
import { offset, type LngLat } from '$lib/geo/geo';
import { NameIndex, type NamedPoint } from './names';
import { distinctPlaces, highlightOf, landmarkPhrase, landmarkTitle, routeNames, viaPlaces, type RouteNames } from './title';

describe('landmarkTitle', () => {
	it('findet den richtigen Artikel', () => {
		expect(landmarkTitle({ name: 'Rhein', kind: 'river' })).toBe('Am Rhein entlang');
		expect(landmarkTitle({ name: 'Niers', kind: 'river' })).toBe('An der Niers entlang');
		expect(landmarkTitle({ name: 'Rhein-Herne-Kanal', kind: 'river' })).toBe('Am Rhein-Herne-Kanal entlang');
		expect(landmarkTitle({ name: 'Alter Rhein', kind: 'river' })).toBe('Am Alten Rhein entlang');
		expect(landmarkTitle({ name: 'Elfrather See', kind: 'lake' })).toBe('Am Elfrather See vorbei');
		expect(landmarkTitle({ name: 'Stadtwald', kind: 'forest' })).toBe('Durch den Stadtwald');
		expect(landmarkTitle({ name: 'Hülser Bruch', kind: 'forest' })).toBe('Durchs Hülser Bruch');
		expect(landmarkTitle({ name: 'Linner Heide', kind: 'park' })).toBe('Durch die Linner Heide');
	});

	it('liefert passende Wendungen für den Beschreibungssatz', () => {
		expect(landmarkPhrase({ name: 'Rhein', kind: 'river' })).toBe('am Rhein');
		expect(landmarkPhrase({ name: 'Niers', kind: 'river' })).toBe('an der Niers');
		expect(landmarkPhrase({ name: 'Stadtwald', kind: 'forest' })).toBe('durch den Stadtwald');
	});

	it('nennt Orte verständlich', () => {
		expect(viaPlaces(['Meerbusch'])).toBe('über Meerbusch');
		expect(viaPlaces(['Willich', 'Kaarst'])).toBe('über Willich und Kaarst');
		expect(viaPlaces([])).toBeUndefined();
	});
});

describe('routeNames', () => {
	const start: LngLat = [6.6, 51.3];
	const at = (east: number, north = 0) => offset(offset(start, 90, east), 0, north);
	// Weg 10 km nach Osten; ein Fluss läuft 200 m nördlich parallel; Orte bei km 0, 3, 7 und 10
	const line = [at(0), at(10_000)];
	const river: NamedPoint[] = Array.from({ length: 30 }, (_, i) => ({ lngLat: at(i * 350, 200), name: 'Rhein', kind: 'river' }));
	const places: NamedPoint[] = [
		{ lngLat: at(0, 300), name: 'Startdorf', kind: 2 },
		{ lngLat: at(3000, 600), name: 'Meerbusch', kind: 1 },
		{ lngLat: at(7000, 600), name: 'Kaarst', kind: 1 },
		{ lngLat: at(10_000, 300), name: 'Zielort', kind: 2 }
	];
	const data = { landmarks: new NameIndex(river), places: new NameIndex(places) };

	it('erkennt den benannten Fluss als Höhepunkt und die durchfahrenen Orte', () => {
		const names = routeNames(line, data);
		expect(highlightOf(names)?.name).toBe('Rhein');
		expect(names.endPlaces).toEqual(['Startdorf', 'Zielort']);
		// Start- und Zielort kommen nicht in den Titel
		expect(distinctPlaces(names, [])).toEqual(['Meerbusch', 'Kaarst']);
	});

	it('lässt Orte weg, durch die alle Vorschläge fahren', () => {
		const names = routeNames(line, data);
		const other: RouteNames = { landmarks: [], places: [{ name: 'Kaarst', rank: 1, meters: 4000, order: 0 }], endPlaces: [] };
		expect(distinctPlaces(names, [other])).toEqual(['Meerbusch']);
	});
});
