/**
 * Tour-Modell: Eine Tour ist eine Liste von Wegpunkten (Start, Zwischenpunkte, Ziel …) plus der berechnete Weg.
 * Anpassungen (ab M4) ändern nur die Wegpunkte und berechnen den Weg neu.
 */
import type { LngLat } from '$lib/geo/geo';
import type { Effort, RouteInstruction } from '$lib/routing/graphhopper';
import type { RouteStats } from '$lib/scoring/score';

/** Ein Ort, z. B. aus der Suche oder der eigene Standort */
export interface Place {
	name: string;
	/** Zusatz zur Unterscheidung, z. B. „Krefeld-Linn“ */
	detail?: string;
	lngLat: LngLat;
	/** Stadt, Dorf oder Ortsteil – dann heißt es „nach Kempen“, sonst „bis Burg Linn“ */
	settlement?: boolean;
}

export type ReturnMode = 'one-way' | 'other-way';

/** Wunsch für eine Zieltour */
export interface TourRequest {
	start: Place;
	destination: Place;
	effort: Effort;
	returnMode: ReturnMode;
}

/**
 * Arten von Wegpunkten:
 * - `via`:  automatischer Hilfspunkt der App (z. B. schöner Ort für einen Umweg). Für den Nutzer unsichtbar;
 *           führt er zu einem „Stummel“ (hin und zurück in eine Sackgasse), wird der Weg verworfen.
 * - `stop`: vom Nutzer gewählter Halt (Biergarten, Café …). Bleibt immer drin – ein nötiger Abstecher
 *           (hin und zurück auf demselben Weg) wird in Kauf genommen und offen angezeigt.
 */
export interface Waypoint {
	lngLat: LngLat;
	kind: 'start' | 'via' | 'stop' | 'destination';
	name?: string;
}

export interface TourLeg {
	/** [lon, lat, Höhe] */
	coordinates: [number, number, number][];
	/** Meter */
	distance: number;
	/** Abbiegehinweise für die Navigation (Index bezieht sich auf `coordinates`) */
	instructions?: RouteInstruction[];
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
	/** über einen Link geöffnet (nicht hier geplant) */
	shared?: boolean;
	/** Hinweis zur Tour, z. B. „Kartendaten wurden seit dem Teilen erneuert“ */
	note?: string;
}

export function tourLine(tour: PlannedTour): LngLat[] {
	return tour.legs.flatMap((leg) => leg.coordinates.map(([lon, lat]) => [lon, lat] as LngLat));
}

export function newTourId(): string {
	return Math.random().toString(36).slice(2, 10);
}
