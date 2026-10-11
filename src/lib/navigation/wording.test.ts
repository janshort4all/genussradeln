import { describe, expect, it } from 'vitest';
import type { Maneuver } from './track';
import { repeatAnnouncement } from './wording';

const left: Maneuver = { at: 1000, sign: -2, street: 'Uerdinger Straße', leg: 0 };
const goal: Maneuver = { at: 2000, sign: 4, leg: 0 };

describe('repeatAnnouncement („Nochmal“)', () => {
	it('sagt die nächste Abzweigung mit der Entfernung von jetzt', () => {
		const text = repeatAnnouncement({ maneuver: left, distance: 140 }, false);
		expect(text).toContain('In 150 Metern');
		expect(text).toContain('Uerdinger Straße');
	});

	it('sagt „Jetzt …“, wenn die Abzweigung direkt da ist', () => {
		expect(repeatAnnouncement({ maneuver: left, distance: 10 }, false)).toMatch(/^Jetzt /);
	});

	it('nennt eine gleich folgende Abzweigung', () => {
		const right: Maneuver = { at: 1060, sign: 2, leg: 0 };
		expect(repeatAnnouncement({ maneuver: left, distance: 200, then: right }, false)).toContain('gleich danach');
	});

	it('sagt neben der Strecke, wie weit es zurück ist', () => {
		const text = repeatAnnouncement({ offRoute: { meters: 83 } }, false);
		expect(text).toContain('80 Meter');
		expect(text).toContain('zurück zur Strecke');
	});

	it('sagt am Ziel, dass man am Ziel ist', () => {
		expect(repeatAnnouncement({ maneuver: goal, distance: 300 }, true)).toContain('am Ziel');
	});

	it('bleibt ruhig, solange es keinen Standort gibt', () => {
		expect(repeatAnnouncement(undefined, false)).toContain('Standort');
	});
});
