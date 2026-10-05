import { describe, expect, it } from 'vitest';
import { offset, type LngLat } from '$lib/geo/geo';
import { guide, initialNavState, type NavState } from './guidance';
import { RouteTrack } from './track';
import { actionText, distanceText, spokenDistance } from './wording';

// Strecke: 1 km nach Osten, dann links (Norden) 1 km bis zum Ziel
const start: LngLat = [6.6, 51.33];
const corner = offset(start, 90, 1000);
const end = offset(corner, 0, 1000);
const along = (m: number): LngLat => (m <= 1000 ? offset(start, 90, m) : offset(corner, 0, m - 1000));

const track = new RouteTrack([
	{
		coordinates: [start, offset(start, 90, 500), corner, offset(corner, 0, 500), end],
		instructions: [
			{ index: 0, sign: 0, street: 'Rheinstraße' },
			{ index: 2, sign: -2, street: 'Uerdinger Straße' },
			{ index: 4, sign: 4 }
		]
	}
]);

/** Fährt die Positionen ab und sammelt alle Ansagen */
function ride(positions: LngLat[]): { state: NavState; spoken: string[] } {
	let state = initialNavState();
	const spoken: string[] = [];
	for (const p of positions) {
		const view = guide(track, state, { lngLat: p, accuracy: 5 }, 'Kempen');
		state = view.state;
		spoken.push(...view.speak.map((s) => s.text));
	}
	return { state, spoken };
}

describe('RouteTrack', () => {
	it('kennt Länge, Abzweigungen und die Position auf der Strecke', () => {
		expect(track.total).toBeCloseTo(2000, -1);
		expect(track.maneuvers.map((m) => m.sign)).toEqual([-2, 4]); // „Straßenverlauf folgen“ zählt nicht
		const loc = track.locate(offset(along(300), 0, 15))!;
		expect(loc.along).toBeCloseTo(300, -1);
		expect(loc.offset).toBeCloseTo(15, 0);
	});

	it('hängt Hin- und Rückweg aneinander', () => {
		const back = new RouteTrack([
			{ coordinates: [start, corner], instructions: [{ index: 1, sign: 4 }] },
			{ coordinates: [corner, start], instructions: [{ index: 1, sign: 4 }] }
		]);
		expect(back.total).toBeCloseTo(2000, -1);
		expect(back.maneuvers.map((m) => [m.sign, m.leg])).toEqual([
			[4, 0],
			[4, 1]
		]);
	});
});

describe('guide', () => {
	it('sagt Abzweigungen vorher und im richtigen Moment an, dann das Ziel', () => {
		const positions = Array.from({ length: 201 }, (_, i) => along(i * 10));
		const { state, spoken } = ride(positions);
		expect(spoken[0]).toBe('Los geht’s. Gute Fahrt!');
		expect(spoken).toContain('In 150 Metern links abbiegen, Uerdinger Straße.');
		expect(spoken).toContain('Jetzt links abbiegen.');
		expect(spoken).toContain('Sie sind am Ziel. Schöne Pause!');
		// jede Ansage nur einmal
		expect(new Set(spoken).size).toBe(spoken.length);
		expect(state.finished).toBe(true);
	});

	it('merkt, wenn man die Strecke verlässt, und wenn man zurück ist', () => {
		const away = offset(along(400), 180, 120); // 120 m südlich der Strecke
		const { spoken } = ride([along(300), along(350), away, away, along(420)]);
		expect(spoken.filter((t) => t.startsWith('Sie haben die Strecke verlassen'))).toHaveLength(1);
		expect(spoken).toContain('Wieder auf der Strecke.');
	});

	it('zeigt neben der Strecke die Richtung zurück', () => {
		let state = initialNavState();
		state = guide(track, state, { lngLat: along(300) }).state;
		const away = offset(along(400), 180, 120);
		state = guide(track, state, { lngLat: away }).state;
		const view = guide(track, state, { lngLat: away });
		expect(view.offRoute).toBeDefined();
		expect(view.offRoute!.meters).toBeGreaterThan(100);
		expect(Math.abs(view.offRoute!.bearing - 0)).toBeLessThan(10); // zurück nach Norden
	});
});

describe('wording', () => {
	it('spricht und schreibt verständlich', () => {
		expect(actionText({ sign: 6, exit: 2 })).toBe('im Kreisverkehr die 2. Ausfahrt nehmen');
		expect(distanceText(287)).toBe('300 m');
		expect(distanceText(12)).toBe('jetzt');
		expect(distanceText(1240)).toBe('1,2 km');
		expect(spokenDistance(148)).toBe('In 150 Metern');
		expect(spokenDistance(2500)).toBe('In 2,5 Kilometern');
	});
});
