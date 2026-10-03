import { describe, expect, it } from 'vitest';
import { distance, offset, type LngLat } from '$lib/geo/geo';
import { NONE, WATER } from '$lib/scoring/landscape';
import { makeLandscape, makePath } from '$lib/scoring/test-helpers';
import type { TourRequest } from '$lib/tour/model';
import {
	extraDistanceText,
	highlightSentence,
	sideOf,
	sideTitle,
	titleOptions,
	viaStreetTitle
} from './describe';
import { RoutingUnavailableError, type RouteOptions } from './graphhopper';
import { findScenicVias, planTours } from './plan';

const start: LngLat = [6.6, 51.33];
const end: LngLat = offset(start, 90, 6000); // 6 km nach Osten

/** Künstlicher Routing-Dienst: fährt Luftlinie durch alle Punkte; liefert bei Alternativen einen Bogen dazu */
function fakeRoute(points: LngLat[], options: RouteOptions) {
	const paths = [makePath(points, { roadClass: 'residential' })];
	if (options.alternatives) {
		const bend = offset(points[0], 135, 4000);
		paths.push(makePath([points[0], bend, points[points.length - 1]], { roadClass: 'cycleway' }));
	}
	return Promise.resolve(paths);
}

// Ein See ca. 1,5–2 km nördlich der Luftlinie (Start liegt in Zeile 77; Zeilen 58–62 ≈ 1,5–2 km nördlich)
const landscape = makeLandscape((row, col) => (row >= 58 && row <= 62 && col > 70 && col < 120 ? WATER : NONE));

function request(partial: Partial<TourRequest> = {}): TourRequest {
	return {
		start: { name: 'Start', lngLat: start },
		destination: { name: 'Ziel', lngLat: end },
		detour: 'nicest',
		effort: 'easy',
		returnMode: 'one-way',
		...partial
	};
}

describe('findScenicVias', () => {
	it('findet schöne Zwischenpunkte innerhalb des Umweg-Spielraums', () => {
		const vias = findScenicVias(landscape, start, end, 10_000, [start, end], 5);
		expect(vias.length).toBeGreaterThan(0);
		for (const via of vias) {
			// Umweg über den Punkt passt in den Spielraum
			expect(distance(start, via) + distance(via, end)).toBeLessThanOrEqual(10_000 / 1.25 + 1);
			// nicht im Wasser selbst
			expect(landscape.classAt(via)).not.toBe(WATER);
		}
	});

	it('sucht keine Zwischenpunkte, wenn kein Umweg erlaubt ist', () => {
		expect(findScenicVias(landscape, start, end, 6000, [start, end], 5)).toEqual([]);
	});
});

describe('planTours', () => {
	it('schlägt höchstens drei verschiedene Wege vor, der schönste zuerst', async () => {
		const tours = await planTours(request(), { route: fakeRoute, landscape });
		expect(tours.length).toBeGreaterThanOrEqual(2);
		expect(tours.length).toBeLessThanOrEqual(3);
		expect(tours[0].label).toBe('Am schönsten');
		expect(new Set(tours.map((t) => t.title)).size).toBe(tours.length);
		// gemütlich: 15 km/h
		const km = tours[0].stats.distance / 1000;
		expect(tours[0].minutes).toBe(Math.round((km / 15) * 60));
	});

	it('plant bei „auf anderem Weg zurück“ Hin- und Rückweg', async () => {
		const tours = await planTours(request({ returnMode: 'other-way' }), { route: fakeRoute, landscape });
		// gleicher Hinweg mit anderem Rückweg zählt als eigener Vorschlag
		expect(tours.length).toBeGreaterThan(1);
		expect(tours[0].legs).toHaveLength(2);
		const kinds = tours[0].waypoints.map((w) => w.kind);
		expect(kinds[0]).toBe('start');
		expect(kinds[kinds.length - 1]).toBe('start');
		expect(kinds).toContain('destination');
	});

	it('meldet einen nicht erreichbaren Routing-Dienst weiter', async () => {
		const offline = () => Promise.reject(new RoutingUnavailableError());
		await expect(planTours(request(), { route: offline, landscape })).rejects.toBeInstanceOf(
			RoutingUnavailableError
		);
	});
});

describe('describe', () => {
	const base = { distance: 10000, water: 0, forest: 0, green: 0, nature: 0, network: 0, quiet: 0, major: 0, badSurface: 0, climb: 'flach' as const };

	it('benennt Wege nach ihrer Landschaft', () => {
		expect(titleOptions({ ...base, water: 0.5, forest: 0.2 })[0]).toBe('Am Wasser entlang');
		expect(titleOptions(base)[0]).toBe('Ruhige Nebenstrecke');
	});

	it('beschreibt in Worten statt Prozent', () => {
		const text = highlightSentence({ ...base, water: 0.5, forest: 0.3 });
		expect(text).toBe('Zur Hälfte am Wasser und ein gutes Stück durch den Wald, kaum große Straßen.');
		expect(text).not.toMatch(/%/);
	});

	it('benennt Wege nach einer Straße mit passendem Artikel', () => {
		expect(viaStreetTitle('Uerdinger Straße')).toBe('Über die Uerdinger Straße');
		expect(viaStreetTitle('Rheindeich')).toBe('Über den Rheindeich');
		expect(viaStreetTitle('Am Bruch')).toBe('Über „Am Bruch“');
		expect(viaStreetTitle('Kurkölner Straße')).toBe('Über die Kurkölner Straße');
	});

	it('beschreibt die Lage eines Wegs als Himmelsrichtung', () => {
		// Start → Ziel nach Osten; ein Bogen nach Norden liegt „nördlich“
		const north = offset(offset(start, 90, 3000), 0, 1500);
		const south = offset(offset(start, 90, 3000), 180, 1500);
		expect(sideOf([start, north, end], start, end)).toBe('nördlich');
		expect(sideOf([start, south, end], start, end)).toBe('südlich');
		expect(sideOf([start, end], start, end)).toBeUndefined();
		expect(sideTitle('nördlich')).toBe('Nördliche Strecke');
		expect(sideTitle('östlich')).toBe('Östliche Strecke');
		expect(sideTitle('nördlich', 'südlich', true)).toBe('Hin nördlich, zurück südlich');
	});

	it('nennt den Mehrweg', () => {
		expect(extraDistanceText(2100)).toBe('2,1 km länger als der direkte Weg');
		expect(extraDistanceText(100)).toBe('So kurz wie der direkte Weg');
	});
});
