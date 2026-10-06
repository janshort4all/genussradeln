import { describe, expect, it } from 'vitest';
import type { PlannedTour } from '$lib/tour/model';
import { decodePolyline, encodePolyline, packTour, unpackTour } from './link';

const tour: PlannedTour = {
	id: 'abc12345',
	title: 'Am Rhein entlang über Nierst',
	label: 'Längste Tour',
	highlight: 'Zur Hälfte am Wasser, kaum große Straßen.',
	request: {
		start: { name: 'Start', lngLat: [6.63286, 51.32997] },
		destination: { name: 'Kempen', lngLat: [6.4195, 51.3642], settlement: true },
		effort: 'easy',
		returnMode: 'one-way'
	},
	waypoints: [
		{ lngLat: [6.63286, 51.32997], kind: 'start', name: 'Start' },
		{ lngLat: [6.5, 51.35], kind: 'via' },
		{ lngLat: [6.4195, 51.3642], kind: 'destination', name: 'Kempen' }
	],
	legs: [
		{
			coordinates: [
				[6.63286, 51.32997, 36.9],
				[6.6, 51.34, 38.2],
				[6.4195, 51.3642, 35]
			],
			distance: 17234.6,
			instructions: [
				{ index: 0, sign: 0, street: 'Maybachstraße' },
				{ index: 1, sign: 6, exit: 2 },
				{ index: 2, sign: 4 }
			]
		}
	],
	stats: { distance: 17234.6, water: 0.5, forest: 0.1, green: 0.2, fields: 0.1, nature: 0.8, network: 0.3, quiet: 0.6, major: 0.01, roadside: 0, badSurface: 0, climb: 'flach' },
	extraDistance: 2100,
	minutes: 70
};

describe('Tour als Link', () => {
	it('packt und entpackt eine Tour ohne Verlust des Wesentlichen', async () => {
		const packed = await packTour(tour);
		expect(packed).toMatch(/^[A-Za-z0-9_-]+$/); // passt ohne Sonderzeichen in einen Link
		const back = await unpackTour(packed);
		expect(back.title).toBe(tour.title);
		expect(back.shared).toBe(true);
		expect(back.request.destination.name).toBe('Kempen');
		expect(back.legs[0].coordinates.map(([x, y, z]) => [x, y, z])).toEqual([
			[6.63286, 51.32997, 37],
			[6.6, 51.34, 38],
			[6.4195, 51.3642, 35]
		]);
		expect(back.legs[0].instructions).toEqual(tour.legs[0].instructions);
		expect(back.waypoints[1]).toEqual({ lngLat: [6.5, 51.35], kind: 'via' });
	});

	it('kodiert Wege als Polyline', () => {
		const line: [number, number][] = [
			[-120.2, 38.5],
			[-120.95, 40.7],
			[-126.453, 43.252]
		];
		// Beispiel aus der Beschreibung des Verfahrens
		expect(encodePolyline(line)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
		expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(line);
	});
});
