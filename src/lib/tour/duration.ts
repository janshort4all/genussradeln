/**
 * Fahrzeit: Strecke durch Reisegeschwindigkeit plus Zuschlag für Bergauf-Stücke –
 * damit die Zeit im Flachland wie im Hügelland stimmt.
 */
import type { Effort } from '$lib/routing/graphhopper';
import { CLIMB_MINUTES_PER_100M, SPEED_KMH } from '$lib/scoring/weights';

export function rideMinutes(distanceM: number, ascentM: number, effort: Effort): number {
	const flat = (distanceM / 1000 / SPEED_KMH[effort]) * 60;
	const climb = (Math.max(0, ascentM) / 100) * CLIMB_MINUTES_PER_100M[effort];
	return Math.round(flat + climb);
}
