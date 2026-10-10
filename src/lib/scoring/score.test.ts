import { describe, expect, it } from 'vitest';
import { offset, type LngLat } from '$lib/geo/geo';
import { FIELDS, FOREST, NONE, WATER } from './landscape';
import { mutualOverlap, overlapShare } from './overlap';
import type { RoadMask } from './roads';
import { analyzeRoute, beautyScore, combineStats, detailShare, roadsideShare, roadsideStats } from './score';
import { makeLandscape, makePath } from './test-helpers';

const start: LngLat = [6.55, 51.35];
const east = (meters: number): LngLat[] => [start, offset(start, 90, meters)];

describe('detailShare', () => {
	it('misst Anteile nach Länge, nicht nach Anzahl der Abschnitte', () => {
		const lengths = [100, 300];
		const intervals: [number, number, string][] = [
			[0, 1, 'primary'],
			[1, 2, 'cycleway']
		];
		expect(detailShare(intervals, lengths, 400, (v) => v === 'cycleway')).toBeCloseTo(0.75);
		expect(detailShare(undefined, lengths, 400, () => true)).toBe(0);
	});
});

describe('analyzeRoute', () => {
	it('erkennt Wasser in der Nähe des Wegs', () => {
		// Wasser in einer Zeile knapp südlich des Wegs (Breitengrad 51.35 liegt in Zeile 55)
		const landscape = makeLandscape((row) => (row === 56 ? WATER : NONE));
		const stats = analyzeRoute(makePath(east(2000)), landscape);
		expect(stats.water).toBeGreaterThan(0.9);
		expect(stats.forest).toBe(0);
		expect(stats.nature).toBeGreaterThan(0.9);
	});

	it('zählt einen großen Fluss auch hinter breiten Wiesen, einen kleinen Teich nicht', () => {
		// Weg liegt in Zeile 55; Fluss 3 Zeilen (≈ 300 m) südlich, 6 Zeilen breit
		const river = makeLandscape((row) => (row >= 58 && row <= 63 ? WATER : NONE));
		// Teich: nur 2 Zellen, ebenfalls ≈ 300 m entfernt
		const pond = makeLandscape((row, col) => (row === 58 && (col === 40 || col === 41) ? WATER : NONE));
		expect(analyzeRoute(makePath(east(2000)), river).water).toBeGreaterThan(0.9);
		expect(analyzeRoute(makePath(east(2000)), pond).water).toBe(0);
	});

	it('erkennt Felder und wertet sie schwächer als Wasser', () => {
		const fieldsAround = makeLandscape((row) => (row >= 50 && row <= 60 ? FIELDS : NONE));
		const waterAround = makeLandscape((row) => (row >= 50 && row <= 60 ? WATER : NONE));
		const onFields = analyzeRoute(makePath(east(2000)), fieldsAround);
		const onWater = analyzeRoute(makePath(east(2000)), waterAround);
		expect(onFields.fields).toBeGreaterThan(0.9);
		expect(onFields.nature).toBeGreaterThan(0.9);
		expect(beautyScore(onWater)).toBeGreaterThan(beautyScore(onFields));
		expect(beautyScore(onFields)).toBeGreaterThan(beautyScore(analyzeRoute(makePath(east(2000)))));
	});

	it('wertet große Straßen und schlechten Belag ab', () => {
		const nice = analyzeRoute(makePath(east(2000), { roadClass: 'cycleway', network: 'local' }));
		const ugly = analyzeRoute(makePath(east(2000), { roadClass: 'primary', surface: 'cobblestone' }));
		expect(nice.quiet).toBe(1);
		expect(nice.network).toBe(1);
		expect(ugly.major).toBe(1);
		expect(ugly.badSurface).toBe(1);
		expect(beautyScore(nice)).toBeGreaterThan(beautyScore(ugly));
	});

	it('kombiniert Hin- und Rückweg längengewichtet', () => {
		const landscape = makeLandscape((row) => (row >= 50 && row <= 60 ? FOREST : NONE));
		const a = analyzeRoute(makePath(east(1000)), landscape);
		const b = analyzeRoute(makePath(east(3000), { climbPerKm: 20 }));
		const both = combineStats([a, b]);
		expect(both.distance).toBeCloseTo(4000, -1);
		expect(both.forest).toBeCloseTo(0.25, 1);
		expect(both.climb).toBe('hügelig');
	});
});

