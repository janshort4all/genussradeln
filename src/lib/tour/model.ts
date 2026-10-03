/**
 * Tour-Modell: Eine Tour ist eine Liste von Wegpunkten (Start, Zwischenpunkte, Ziel …) plus der berechnete Weg.
 * Anpassungen (ab M4) ändern nur die Wegpunkte und berechnen den Weg neu.
 */
import type { LngLat } from '$lib/geo/geo';
import type { Effort } from '$lib/routing/graphhopper';
import type { RouteStats } from '$lib/scoring/score';
import type { DetourLevel } from '$lib/scoring/weights';

/** Ein Ort, z. B. aus der Suche oder der eigene Standort */
export interface Place {
	name: string;
	/** Zusatz zur Unterscheidung, z. B. „Krefeld-Linn“ */
	detail?: string;
	lngLat: LngLat;
}

export type ReturnMode = 'one-way' | 'other-way';

/** Wunsch für eine Zieltour */
export interface TourRequest {
	start: Place;
	destination: Place;
	detour: DetourLevel;
	effort: Effort;
	returnMode: ReturnMode;
}

export interface Waypoint {
	lngLat: LngLat;
	kind: 'start' | 'via' | 'destination';
	name?: string;
}

export interface TourLeg {
	/** [lon, lat, Höhe] */
	coordinates: [number, number, number][];
	/** Meter */
	distance: number;
}

export interface PlannedTour {
	id: string;
	/** z. B. „Am Wasser entlang“ */
	title: string;
	/** z. B. „Am schönsten“ */
	label?: string;
	/** ein Satz zum Besonderen */
	highlight: string;
	request: TourRequest;
	waypoints: Waypoint[];
	legs: TourLeg[];
	stats: RouteStats;
	/** Mehrweg gegenüber dem direkten genuss-Weg in Metern (Hin- und ggf. Rückweg) */
	extraDistance: number;
	/** geschätzte Fahrzeit in Minuten */
	minutes: number;
}

export function tourLine(tour: PlannedTour): LngLat[] {
	return tour.legs.flatMap((leg) => leg.coordinates.map(([lon, lat]) => [lon, lat] as LngLat));
}

export function newTourId(): string {
	return Math.random().toString(36).slice(2, 10);
}
