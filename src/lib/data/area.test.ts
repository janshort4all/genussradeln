import { describe, expect, it } from 'vitest';
import { corridorTiles, goalArea, roundArea } from './area';
import { tileKey, tileOf } from './grid';

const MOERS: [number, number] = [6.63, 51.45];
const KREFELD: [number, number] = [6.56, 51.33];
const NIJMEGEN: [number, number] = [5.865, 51.842];
const KOELN: [number, number] = [6.958, 50.941];

describe('Kacheln für einen Wunsch', () => {
	it('Weg zu einem nahen Ziel: wenige Kacheln, Start und Ziel dabei', () => {
		const tiles = goalArea(MOERS, KREFELD).map(tileKey);
		expect(tiles).toContain(tileKey(tileOf(MOERS)));
		expect(tiles).toContain(tileKey(tileOf(KREFELD)));
		expect(tiles.length).toBeLessThanOrEqual(9);
	});

	it('weiter Weg: mehr Kacheln, aber nicht das ganze Land', () => {
		const near = goalArea(MOERS, KREFELD).length;
		const far = goalArea([6.762, 51.434], NIJMEGEN).length; // Duisburg – Nijmegen (77 km Luftlinie: Ellipse mit 2 × 77 km Umwegspielraum)
		expect(far).toBeGreaterThan(near);
		expect(far).toBeLessThanOrEqual(90);
	});

	it('Runde: Kreis um den Start, wächst mit der Länge', () => {
		const small = roundArea(KOELN, 10).length;
		const big = roundArea(KOELN, 50).length;
		expect(roundArea(KOELN, 20).map(tileKey)).toContain(tileKey(tileOf(KOELN)));
		expect(small).toBeLessThanOrEqual(4);
		expect(big).toBeGreaterThan(small);
		expect(big).toBeLessThanOrEqual(14);
	});

	it('Strecke mit Rand: nur Kacheln entlang der Linie', () => {
		const line: [number, number][] = [];
		for (let i = 0; i <= 20; i++) line.push([6.5 + i * 0.01, 51.4]); // ca. 14 km nach Osten
		const tiles = corridorTiles(line, 9000);
		expect(tiles.length).toBeGreaterThanOrEqual(2);
		expect(tiles.length).toBeLessThanOrEqual(8);
	});
});
