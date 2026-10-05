import { describe, expect, it } from 'vitest';
import { distance, offset, type LngLat } from '$lib/geo/geo';
import { NONE, WATER } from '$lib/scoring/landscape';
import { makeLandscape, makePath } from '$lib/scoring/test-helpers';
import type { TourRequest } from '$lib/tour/model';
import {
	extraDistanceText,
	highlightSentence,
	honestTitles,
	sideOf,
	sideTitle,
	titleOptions,
	viaStreetTitle,
	withSide
} from './describe';
import { RoutingUnavailableError, type RouteOptions } from './graphhopper';
import { backtrackMeters } from '$lib/scoring/backtrack';
import { findScenicVias, planTours, sideVias } from './plan';

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

	it('legt Zwischenpunkte nie hinter das Ziel oder vor den Start', () => {
		// See östlich hinter dem Ziel (Ziel liegt in Spalte ≈ 124)
		const behind = makeLandscape((row, col) => (row >= 70 && row <= 85 && col > 128 && col < 150 ? WATER : NONE));
		const vias = findScenicVias(behind, start, end, 12_000, [start, end], 5);
		for (const via of vias) {
			expect(distance(via, end)).toBeLessThan(distance(start, end));
			expect(distance(via, start)).toBeLessThan(distance(start, end));
		}
	});

	it('sucht keine Zwischenpunkte, wenn kein Umweg erlaubt ist', () => {
		expect(findScenicVias(landscape, start, end, 6000, [start, end], 5)).toEqual([]);
	});
});

describe('planTours', () => {
	it('schlägt verschiedene Wege vor: der schönste zuerst, der direkte immer dabei und unten', async () => {
		const tours = await planTours(request(), { route: fakeRoute, landscape });
		expect(tours.length).toBeGreaterThanOrEqual(2);
		expect(tours.length).toBeLessThanOrEqual(5);
		expect(tours[0].label).toBe('Am schönsten');
		const direct = tours.find((t) => t.label === 'Direkt');
		expect(direct).toBeDefined();
		expect(tours.at(-1)).toBe(direct);
		expect(direct!.waypoints.some((w) => w.kind === 'via')).toBe(false);
		// danach vom längsten zum kürzesten
		for (let i = 1; i + 1 < tours.length; i++) {
			expect(tours[i].stats.distance).toBeGreaterThanOrEqual(tours[i + 1].stats.distance);
		}
		expect(new Set(tours.map((t) => t.title)).size).toBe(tours.length);
		// gemütlich: 15 km/h
		const km = tours[0].stats.distance / 1000;
		expect(tours[0].minutes).toBe(Math.round((km / 15) * 60));
	});

	it('bietet zusätzlich einen fast direkten Weg an, wenn der direkte unschön ist', async () => {
		// direkter Weg an der Hauptstraße, Umwege über Radwege und am See – die schönen sind alle deutlich länger
		const route = (points: LngLat[], options: RouteOptions) => {
			const via = points.length === 3 ? points[1] : undefined;
			const nearLine = via && Math.abs(via[1] - start[1]) < 0.012; // knapp neben der Luftlinie
			const paths = [makePath(points, { roadClass: via ? (nearLine ? 'track' : 'cycleway') : 'primary' })];
			if (options.alternatives) paths.push(makePath([points[0], offset(points[0], 135, 4000), points[1]], { roadClass: 'cycleway' }));
			return Promise.resolve(paths);
		};
		const tours = await planTours(request(), { route, landscape });
		const directKm = 6;
		const compactTour = tours.find((t) => t.stats.distance / 1000 <= directKm * 1.15 + 1);
		expect(compactTour).toBeDefined();
		expect(compactTour!.stats.major).toBe(0); // nicht die Hauptstraße
	});

	it('repariert Wege mit Abstecher in eine Sackgasse, statt sie zu zeigen', async () => {
		// Jeder Hilfspunkt liegt am Ende einer 500-m-Sackgasse; deren Abzweigung („base“) liegt an einem guten Weg.
		// Fragt der Planer danach mit der Abzweigung als Punkt, gibt es den Weg ohne Abstecher.
		const bases: LngLat[] = [];
		let repairs = 0;
		const route = (points: LngLat[], options: RouteOptions) => {
			if (points.length === 2) {
				const paths = [makePath(points, { roadClass: 'primary' })];
				if (options.alternatives) paths.push(makePath([points[0], offset(points[0], 135, 4000), points[1]], { roadClass: 'primary' }));
				return Promise.resolve(paths);
			}
			const [from, via, to] = points;
			if (bases.some((b) => distance(b, via) < 40)) {
				repairs++;
				return Promise.resolve([makePath([from, via, to], { roadClass: 'cycleway' })]);
			}
			const base = offset(via, 180, 500);
			bases.push(base);
			return Promise.resolve([makePath([from, base, via, base, to], { roadClass: 'cycleway' })]);
		};
		const tours = await planTours(request(), { route, landscape });
		expect(repairs).toBeGreaterThan(0);
		for (const tour of tours) {
			for (const leg of tour.legs) {
				expect(backtrackMeters(leg.coordinates.map(([x, y]) => [x, y] as LngLat))).toBeLessThanOrEqual(50);
			}
		}
		expect(tours.some((t) => t.waypoints.some((w) => w.kind === 'via'))).toBe(true);
	});

	it('legt Zwischenpunkte für „Fast direkt“ knapp neben die Luftlinie', () => {
		const vias = sideVias(start, end);
		expect(vias).toHaveLength(4);
		for (const via of vias) {
			const offLine = distance(via, [via[0], start[1]]);
			expect(offLine).toBeGreaterThan(600);
			expect(offLine).toBeLessThan(800);
		}
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
	const base = { distance: 10000, water: 0, forest: 0, green: 0, fields: 0, nature: 0, network: 0, quiet: 0, major: 0, badSurface: 0, climb: 'flach' as const };

	it('benennt Wege nur nach einer Landschaft, die wirklich vorne liegt', () => {
		// 44 % Wasser, 30 % Wald: kein „Durch den Wald“
		expect(honestTitles({ ...base, water: 0.44, forest: 0.3 }, 0.85)).toEqual(['Am Wasser entlang']);
		// fast gleich viel: beide Titel sind ehrlich
		expect(honestTitles({ ...base, water: 0.44, forest: 0.42 }, 0.85)).toEqual(['Am Wasser entlang', 'Durch den Wald']);
		expect(withSide('Am Wasser entlang', 'östlich')).toBe('Am Wasser entlang – östliche Strecke');
	});

	it('benennt Wege nach ihrer Landschaft', () => {
		expect(titleOptions({ ...base, water: 0.5, forest: 0.2 })[0]).toBe('Am Wasser entlang');
		expect(titleOptions({ ...base, fields: 0.6, green: 0.2 })[0]).toBe('Durch die Felder');
		expect(titleOptions(base)[0]).toBe('Ruhige Nebenstrecke');
	});

	it('beschreibt in Worten statt Prozent', () => {
		const text = highlightSentence({ ...base, water: 0.5, forest: 0.3 });
		expect(text).toBe('Zur Hälfte am Wasser und ein gutes Stück durch den Wald, kaum große Straßen.');
		expect(text).not.toMatch(/%/);
		// der Titel-gebende Teil steht vorne
		expect(highlightSentence({ ...base, water: 0.5, forest: 0.3 }, 'Durch den Wald')).toBe(
			'Ein gutes Stück durch den Wald und zur Hälfte am Wasser, kaum große Straßen.'
		);
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
