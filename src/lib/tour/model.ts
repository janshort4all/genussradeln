/**
 * Tour-Modell: Eine Tour ist eine Liste von Wegpunkten (Start, Zwischenpunkte, Ziel …) plus der berechnete Weg.
 * Anpassungen (ab M4) ändern nur die Wegpunkte und berechnen den Weg neu.
 */
import type { LngLat } from '$lib/geo/geo';
import type { Effort, RouteDetails, RouteInstruction, RoutePath } from '$lib/routing/graphhopper';
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
	/** bei einer Rundtour derselbe Ort wie der Start */
	destination: Place;
	effort: Effort;
	returnMode: ReturnMode;
	/** Rundtour („Einfach eine schöne Runde drehen“): gewünschte Länge und Zufallswert (neue Suche → neue Runden) */
	round?: { km: number; seed: number };
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
	/** Brücken und Tunnel: Wegstücke [von, bis) (Index wie `coordinates`) */
	bridges?: [number, number][];
	/**
	 * Beschaffenheit je Abschnitt (Straßenklasse, Tempo, Belag …) – damit sich einzelne Abschnitte bewerten lassen
	 * (schönere Umwege vorschlagen). Fehlt bei älteren gespeicherten Touren und alten Links.
	 */
	details?: Partial<RouteDetails>;
}

/** Was von einem berechneten Weg in der Tour bleibt */
export function legFromPath(path: RoutePath): TourLeg {
	const { road_class, bike_network, surface, smoothness, max_speed } = path.details;
	return {
		coordinates: path.coordinates,
		distance: path.distance,
		instructions: path.instructions,
		bridges: (path.details.road_environment ?? [])
			.filter(([, , v]) => v === 'bridge' || v === 'tunnel')
			.map(([from, to]) => [from, to] as [number, number]),
		details: { road_class, bike_network, surface, smoothness, max_speed }
	};
}

/** Der Weg einer Teilstrecke als RoutePath (für die Bewertung); fehlende Angaben bleiben leer */
export function pathOfLeg(leg: TourLeg): RoutePath {
	return {
		distance: leg.distance,
		time: 0,
		ascend: 0,
		descend: 0,
		coordinates: leg.coordinates,
		instructions: leg.instructions,
		details: {
			road_class: [],
			bike_network: [],
			surface: [],
			smoothness: [],
			street_name: [],
			average_slope: [],
			road_environment: (leg.bridges ?? []).map(([from, to]) => [from, to, 'bridge'] as [number, number, string]),
			...leg.details
		}
	};
}

export interface PlannedTour {
	id: string;
	/** z. B. „Am Wasser entlang“ */
	title: string;
	/** nach der Länge, z. B. „Längste Tour“ */
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
	/** aus „Meine Touren“ geöffnet (wird beim Laden gesetzt, nicht mitgespeichert) */
	saved?: boolean;
	/** Hinweis zur Tour, z. B. „Kartendaten wurden seit dem Teilen erneuert“ */
	note?: string;
}

export function tourLine(tour: PlannedTour): LngLat[] {
	return tour.legs.flatMap((leg) => leg.coordinates.map(([lon, lat]) => [lon, lat] as LngLat));
}

export function newTourId(): string {
	return Math.random().toString(36).slice(2, 10);
}
