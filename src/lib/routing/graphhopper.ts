/**
 * Anschluss an GraphHopper (Profil „genuss“). Im Testbetrieb läuft GraphHopper lokal auf dem PC.
 * Adresse änderbar über die Umgebungsvariable VITE_ROUTING_URL (z. B. für den späteren Server).
 * Beim Entwickeln geht die Anfrage über den Entwicklungsserver (/routing, siehe vite.config.ts) –
 * so funktioniert die Planung auch am Handy im selben WLAN.
 */
import type { LngLat } from '$lib/geo/geo';
import { GEMUETLICH_MODEL } from './custom-models';

export const ROUTING_URL: string =
	import.meta.env.VITE_ROUTING_URL ?? (import.meta.env.DEV ? '/routing' : 'http://localhost:8989');

export type Effort = 'easy' | 'sporty';

/** Abschnitts-Infos von GraphHopper: [von Punkt, bis Punkt, Wert] */
export type DetailInterval<T = string | number | null> = [number, number, T];

export interface RouteDetails {
	road_class: DetailInterval<string>[];
	bike_network: DetailInterval<string>[];
	surface: DetailInterval<string>[];
	smoothness: DetailInterval<string>[];
	street_name: DetailInterval<string | null>[];
	average_slope: DetailInterval<number>[];
	/** „bridge“, „ferry“, „tunnel“, „road“ … (fehlt bei älteren gespeicherten Touren) */
	road_environment?: DetailInterval<string>[];
}

/**
 * Abbiegehinweis (für die Navigation): an Punkt `index` der Koordinaten passiert `sign`.
 * sign laut GraphHopper: -3 scharf links, -2 links, -1 leicht links, 0 geradeaus, 1 leicht rechts, 2 rechts,
 * 3 scharf rechts, 4 Ziel, 5 Zwischenpunkt, 6 Kreisverkehr, -6 Kreisverkehr verlassen, ±7 links/rechts halten, ±8 wenden
 */
export interface RouteInstruction {
	index: number;
	sign: number;
	/** Straßenname, falls bekannt */
	street?: string;
	/** Kreisverkehr: Nummer der Ausfahrt */
	exit?: number;
}

export interface RoutePath {
	/** Meter */
	distance: number;
	/** Millisekunden laut GraphHopper (wir rechnen die Dauer selbst, siehe weights.ts) */
	time: number;
	ascend: number;
	descend: number;
	/** [lon, lat, Höhe] */
	coordinates: [number, number, number][];
	details: RouteDetails;
	/** Abbiegehinweise (fehlen bei älteren gespeicherten Touren) */
	instructions?: RouteInstruction[];
}

interface GraphHopperInstruction {
	sign: number;
	interval: [number, number];
	street_name?: string;
	exit_number?: number;
}

const DETAILS: (keyof RouteDetails)[] = [
	'road_class',
	'bike_network',
	'surface',
	'smoothness',
	'street_name',
	'average_slope',
	'road_environment'
];

/** GraphHopper ist nicht erreichbar (z. B. am Handy im Testbetrieb) */
export class RoutingUnavailableError extends Error {
	constructor() {
		super('Die Wegberechnung ist nicht erreichbar.');
	}
}

/** GraphHopper ist erreichbar, findet aber keinen Weg (z. B. Punkt außerhalb der Region) */
export class NoRouteError extends Error {}

export interface RouteOptions {
	effort: Effort;
	/** GraphHopper-Alternativen berechnen (nur bei genau 2 Punkten) */
	alternatives?: { maxPaths: number; maxWeightFactor: number; maxShareFactor: number };
	signal?: AbortSignal;
}

/** Berechnet einen Weg durch alle Punkte (bzw. mehrere Alternativen) mit dem Profil „genuss“ */
export async function route(points: LngLat[], options: RouteOptions): Promise<RoutePath[]> {
	const body: Record<string, unknown> = {
		profile: 'genuss',
		points,
		'ch.disable': true,
		elevation: true,
		points_encoded: false,
		instructions: true,
		locale: 'de',
		details: DETAILS,
		// keine Wenden an Zwischenpunkten
		pass_through: points.length > 2
	};
	if (options.effort === 'easy') body.custom_model = GEMUETLICH_MODEL;
	if (options.alternatives && points.length === 2) {
		body.algorithm = 'alternative_route';
		body['alternative_route.max_paths'] = options.alternatives.maxPaths;
		body['alternative_route.max_weight_factor'] = options.alternatives.maxWeightFactor;
		body['alternative_route.max_share_factor'] = options.alternatives.maxShareFactor;
	}

	let response: Response;
	try {
		response = await fetch(`${ROUTING_URL}/route`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: options.signal
		});
	} catch (error) {
		if ((error as Error).name === 'AbortError') throw error;
		throw new RoutingUnavailableError();
	}

	const result = await response.json().catch(() => ({}));
	if (!response.ok) {
		const message: string = result.message ?? '';
		if (response.status >= 500) throw new RoutingUnavailableError();
		throw new NoRouteError(message || `GraphHopper antwortet mit ${response.status}`);
	}
	return (result.paths ?? []).map(
		(p: {
			distance: number;
			time: number;
			ascend: number;
			descend: number;
			points: { coordinates: [number, number, number][] };
			details: RouteDetails;
			instructions?: GraphHopperInstruction[];
		}) => ({
			distance: p.distance,
			time: p.time,
			ascend: p.ascend,
			descend: p.descend,
			coordinates: p.points.coordinates,
			details: p.details,
			instructions: (p.instructions ?? []).map((i) => ({
				index: i.interval[0],
				sign: i.sign,
				...(i.street_name ? { street: i.street_name } : {}),
				...(i.exit_number ? { exit: i.exit_number } : {})
			}))
		})
	);
}
