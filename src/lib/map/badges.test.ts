import { describe, expect, it } from 'vitest';
import { distance, distanceToLine, offset, type LngLat } from '$lib/geo/geo';
import { badgeSpots } from './badges';

const start: LngLat = [6.55, 51.35];

/** Weg vom Start 8 km nach Osten und wieder zurück, nach `bearing` ausgebuchtet */
function loop(bearing: number): LngLat[] {
	const out: LngLat[] = [];
	for (let i = 0; i <= 16; i++) {
		const along = offset(start, 90, i * 500);
		out.push(offset(along, bearing, Math.sin((i / 16) * Math.PI) * 3000));
	}
	return out;
}

describe('badgeSpots', () => {
	it('setzt ein Schild je Weg auf den Weg', () => {
		const lines = [loop(0), loop(180)];
		const spots = badgeSpots(lines);
		expect(spots).toHaveLength(2);
		spots.forEach((p, i) => expect(distanceToLine(p, lines[i])).toBeLessThan(5));
	});

	it('wählt Stellen weit weg vom anderen Weg', () => {
		const lines = [loop(0), loop(180)];
		const spots = badgeSpots(lines);
		expect(distanceToLine(spots[0], lines[1])).toBeGreaterThan(1500);
		expect(distanceToLine(spots[1], lines[0])).toBeGreaterThan(1500);
	});

	it('legt Schilder auch bei gleichen Wegen nicht übereinander', () => {
		const same = loop(0);
		const spots = badgeSpots([same, same, same]);
		expect(distance(spots[0], spots[1])).toBeGreaterThan(500);
		expect(distance(spots[0], spots[2])).toBeGreaterThan(500);
		expect(distance(spots[1], spots[2])).toBeGreaterThan(500);
	});

	it('nimmt bei einem einzelnen Weg die Mitte', () => {
		const line = loop(0);
		const [spot] = badgeSpots([line]);
		expect(distance(spot, line[8])).toBeLessThan(1500);
	});
});
