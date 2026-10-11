import { describe, expect, it } from 'vitest';
import { RideRecorder, rideFileName, rideToGpx } from './recorder';
import type { NavView } from './guidance';

const view = (along: number, distance: number, speak: string[] = []): NavView =>
	({
		state: { along, started: true, offRoute: false, offCount: 0, finished: false, said: [] },
		distance,
		remaining: 1000,
		position: [6.6, 51.3],
		heading: 0,
		speak: speak.map((text) => ({ text, beep: false }))
	}) as NavView;

describe('RideRecorder', () => {
	it('hält jede Meldung mit der Anzeige der App fest und notiert Ansagen und Lücken', () => {
		const rec = new RideRecorder({ tourId: 'abc', title: 'Am Rhein entlang', meters: 12000 }, 1_000_000);
		rec.fix({ lngLat: [6.6, 51.3], accuracy: 8, time: 1_001_000, speed: 5.2, heading: 90 }, view(10, 200));
		rec.fix({ lngLat: [6.6005, 51.3], accuracy: 8, time: 1_002_000 }, view(60, 150, ['In 150 Metern links abbiegen.']));
		rec.fix({ lngLat: [6.602, 51.3], accuracy: 12, time: 1_020_000 }, view(200, 5));
		expect(rec.fixCount).toBe(3);
		const texts = rec.record.events.map((e) => e.text);
		expect(texts).toContain('Ansage: In 150 Metern links abbiegen.');
		expect(texts.some((t) => t.startsWith('Lücke: 18 s'))).toBe(true);
		expect(rec.record.samples[0]).toMatchObject({ along: 10, next: 200, spd: 5.2, hdg: 90 });
	});

	it('schreibt eine gültige GPX-Datei mit Spur, geplanter Strecke und Ereignissen', () => {
		const rec = new RideRecorder({ tourId: 't1', title: 'Rhein & Wald', meters: 5000, planned: [[6.6, 51.3], [6.61, 51.31]] }, 1_000_000);
		rec.fix({ lngLat: [6.6, 51.3], accuracy: 8, time: 1_001_000 }, view(0, 100));
		rec.event('Pause', 1_002_000);
		rec.finish(1_003_000);
		const gpx = rideToGpx(rec.record);
		expect(gpx).toContain('<trkpt lat="51.300000" lon="6.600000"><time>');
		expect(gpx).toContain('<gr:along>0</gr:along>');
		expect(gpx).toContain('Rhein &amp; Wald');
		expect(gpx).toContain('<name>Pause</name>');
		expect(gpx.match(/<trk>/g)).toHaveLength(2);
		expect(rideFileName(rec.record)).toMatch(/^Fahrt \d{4}-\d{2}-\d{2} \d{2}-\d{2} Rhein & Wald\.gpx$/);
	});
});
