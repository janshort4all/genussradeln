import { describe, expect, it } from 'vitest';
import { offset, type LngLat } from '$lib/geo/geo';
import { climbWordOf, elevationProfile } from './elevation';

const start: LngLat = [6.6, 51.33];

/** Linie nach Osten mit Höhen je 100 m */
function line(heights: number[]): [number, number, number][] {
	return heights.map((ele, i) => {
		const [lon, lat] = offset(start, 90, i * 100);
		return [lon, lat, ele];
	});
}

describe('elevationProfile', () => {
	it('glättet Ausreißer weg (z. B. eine Brücke)', () => {
		const heights = Array.from({ length: 51 }, () => 30);
		heights[25] = 45; // Brücke: 15 m Sprung auf 100 m
		const profile = elevationProfile(line(heights));
		expect(profile.max).toBeLessThan(36);
		expect(climbWordOf(profile)).toBe('flach');
	});

	it('zählt einen gleichmäßigen Anstieg', () => {
		// 5 km, 100 m Anstieg → 20 m je km
		const heights = Array.from({ length: 51 }, (_, i) => 30 + i * 2);
		const profile = elevationProfile(line(heights));
		expect(profile.ascent).toBeGreaterThan(85);
		expect(profile.ascent).toBeLessThan(105);
		expect(profile.highestAt).toBeGreaterThan(4500);
		expect(climbWordOf(profile)).toBe('hügelig');
	});

	it('ein kurzes steiles Stück macht „leicht hügelig“', () => {
		// 10 km flach, dazwischen 600 m mit 8 % Steigung und gleich wieder runter
		const heights = Array.from({ length: 101 }, () => 30);
		for (let i = 0; i <= 6; i++) heights[40 + i] = 30 + i * 8;
		for (let i = 0; i <= 6; i++) heights[46 + i] = 78 - i * 8;
		const profile = elevationProfile(line(heights));
		expect(profile.maxGrade).toBeGreaterThan(6);
		expect(climbWordOf(profile)).not.toBe('flach');
	});
});
