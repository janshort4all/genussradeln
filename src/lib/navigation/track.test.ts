import { describe, expect, it } from 'vitest';
import { distance, offset, type LngLat } from '$lib/geo/geo';
import { RouteTrack } from './track';

const start: LngLat = [6.55, 51.35];
/** Hinweg 1 km nach Osten, Rückweg 1 km zurück: Start und Ende liegen am selben Punkt */
const out = Array.from({ length: 11 }, (_, i) => offset(start, 90, i * 100));
const back = [...out].reverse().map((p) => offset(p, 0, 15));
const track = new RouteTrack([{ coordinates: [...out, ...back].map(([lon, lat]) => [lon, lat, 30]) }]);

const length = (line: LngLat[]) => line.slice(1).reduce((sum, p, i) => sum + distance(line[i], p), 0);

describe('RouteTrack.segment', () => {
	it('liefert das Stück zwischen zwei Metermarken mit genauen Enden', () => {
		const piece = track.segment(250, 650);
		expect(length(piece)).toBeCloseTo(400, -1);
		expect(distance(piece[0], track.pointAt(250))).toBeLessThan(1);
		expect(distance(piece[piece.length - 1], track.pointAt(650))).toBeLessThan(1);
	});

	it('zeigt am Start nur das Stück vor einem – nicht den Rückweg, der wieder am Start endet', () => {
		const ahead = track.segment(0, 500);
		// Der Rückweg endet am Start; im Stück vor uns darf er nicht auftauchen
		const last = track.total;
		expect(ahead.some((p) => distance(p, track.pointAt(last)) < 60 && distance(p, start) < 60 && ahead.indexOf(p) > 0)).toBe(false);
		expect(length(ahead)).toBeCloseTo(500, -1);
	});

	it('schneidet an den Enden ab und liefert bei weniger als 1 m nichts', () => {
		expect(track.segment(-50, 100).length).toBeGreaterThan(1);
		expect(length(track.segment(track.total - 200, track.total + 500))).toBeCloseTo(200, -1);
		expect(track.segment(300, 300.5)).toEqual([]);
	});

	it('Teile hinter, vor und nach der Marke ergeben zusammen die ganze Strecke', () => {
		const total = length(track.segment(0, 700)) + length(track.segment(700, 1200)) + length(track.segment(1200, track.total));
		expect(total).toBeCloseTo(track.total, -1);
	});
});
