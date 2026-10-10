import { describe, expect, it } from 'vitest';
import { offset, type LngLat } from '$lib/geo/geo';
import type { RoutePath } from '$lib/routing/graphhopper';
import type { TourLeg } from '$lib/tour/model';
import { cumulative, deviation, slicePath, spliceLeg, windowsOf } from './slice';

const start: LngLat = [6.55, 51.35];
const eastLine = (meters: number, step = 100): LngLat[] =>
	Array.from({ length: Math.floor(meters / step) + 1 }, (_, i) => offset(start, 90, i * step));

const withHeight = (line: LngLat[]): [number, number, number][] => line.map(([lon, lat]) => [lon, lat, 30]);

describe('deviation', () => {
	it('erkennt einen kleinen Schlenker nicht als Umfahrung', () => {
		const old = eastLine(2000);
		// 100 m zur Seite und wieder zurück
		const hop = old.map((p, i) => (i >= 8 && i <= 12 ? offset(p, 0, 100) : p));
		const { max, different } = deviation(hop, old, 80);
		expect(max).toBeLessThan(150);
		expect(different).toBeLessThan(700);
	});

	it('erkennt einen Bogen von einem halben Kilometer Abstand', () => {
		const old = eastLine(3000);
		const arc = old.map((p, i) => offset(p, 0, 500 * Math.sin((Math.PI * i) / (old.length - 1))));
		const { max, different } = deviation(arc, old, 80);
		expect(max).toBeGreaterThan(450);
		expect(different).toBeGreaterThan(2000);
	});
});

describe('windowsOf', () => {
	it('lässt Anfang und Ende der Tour frei', () => {
		const cum = cumulative(eastLine(10000));
		const windows = windowsOf(cum, 3000, 500, 300);
		expect(windows.length).toBeGreaterThan(5);
		for (const w of windows) {
			expect(cum[w.from]).toBeGreaterThanOrEqual(299);
			expect(cum[w.to]).toBeLessThanOrEqual(9701);
			expect(w.meters).toBeGreaterThan(2900);
			expect(w.meters).toBeLessThan(3100);
		}
	});

	it('nimmt bei einer kurzen Tour kürzere Abschnitte', () => {
		const cum = cumulative(eastLine(2500));
		const windows = windowsOf(cum, 3000, 500, 300);
		expect(windows.length).toBeGreaterThan(0);
		expect(Math.max(...windows.map((w) => w.meters))).toBeLessThan(2000);
	});

	it('findet nichts auf sehr kurzen Wegen', () => {
		expect(windowsOf(cumulative(eastLine(500)), 3000, 500, 300)).toEqual([]);
	});
});

describe('slicePath', () => {
	it('schneidet die Abschnitts-Angaben passend zu', () => {
		const line = eastLine(1000);
		const path: RoutePath = {
			distance: 1000,
			time: 0,
			ascend: 0,
			descend: 0,
			coordinates: withHeight(line),
			details: {
				road_class: [
					[0, 4, 'residential'],
					[4, 10, 'cycleway']
				],
				bike_network: [],
				surface: [],
				smoothness: [],
				street_name: [],
				average_slope: []
			}
		};
		const part = slicePath(path, 2, 6);
		expect(part.coordinates).toHaveLength(5);
		expect(part.details.road_class).toEqual([
			[0, 2, 'residential'],
			[2, 4, 'cycleway']
		]);
		expect(part.distance).toBeCloseTo(400, -1);
	});
});

describe('spliceLeg', () => {
	// Hinweg 2 km nach Osten mit Abbiegehinweisen; Stück 8…12 wird durch einen Bogen nach Norden ersetzt
	const line = eastLine(2000);
	const leg: TourLeg = {
		coordinates: withHeight(line),
		distance: 2000,
		instructions: [
			{ index: 0, sign: 0, street: 'A-Straße' },
			{ index: 5, sign: 2, street: 'B-Weg' },
			{ index: 10, sign: -2, street: 'C-Weg' },
			{ index: 15, sign: 1, street: 'D-Weg' },
			{ index: 20, sign: 4 }
		],
		bridges: [[14, 16]],
		details: {
			road_class: [
				[0, 10, 'residential'],
				[10, 20, 'cycleway']
			],
			max_speed: [[0, 20, null]]
		}
	};
	const piece: RoutePath = {
		distance: 0,
		time: 0,
		ascend: 0,
		descend: 0,
		coordinates: withHeight([line[8], offset(line[8], 0, 200), offset(line[10], 0, 300), offset(line[12], 0, 200), line[12]]),
		details: {
			road_class: [[0, 4, 'track']],
			bike_network: [],
			surface: [],
			smoothness: [],
			street_name: [],
			average_slope: [],
			max_speed: [[0, 4, null]]
		},
		instructions: [
			{ index: 0, sign: 0, street: 'Feldweg' },
			{ index: 2, sign: 2 },
			{ index: 4, sign: 4 }
		]
	};

	it('setzt Koordinaten, Länge und Abschnitts-Angaben zusammen', () => {
		const result = spliceLeg(leg, 8, 12, piece);
		// 8 davor + 5 neue + 8 danach
		expect(result.coordinates).toHaveLength(8 + 5 + 8);
		expect(result.distance).toBeGreaterThan(2000);
		const classes = result.details!.road_class!;
		expect(classes[0]).toEqual([0, 8, 'residential']);
		expect(classes.find(([, , v]) => v === 'track')).toEqual([8, 12, 'track']);
		// alles liegt innerhalb der Strecke und ohne Lücke bis zum Ende
		expect(Math.max(...classes.map(([, t]) => t))).toBe(result.coordinates.length - 1);
		// Brücke bleibt, verschoben um 1 Punkt (5 neue statt 5 ersetzter: 8…12 = 5 Punkte → keine Verschiebung)
		expect(result.bridges).toEqual([[14, 16]]);
	});

	it('behält die Abbiegehinweise davor und dahinter, in richtiger Reihenfolge', () => {
		const result = spliceLeg(leg, 8, 12, piece);
		const ins = result.instructions!;
		for (let i = 1; i < ins.length; i++) expect(ins[i].index).toBeGreaterThanOrEqual(ins[i - 1].index);
		expect(ins[0]).toMatchObject({ index: 0, street: 'A-Straße' });
		expect(ins.some((i) => i.index === 5 && i.street === 'B-Weg')).toBe(true);
		// der Hinweis mitten im ersetzten Stück (Index 10) fällt weg, der des neuen Stücks kommt dazu
		expect(ins.some((i) => i.street === 'C-Weg')).toBe(false);
		expect(ins.some((i) => i.index === 10 && i.sign === 2)).toBe(true);
		// Ziel bleibt der letzte
		expect(ins[ins.length - 1]).toEqual({ index: result.coordinates.length - 1, sign: 4 });
	});

	it('ergänzt an den Nahtstellen einen Hinweis, wo der neue Weg abbiegt', () => {
		const result = spliceLeg(leg, 8, 12, piece);
		const atStart = result.instructions!.find((i) => i.index === 8);
		// vorher nach Osten, dann nach Norden: Linksabbiegen
		expect(atStart?.sign).toBeLessThan(0);
		expect(atStart?.street).toBe('Feldweg');
		// am Ende kommt der Weg aus Süden und fährt wieder nach Osten: ebenfalls links
		const atEnd = result.instructions!.find((i) => i.index === 12);
		expect(atEnd?.sign).toBeLessThan(0);
	});
});
