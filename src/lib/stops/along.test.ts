import { describe, expect, it } from 'vitest';
import { offset, type LngLat } from '$lib/geo/geo';
import { NONE, WATER } from '$lib/scoring/landscape';
import { makeLandscape } from '$lib/scoring/test-helpers';
import { stopsAlongRoute } from './along';
import { FLAG, STOP_KINDS, type StopKind } from './kinds';
import { parsePois, PoiIndex, type Poi } from './pois';

const start: LngLat = [6.6, 51.35];
const end = offset(start, 90, 10_000); // 10 km nach Osten
const route: LngLat[] = [start, end];

/** Stopp bei `km` entlang des Wegs, `side` Meter nördlich daneben */
function poi(kind: StopKind, km: number, side = 20, flags = 0, name?: string): Poi {
	const lngLat = offset(offset(start, 90, km * 1000), 0, side);
	return { id: `${kind}-${km}-${side}`, lngLat, kind, flags, name };
}

describe('parsePois', () => {
	it('liest das kompakte Format', () => {
		const [p] = parsePois({ kinds: [...STOP_KINDS], items: [[660000, 5135000, 2, FLAG.outdoor, 'Biergarten am See']] });
		expect(p.kind).toBe('biergarten');
		expect(p.lngLat).toEqual([6.6, 51.35]);
		expect(p.name).toBe('Biergarten am See');
	});
});

describe('stopsAlongRoute', () => {
	it('findet Stopps am Weg mit Kilometer-Angabe, entfernte nicht', () => {
		const index = new PoiIndex([
			poi('cafe', 4, 50, 0, 'Café Mühle'),
			poi('cafe', 6, 500, 0, 'Café Weitweg'), // 500 m neben dem Weg
			poi('toilette', 7, 30)
		]);
		const stops = stopsAlongRoute(route, index);
		expect(stops.map((s) => s.name ?? s.kind)).toEqual(['Café Mühle', 'toilette']);
		expect(stops[0].km).toBeCloseTo(4, 1);
	});

	it('lässt Stopps direkt am Start weg', () => {
		const index = new PoiIndex([poi('toilette', 0.1, 20), poi('toilette', 5, 20)]);
		expect(stopsAlongRoute(route, index).map((s) => s.km)).toEqual([5]);
	});

	it('dünnt Bänke aus: höchstens eine je 3 km, die mit Lehne gewinnt', () => {
		const index = new PoiIndex([
			poi('bank', 1, 10),
			poi('bank', 1.5, 10, FLAG.backrest),
			poi('bank', 2, 10),
			poi('bank', 4, 10)
		]);
		const benches = stopsAlongRoute(route, index).filter((s) => s.kind === 'bank');
		expect(benches).toHaveLength(2);
		expect(benches[0].km).toBeCloseTo(1.5, 1);
		expect(benches[0].reasons).toContain('mit Lehne');
	});

	it('bevorzugt Cafés mit Terrasse am Wasser und nennt die Gründe', () => {
		// Wasser direkt nördlich des Wegs bei km 2 (Spalte ≈ 85, Zeile ≈ 54)
		const landscape = makeLandscape((row, col) => (row >= 52 && row <= 54 && col >= 80 && col <= 90 ? WATER : NONE));
		const index = new PoiIndex([
			poi('cafe', 1.2, 30, 0, 'Café Straße'),
			poi('cafe', 1.8, 80, FLAG.outdoor, 'Café am Wasser')
		]);
		const stops = stopsAlongRoute(route, index, landscape);
		// beide liegen im selben 2-km-Abschnitt → nur das bessere bleibt
		expect(stops).toHaveLength(1);
		expect(stops[0].name).toBe('Café am Wasser');
		expect(stops[0].reasons).toEqual(['mit Plätzen draußen', 'am Wasser']);
	});
});
