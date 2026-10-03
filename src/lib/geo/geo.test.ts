import { describe, expect, it } from 'vitest';
import {
	bearing,
	distance,
	distanceToLine,
	lineLength,
	offset,
	resample,
	type LngLat
} from './geo';

const krefeld: LngLat = [6.5623, 51.3388];
const duisburg: LngLat = [6.7623, 51.4386];

describe('geo', () => {
	it('berechnet Entfernungen in Metern', () => {
		// Krefeld–Duisburg Luftlinie ca. 18 km
		expect(distance(krefeld, duisburg)).toBeGreaterThan(17000);
		expect(distance(krefeld, duisburg)).toBeLessThan(19000);
		expect(distance(krefeld, krefeld)).toBe(0);
	});

	it('tastet eine Linie gleichmäßig ab', () => {
		const line: LngLat[] = [krefeld, offset(krefeld, 90, 1000)];
		const points = resample(line, 100);
		expect(points).toHaveLength(11);
		expect(lineLength(points)).toBeCloseTo(1000, -1);
	});

	it('misst den Abstand eines Punkts zur Linie', () => {
		const line: LngLat[] = [krefeld, offset(krefeld, 90, 2000)];
		const p = offset(offset(krefeld, 90, 1000), 0, 300);
		expect(distanceToLine(p, line)).toBeCloseTo(300, -1);
	});

	it('bestimmt Himmelsrichtungen', () => {
		expect(bearing(krefeld, offset(krefeld, 90, 1000))).toBeCloseTo(90, 0);
		expect(bearing(krefeld, offset(krefeld, 0, 1000))).toBeCloseTo(0, 0);
	});
});
