import { describe, expect, it } from 'vitest';
import { offset, type LngLat } from '$lib/geo/geo';
import { foodGapNote, pauseStops, rideStart, stopsAlongRoute, toiletSentence } from './along';
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
		// „am Wasser“ kommt aus der Stopp-Datei (genaue Lage, von scripts/fetch-pois.ts bestimmt)
		const index = new PoiIndex([
			poi('cafe', 1.2, 30, 0, 'Café Straße'),
			poi('cafe', 1.8, 80, FLAG.outdoor | FLAG.waterside, 'Café am Wasser')
		]);
		const stops = stopsAlongRoute(route, index);
		// beide liegen im selben 2-km-Abschnitt → nur das bessere bleibt
		expect(stops).toHaveLength(1);
		expect(stops[0].name).toBe('Café am Wasser');
		expect(stops[0].reasons).toEqual(['mit Plätzen draußen', 'am Wasser']);
	});
});

describe('toiletSentence', () => {
	const stop = (kind: StopKind, km: number, score = 1) => ({ kind, km, score });

	it('fasst Toiletten in einem Satz zusammen', () => {
		expect(toiletSentence([stop('toilette', 3.4), stop('cafe', 5), stop('toilette', 23.8)])).toBe(
			'Toiletten gibt es nach 3 und nach 24 km.'
		);
		expect(toiletSentence([stop('toilette', 7.2)])).toBe('Eine Toilette gibt es nach 7 km.');
		expect(toiletSentence([stop('cafe', 5)])).toBeUndefined();
	});
});

describe('foodGapNote', () => {
	it('weist auf lange Strecken ohne Einkehr hin', () => {
		expect(foodGapNote([{ km: 3.4, kind: 'biergarten' }, { km: 11.3, kind: 'cafe' }, { km: 19.5, kind: 'cafe' }, { km: 23.3, kind: 'cafe' }], 42.1)).toBe(
			'Auf den letzten 19 km keine Einkehrmöglichkeit.'
		);
		expect(foodGapNote([{ km: 14, kind: 'cafe' }, { km: 20, kind: 'cafe' }], 25)).toBe(
			'Auf den ersten 14 km keine Einkehrmöglichkeit.'
		);
		expect(foodGapNote([{ km: 3, kind: 'cafe' }, { km: 18, kind: 'eis' }, { km: 22, kind: 'cafe' }], 25)).toBe(
			'Zwischen km 3 und km 18 keine Einkehrmöglichkeit.'
		);
		expect(foodGapNote([{ km: 8, kind: 'cafe' }, { km: 16, kind: 'eis' }], 24)).toBeUndefined();
		expect(foodGapNote([{ km: 5, kind: 'toilette' }], 30)).toMatch(/keine Einkehr/);
	});
});

describe('pauseStops', () => {
	// Samstag, 17.10.2026, 11 Uhr: Fahrt beginnt jetzt, Ankunft nach km/15 Stunden
	const now = new Date(2026, 9, 17, 11, 0);
	const stop = (kind: StopKind, km: number, score = 1, hours?: string, off = 0) => ({ kind, km, score, hours, off });

	it('kehrt nicht nach 2–3 km ein, sondern bei etwa der Hälfte', () => {
		const stops = [stop('cafe', 2.5, 5), stop('biergarten', 4, 5), stop('restaurant', 9.5, 2), stop('cafe', 18, 2)];
		// 20 km: Hauptpause um km 10; km 2,5 und 4 liegen im ersten Fünftel
		const picked = pauseStops(stops, 20, now);
		expect(picked.map((s) => s.km)).toContain(9.5);
		expect(picked.some((s) => s.km < 4)).toBe(false);
	});

	it('Hauptpause: Restaurant oder Biergarten gehen vor, auch bei weniger Punkten', () => {
		const stops = [stop('cafe', 24, 3), stop('biergarten', 26, 1.2), stop('baeckerei', 25, 3)];
		expect(pauseStops(stops, 50, now).find((s) => s.km >= 24 && s.km <= 26)?.kind).toBe('biergarten');
	});

	it('lange Tour: Hauptpause in der Mitte, kleine am Nachmittag, Mindestabstand', () => {
		const stops = [
			stop('restaurant', 24.5, 2),
			stop('biergarten', 25.5, 2.5),
			stop('eis', 36, 1),
			stop('cafe', 38, 1.5),
			stop('cafe', 14, 1)
		];
		const picked = pauseStops(stops, 50, now);
		expect(picked).toHaveLength(2);
		expect(picked.map((s) => s.km)).toEqual([25.5, 38]); // Biergarten bei der Hälfte, Café am Nachmittag (km 38 ≈ 76 %)
	});

	it('kurze Tour: nur eine Pause; im letzten Zehntel nichts', () => {
		const stops = [stop('cafe', 5, 2), stop('restaurant', 9.5, 2), stop('eis', 18.5, 3)];
		const picked = pauseStops(stops, 19, now);
		expect(picked).toHaveLength(1);
		expect(picked[0].km).toBe(9.5);
	});

	it('geschlossene Orte fallen weg, geöffnete zählen mehr, Zeit steht dabei', () => {
		const stops = [
			stop('restaurant', 9.5, 3, 'Mo-Fr 11:00-22:00; Sa,Su off'), // Samstag geschlossen
			stop('biergarten', 10.5, 1, 'Mo-Su 11:00-23:00')
		];
		const picked = pauseStops(stops, 20, now);
		expect(picked.map((s) => s.km)).toEqual([10.5]);
		expect(picked[0].note).toBe('geöffnet bis 23:00 Uhr');
	});

	it('erweitert das Fenster, wenn dort nichts liegt, und meldet sonst nichts', () => {
		const farther = [stop('restaurant', 7, 2)]; // 35 % einer 20-km-Tour: außerhalb ±12 %, innerhalb des erweiterten Fensters
		expect(pauseStops(farther, 20, now).map((s) => s.km)).toEqual([7]);
		expect(pauseStops([stop('cafe', 1, 2)], 20, now)).toEqual([]);
	});

	it('Fahrtbeginn: tagsüber jetzt, abends am nächsten Morgen um 10 Uhr', () => {
		expect(rideStart(new Date(2026, 9, 17, 13, 5)).getHours()).toBe(13);
		const evening = rideStart(new Date(2026, 9, 17, 21, 0));
		expect([evening.getDate(), evening.getHours()]).toEqual([18, 10]);
		expect(rideStart(new Date(2026, 9, 17, 6, 0)).getHours()).toBe(10);
	});
});
