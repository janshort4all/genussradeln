import { describe, expect, it } from 'vitest';
import { openAt } from './hours';

// Samstag, 17. Oktober 2026
const at = (hh: number, mm = 0, day = 17) => new Date(2026, 9, day, hh, mm);

describe('openAt', () => {
	const bakery = 'Mo-Fr 06:00-18:00; Sa 06:00-13:00; Su off';

	it('geöffnet, geschlossen und bis wann', () => {
		expect(openAt(bakery, at(11))).toEqual({ state: 'open', closesAt: '13:00' });
		expect(openAt(bakery, at(14))).toEqual({ state: 'closed' });
		expect(openAt(bakery, at(5, 30))).toEqual({ state: 'closed', opensAt: '06:00' });
	});

	it('Sonntag aus, Montag auf', () => {
		expect(openAt(bakery, at(11, 0, 18)).state).toBe('closed');
		expect(openAt(bakery, at(11, 0, 19)).state).toBe('open');
	});

	it('mehrere Zeitspannen und Tagesliste', () => {
		const h = 'Tu-Su 11:30-14:30,17:00-22:00; Mo off';
		expect(openAt(h, at(12)).state).toBe('open');
		expect(openAt(h, at(15))).toEqual({ state: 'closed', opensAt: '17:00' });
		expect(openAt(h, at(12, 0, 19)).state).toBe('closed');
		expect(openAt('Mo,We,Sa 10:00-12:00', at(11)).state).toBe('open');
		expect(openAt('Mo,We,Sa 10:00-12:00', at(11, 0, 18)).state).toBe('closed');
	});

	it('ohne Wochentag gilt es täglich; 24/7', () => {
		expect(openAt('09:00-17:00', at(10)).state).toBe('open');
		expect(openAt('24/7', at(3)).state).toBe('open');
	});

	it('Wochenbereich über das Wochenende (Fr-Mo)', () => {
		expect(openAt('Fr-Mo 12:00-20:00', at(13)).state).toBe('open'); // Samstag
		expect(openAt('Fr-Mo 12:00-20:00', at(13, 0, 21)).state).toBe('closed'); // Dienstag
	});

	it('Unbekanntes bleibt unbekannt, nichts wird behauptet', () => {
		expect(openAt(undefined, at(12)).state).toBe('unknown');
		expect(openAt('Apr-Oct Mo-Su 10:00-18:00', at(12)).state).toBe('unknown');
		expect(openAt('sunrise-sunset', at(12)).state).toBe('unknown');
		expect(openAt('Mo-Fr 10:00+', at(12)).state).toBe('unknown');
	});
});
