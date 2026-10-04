import { describe, expect, it } from 'vitest';
import { offset, type LngLat } from '$lib/geo/geo';
import { backtrackMeters } from './backtrack';

const start: LngLat = [6.6, 51.3];
const at = (east: number, north = 0) => offset(offset(start, 90, east), 0, north);

describe('backtrackMeters', () => {
	it('ein gerader Weg hat keinen Stummel', () => {
		expect(backtrackMeters([at(0), at(3000)])).toBe(0);
	});

	it('erkennt ein Hin und Zurück in eine Sackgasse', () => {
		// 1 km nach Osten, 400 m nach Norden in die Sackgasse, zurück, weiter nach Osten
		const line = [at(0), at(1000), at(1000, 400), at(1000), at(2000)];
		const meters = backtrackMeters(line);
		expect(meters).toBeGreaterThan(300);
		expect(meters).toBeLessThan(500);
	});

	it('ein Kreuzen des eigenen Wegs zählt kaum (unter der Grenze von 50 m)', () => {
		// Schleife: nach Osten, im Bogen nach Norden und zurück nach Westen über die Strecke hinweg
		const rightAngle = [at(0), at(2000), at(2000, 1000), at(1000, 1000), at(1000, -1000), at(3000, -1000)];
		const shallow = [at(0), at(2000), at(2000, 1000), at(1300, 1000), at(800, -1000), at(3000, -1000)];
		expect(backtrackMeters(rightAngle)).toBeLessThan(50);
		expect(backtrackMeters(shallow)).toBeLessThan(50);
	});

	it('erkennt eine Lasso-Schleife um einen Punkt (100 m Stiel hin und zurück)', () => {
		// wie in den Rheinwiesen: von der Straße 100 m hinein, Runde, über dieselben 100 m zurück
		const line = [at(0), at(1000), at(1000, 100), at(1300, 400), at(1000, 700), at(700, 400), at(1000, 100), at(1000), at(2000)];
		expect(backtrackMeters(line)).toBeGreaterThan(50);
	});
});