describe('overlap', () => {
	it('erkennt gemeinsame Strecke', () => {
		const long = east(2000);
		const half = east(1000);
		expect(overlapShare(half, long)).toBeCloseTo(1, 1);
		expect(overlapShare(long, half)).toBeCloseTo(0.5, 1);
		expect(mutualOverlap(long, half)).toBeCloseTo(1, 1);
	});

	it('getrennte Wege überdecken sich nicht', () => {
		const a = east(2000);
		const b = a.map((p) => offset(p, 0, 500));
		expect(overlapShare(a, b)).toBe(0);
	});
});

describe('roadsideShare', () => {
	// große Straße überall östlich von 1000 m hinter dem Start
	const cut = offset(start, 90, 1000)[0];
	const roads = { near: ([lon]: LngLat) => lon > cut, nearMotorway: () => false } as unknown as RoadMask;

	it('zählt Radwege direkt neben großen Straßen und nimmt sie aus „ruhig“ heraus', () => {
		const line = [start, offset(start, 90, 1000), offset(start, 90, 2000)];
		const stats = analyzeRoute(makePath(line, { roadClass: 'cycleway' }), undefined, roads);
		expect(stats.roadside).toBeCloseTo(0.5, 1);
		expect(stats.quiet).toBeCloseTo(0.5, 1);
		expect(roadsideShare(makePath(east(2000), { roadClass: 'residential' }), roads)).toBe(0);
	});

	it('stört im Grünen weniger und an der Autobahn mehr', () => {
		const line = [start, offset(start, 90, 1000), offset(start, 90, 2000)];
		const path = makePath(line, { roadClass: 'cycleway' });
		const motorway = { near: ([lon]: LngLat) => lon > cut, nearMotorway: () => true } as unknown as RoadMask;
		const forest = makeLandscape(() => FOREST);
		const plain = roadsideStats(path, roads);
		expect(plain.noise).toBeCloseTo(plain.share, 5);
		expect(roadsideStats(path, roads, forest).noise).toBeCloseTo(plain.share * 0.35, 2);
		expect(roadsideStats(path, motorway).noise).toBeCloseTo(plain.share * 1.3, 2);
	});

	it('übersieht kurze Stücke (Kreuzungen, Brücken)', () => {
		const line = [start, offset(start, 90, 950), offset(start, 90, 1050)];
		expect(roadsideShare(makePath(line, { roadClass: 'cycleway' }), roads)).toBe(0);
	});
});

describe('mitten durch Wald statt daneben entlang', () => {
	const path = makePath(east(2000));
	// der Weg liegt in Zeile 55: „drin“ = überall Wald, „daneben“ = Wald nur nördlich davon (bis Zeile 54)
	const inside = makeLandscape(() => FOREST);
	const beside = makeLandscape((row) => (row <= 54 ? FOREST : NONE));

	it('misst die Tiefe: Rand ≈ 0,25, mittendrin 1, draußen nichts', () => {
		expect(beside.woodDepthAtCell(54, 100)?.depth).toBeCloseTo(0.25);
		expect(beside.woodDepthAtCell(30, 100)?.depth).toBe(1);
		expect(beside.woodDepthAtCell(55, 100)).toBeUndefined();
	});

	it('ein Weg mitten im Wald zählt als „durch“, am Waldrand nur als „entlang“', () => {
		const through = analyzeRoute(path, inside);
		const along = analyzeRoute(path, beside);
		expect(through.forestThrough).toBeGreaterThan(0.9);
		expect(along.forest).toBeGreaterThan(0.9);
		expect(along.forestThrough).toBeLessThan(0.05);
	});

	it('mitten durch ist schöner als daneben entlang', () => {
		expect(beautyScore(analyzeRoute(path, inside))).toBeGreaterThan(beautyScore(analyzeRoute(path, beside)) + 0.5);
	});
});
