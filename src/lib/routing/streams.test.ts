import { describe, expect, it } from 'vitest';
import { offset, type LngLat } from '$lib/geo/geo';
import { findStretches, parseStreams, stretchCorridor, type Watercourse } from './streams';

const from: LngLat = [6.6, 51.4];
const to = offset(from, 90, 8000);
const direct: LngLat[] = [from, to];
/** Linie von Punkt zu Punkt (alle 500 m ein Stützpunkt) */
const course = (name: string, points: LngLat[]): Watercourse => ({ name, line: points });
const along = (meters: number, side: number): LngLat => offset(offset(from, 90, meters), 0, side);

describe('findStretches', () => {
	// ein Bach 1,2 km nördlich der Strecke, parallel von 2 km bis 7 km (5 km lang)
	const north = course('Nordbach', [along(2000, 1200), along(3500, 1200), along(5000, 1200), along(7000, 1200)]);
	// ein Bach, der direkt an der Strecke liegt
	const onRoute = course('Streckenbach', [along(1500, 10), along(7500, 10)]);
	// ein sehr weit entferntes Gewässer
	const far = course('Fernbach', [along(2000, 9000), along(7000, 9000)]);

	it('findet Abschnitte neben der Strecke, nicht die auf der Strecke und nicht die weit entfernten', () => {
		const stretches = findStretches([north, onRoute, far], from, to, 14_000, direct, 3);
		expect(stretches.map((s) => s.name)).toEqual(['Nordbach']);
		expect(stretches[0].length).toBeGreaterThan(4000);
	});

	it('ordnet den Abschnitt in Fahrtrichtung (Anfang näher am Start)', () => {
		const reversed = course('Nordbach', [...north.line].reverse());
		const [s] = findStretches([reversed], from, to, 14_000, direct, 3);
		expect(s.line[0][0]).toBeLessThan(s.line.at(-1)![0]);
	});

	it('kürzt zu lange Abschnitte auf höchstens 5 km', () => {
		const long = course('Langbach', [along(1000, 1200), along(7500, 1200)]);
		const [s] = findStretches([long], from, to, 14_000, direct, 3);
		expect(s.length).toBeLessThanOrEqual(5000 + 1);
	});

	it('ignoriert zu kurze Abschnitte', () => {
		const short = course('Kurzbach', [along(3000, 1200), along(3800, 1200)]);
		expect(findStretches([short], from, to, 14_000, direct, 3)).toEqual([]);
	});

	it('liefert Streifen entlang des Abschnitts', () => {
		const [s] = findStretches([north], from, to, 14_000, direct, 3);
		const rings = stretchCorridor(s);
		expect(rings.length).toBeGreaterThan(5);
		for (const ring of rings) expect(ring).toHaveLength(4);
	});
});

describe('parseStreams', () => {
	it('liest kodierte Polylinien', () => {
		const out = parseStreams({ lines: [['Test', '_p~iF~ps|U_ulLnnqC_mqNvxq`@']] });
		expect(out[0].name).toBe('Test');
		expect(out[0].line).toHaveLength(3);
	});
});
