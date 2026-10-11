import { describe, expect, it } from 'vitest';
import { offset, type LngLat } from '$lib/geo/geo';
import { NameIndex, type NameData, type NamedPoint } from '$lib/naming/names';
import type { PlannedTour } from '$lib/tour/model';
import { stationsOf } from './stations';

const start: LngLat = [6.55, 51.35];
const line = (meters: number): LngLat[] => Array.from({ length: Math.floor(meters / 100) + 1 }, (_, i) => offset(start, 90, i * 100));

/** Eine Tour 12 km nach Osten (nur Koordinaten – mehr braucht stationsOf nicht) */
const tourOf = (meters: number) =>
	({ legs: [{ coordinates: line(meters).map(([lon, lat]) => [lon, lat, 30]), distance: meters }] }) as unknown as PlannedTour;

const place = (name: string, atMeters: number, rank = 1): NamedPoint => ({ name, kind: rank, lngLat: offset(start, 90, atMeters) });
const landmark = (name: string, atMeters: number, kind: 'river' | 'lake' | 'forest' | 'park'): NamedPoint[] =>
	// ein Gewässer/Wald besteht aus vielen Punkten entlang
	Array.from({ length: 12 }, (_, i) => ({ name, kind, lngLat: offset(start, 90, atMeters + i * 150) }));

const data = (places: NamedPoint[], landmarks: NamedPoint[] = []): NameData => ({
	places: new NameIndex(places),
	landmarks: new NameIndex(landmarks)
});

describe('stationsOf', () => {
	it('findet die Orte entlang der Tour in Fahrtrichtung, ohne Start- und Zielort', () => {
		// Orte alle 3 km; der erste liegt am Start, der letzte am Ziel
		const names = data([place('Startdorf', 0), place('Mitte', 4000), place('Weiter', 8000), place('Zieldorf', 12000)]);
		const stations = stationsOf(tourOf(12000), names);
		const found = stations.map((s) => s.name);
		expect(found).not.toContain('Startdorf');
		expect(found).not.toContain('Zieldorf');
		expect(found).toEqual(expect.arrayContaining(['Mitte']));
		// in Fahrtrichtung geordnet
		const along = stations.map((s) => s.along);
		expect([...along].sort((a, b) => a - b)).toEqual(along);
	});

	it('hält Mindestabstand und höchstens fünf Stationen', () => {
		const places = Array.from({ length: 14 }, (_, i) => place(`Ort ${i}`, 1000 + i * 1000));
		const stations = stationsOf(tourOf(16000), data(places));
		expect(stations.length).toBeLessThanOrEqual(5);
		for (let i = 1; i < stations.length; i++) expect(stations[i].along - stations[i - 1].along).toBeGreaterThanOrEqual(2500);
	});

	it('nimmt einen Fluss am Weg als Station auf', () => {
		const names = data([place('Startdorf', 0), place('Zieldorf', 12000)], landmark('Rhein', 3000, 'river'));
		const stations = stationsOf(tourOf(12000), names);
		const rhein = stations.find((s) => s.name === 'Rhein');
		expect(rhein?.kind).toBe('river');
		// Station liegt mitten im Abschnitt, der am Fluss entlangführt
		expect(rhein!.along).toBeGreaterThan(3000);
		expect(rhein!.along).toBeLessThan(5000);
	});

	it('liefert nichts ohne benannte Orte', () => {
		expect(stationsOf(tourOf(8000), data([]))).toEqual([]);
	});
});
