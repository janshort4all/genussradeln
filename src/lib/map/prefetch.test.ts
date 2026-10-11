import { describe, expect, it } from 'vitest';
import { offset, type LngLat } from '$lib/geo/geo';
import { tileOf, tilesAlong } from './prefetch';

describe('Kacheln vorladen', () => {
	it('rechnet Koordinaten in Kachelnummern um', () => {
		// Nullpunkt liegt auf Zoom 14 genau in der Mitte des Rasters (2^14 / 2)
		expect(tileOf([0, 0], 14)).toEqual({ x: 8192, y: 8192 });
		// weiter nach Osten → größeres x, weiter nach Norden → kleineres y
		expect(tileOf([6.8, 51.2], 14).x).toBeGreaterThan(tileOf([6.6, 51.2], 14).x);
		expect(tileOf([6.6, 51.4], 14).y).toBeLessThan(tileOf([6.6, 51.2], 14).y);
		// Niederrhein liegt bei x ≈ 8500 (186,6° von −180° aus gesehen, Zoom 14: 186,6 / 360 × 16384)
		expect(tileOf([6.6, 51.3], 14).x).toBe(Math.floor((186.6 / 360) * 16384));
	});

	it('nimmt für eine gerade Strecke nur die Kacheln im schmalen Streifen daneben', () => {
		const start: LngLat = [6.6, 51.33];
		const line = [start, offset(start, 90, 5000)];
		const tiles = tilesAlong(line, [14], 700);
		// 5 km sind etwa 3,3 Kacheln breit; mit 700 m Streifen liegt die Linie in 1–2 Reihen
		expect(tiles.length).toBeGreaterThanOrEqual(4);
		expect(tiles.length).toBeLessThanOrEqual(10);
		// eine Kachel zwischen Anfang und Ende fehlt nicht
		const mid = tileOf(offset(start, 90, 2500), 14);
		expect(tiles).toContain(`14/${mid.x}/${mid.y}`);
	});

	it('liefert für mehrere Zoomstufen je eigene Kacheln ohne Doppelte', () => {
		const start: LngLat = [6.6, 51.33];
		const line = [start, offset(start, 0, 3000)];
		const tiles = tilesAlong(line, [12, 13, 14], 500);
		expect(new Set(tiles).size).toBe(tiles.length);
		expect(tiles.some((t) => t.startsWith('12/'))).toBe(true);
		expect(tiles.some((t) => t.startsWith('14/'))).toBe(true);
	});
});
