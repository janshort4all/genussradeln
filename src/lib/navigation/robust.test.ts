import { describe, expect, it } from 'vitest';
import { offset, type LngLat } from '$lib/geo/geo';
import { guide, initialNavState, type NavState } from './guidance';
import { RouteTrack } from './track';

/**
 * Fälle aus dem ersten Test (Schwiegereltern, 13.10.2026): „Noch 200 m“, im nächsten Moment war die Abzweigung vorbei.
 * Strecke: 3 km nach Osten, links 1 km nach Norden, dann auf derselben Straße zurück bis zum Start (wie eine Tour,
 * deren Anfang und Ende auf demselben Weg liegen) – dazu jeweils eine Abzweigung.
 */
const start: LngLat = [6.6, 51.33];
const corner = offset(start, 90, 3000);
const top = offset(corner, 0, 1000);
const back = offset(start, 0, 1000);
const track = new RouteTrack([
	{
		coordinates: [start, offset(start, 90, 1500), corner, offset(corner, 0, 500), top, offset(top, 270, 1500), offset(top, 270, 3000)],
		instructions: [
			{ index: 0, sign: 0 },
			{ index: 2, sign: -2, street: 'Nordweg' },
			{ index: 4, sign: -2 },
			{ index: 6, sign: 4 }
		]
	}
]);
void back;

const on = (meters: number): LngLat => track.pointAt(meters);
const fix = (p: LngLat, time: number, accuracy = 8) => ({ lngLat: p, accuracy, time });

function stateAt(meters: number): NavState {
	let state = initialNavState();
	for (let m = 0; m <= meters; m += 6) state = guide(track, state, fix(on(m), 1_000_000 + (m / 6) * 1000)).state;
	return state;
}

describe('Positionsbestimmung bei unsauberem GPS', () => {
	it('benutzt eine Meldung mit sehr schlechter Genauigkeit nicht für die Position', () => {
		const state = stateAt(2700);
		// Ortung über Funkzellen: 300 m daneben, aber „genau“ gemeldet mit 400 m Ungenauigkeit
		const view = guide(track, state, fix(offset(on(2706), 0, 300), 1_000_000 + 451_000, 400));
		expect(view.weak).toBe(true);
		expect(view.state.along).toBeCloseTo(state.along, 0);
		expect(view.state.offRoute).toBe(false);
		expect(view.state.offCount).toBe(0);
		// Die Abzweigung kommt weiter in 300 m, nicht plötzlich ganz woanders
		expect(view.distance).toBeGreaterThan(250);
	});

	it('springt nicht in einer Sekunde 100 m vorwärts und überspringt dabei keine Abzweigung', () => {
		const state = stateAt(2700);
		// Ein Ausreißer 100 m voraus (hinter der Ecke bei 3000 m, auf dem Weg nach Norden)
		const view = guide(track, state, { lngLat: offset(corner, 0, 60), accuracy: 8, time: state.time! + 1000 });
		expect(view.state.along).toBeLessThan(state.along + 80);
		expect(view.maneuver?.at).toBeGreaterThan(2999);
	});

	it('findet nach einer Funkloch-Pause von 15 Sekunden wieder an die Strecke zurück', () => {
		const state = stateAt(2700);
		const view = guide(track, state, fix(on(2820), state.time! + 15_000));
		expect(view.state.along).toBeGreaterThan(2800);
		expect(view.state.offRoute).toBe(false);
	});

	it('sagt die Abzweigung nach einer langen Geraden an', () => {
		let state = stateAt(3700);
		const spoken: string[] = [];
		for (let m = 3706; m <= 4300; m += 6) {
			const view = guide(track, state, fix(on(m), 1_000_000 + (m / 6) * 1000));
			state = view.state;
			spoken.push(...view.speak.map((s) => s.text));
		}
		expect(state.along).toBeGreaterThan(4200);
		expect(spoken.some((t) => t.startsWith('Jetzt links abbiegen'))).toBe(true);
	});

	it('schließt nach einer Abkürzung an der ersten passenden Stelle wieder an, nicht an einer späteren auf derselben Straße', () => {
		const loop = new RouteTrack([
			{
				// Hin 2 km nach Osten, 1 km nach Norden, 2 km nach Westen, 1 km zurück nach Süden: Anfang und Ende liegen nah beieinander
				coordinates: [
					start,
					offset(start, 90, 2000),
					offset(offset(start, 90, 2000), 0, 1000),
					offset(start, 0, 1000),
					offset(start, 0, 20)
				],
				instructions: [
					{ index: 0, sign: 0 },
					{ index: 1, sign: -2 },
					{ index: 2, sign: -2 },
					{ index: 3, sign: -2 },
					{ index: 4, sign: 4 }
				]
			}
		]);
		let state = initialNavState();
		for (let m = 0; m <= 800; m += 6) state = guide(loop, state, { lngLat: loop.pointAt(m), accuracy: 8, time: m * 100 }).state;
		// zweimal weit neben der Strecke (500 m südlich), dann wieder auf der Straße bei 1200 m Hinweg
		for (const m of [850, 900]) state = guide(loop, state, { lngLat: offset(loop.pointAt(m), 180, 500), accuracy: 8, time: m * 100 }).state;
		state = guide(loop, state, { lngLat: loop.pointAt(1200), accuracy: 8, time: 120_000 }).state;
		expect(state.along).toBeGreaterThan(1100);
		expect(state.along).toBeLessThan(1300);
	});
});
