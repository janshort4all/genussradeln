import { describe, expect, it } from 'vitest';
import { offset, type LngLat } from '$lib/geo/geo';
import { NameIndex, type NamedPoint } from '$lib/naming/names';
import type { PlannedTour } from '$lib/tour/model';
import { findHighlights } from './highlights';

const start: LngLat = [6.55, 51.35];
const east = (m: number) => offset(start, 90, m);
const tour = {
	legs: [
		{
			coordinates: Array.from({ length: 121 }, (_, i) => east(i * 100)).map(([lon, lat]) => [lon, lat, 30]),
			distance: 12000
		}
	]
} as unknown as PlannedTour;

/** Fläche/Fluss als Punkte alle ≈ 400 m: `count` Punkte ab `from`, `beside` Meter nördlich der Tour */
function area(name: string, kind: 'lake' | 'forest' | 'park' | 'river', from: number, beside: number, count: number): NamedPoint[] {
	return Array.from({ length: count }, (_, i) => ({ name, kind, lngLat: offset(east(from + i * 400), 0, beside) }));
}

const names = (landmarks: NamedPoint[]) => ({ landmarks: new NameIndex(landmarks), places: new NameIndex([]) });

describe('findHighlights', () => {
	it('findet einen See und einen Wald neben der Tour', () => {
		const found = findHighlights(tour, names([...area('Großer See', 'lake', 3000, 2000, 6), ...area('Stadtwald', 'forest', 8000, 3000, 8)]));
		expect(found.map((h) => h.name).sort()).toEqual(['Großer See', 'Stadtwald']);
		const see = found.find((h) => h.name === 'Großer See')!;
		expect(see.distance).toBeGreaterThan(1800);
		expect(see.distance).toBeLessThan(2200);
	});

	it('lässt Highlights weg, an denen die Tour schon entlangführt', () => {
		const found = findHighlights(tour, names(area('Fluss am Weg', 'river', 1000, 100, 20)));
		expect(found).toEqual([]);
	});

	it('lässt zu kleine und zu weit entfernte Highlights weg', () => {
		const found = findHighlights(tour, names([...area('Tümpel', 'lake', 3000, 1500, 1), ...area('Ferner Wald', 'forest', 5000, 9000, 10)]));
		expect(found).toEqual([]);
	});

	it('trennt zwei Wälder gleichen Namens', () => {
		const found = findHighlights(tour, names([...area('Stadtwald', 'forest', 1000, 2000, 6), ...area('Stadtwald', 'forest', 9000, 2000, 6)]));
		expect(found.filter((h) => h.name === 'Stadtwald')).toHaveLength(2);
	});
});
