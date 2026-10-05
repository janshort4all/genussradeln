import { describe, expect, it } from 'vitest';
import { rideMinutes } from './duration';

describe('rideMinutes', () => {
	it('rechnet flache Strecken mit der Reisegeschwindigkeit', () => {
		expect(rideMinutes(30_000, 0, 'easy')).toBe(120); // 30 km bei 15 km/h
	});

	it('gibt für Bergauf-Stücke Zeit dazu', () => {
		// 30 km mit 500 Höhenmetern: 120 Min. + 5 × 6 Min.
		expect(rideMinutes(30_000, 500, 'easy')).toBe(150);
	});
});
