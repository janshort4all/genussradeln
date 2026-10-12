/**
 * Daten und Rechnung für die Wegplanung an einer Stelle – von der Planung im Hintergrund (plan.worker.ts) und vom Notweg
 * auf der Hauptseite (planner.ts) gemeinsam benutzt.
 */
import { planningArea } from '$lib/data/area';
import { tileStore } from '$lib/data/tiles';
import type { PlannedTour, TourRequest } from '$lib/tour/model';
import { NoRouteError, route, RoutingUnavailableError } from './graphhopper';
import { planTours, TooCloseError, type PlanDeps } from './plan';
import { planRound } from './round';

/** Adresse der Kartenkacheln (die Hauptseite kennt den Unterpfad der App, der Hintergrundprozess nicht) */
export interface DataUrls {
	tiles: string;
}

export type PlanFailure = 'unavailable' | 'noroute' | 'tooclose' | 'error';

/** Karten für das Gebiet des Wunsches laden – ohne sie geht die Planung auch, nur weniger schön bewertet und benannt */
export async function loadPlanDeps(urls: DataUrls, request: TourRequest): Promise<PlanDeps> {
	const area = await tileStore(urls.tiles)
		.area(planningArea(request))
		.catch((error) => (console.warn('Kartendaten nicht verfügbar:', error), undefined));
	return { route, landscape: area?.landscape, names: area?.names, roads: area?.roads, fine: area?.fine, streams: area?.streams };
}

export async function planWithData(request: TourRequest, urls: DataUrls): Promise<PlannedTour[]> {
	const deps = await loadPlanDeps(urls, request);
	return request.round ? planRound(request, deps) : planTours(request, deps);
}

/** Fehler in eine Art übersetzen, die sich zwischen Hintergrundprozess und Seite verschicken lässt */
export function failureOf(error: unknown): PlanFailure {
	if (error instanceof RoutingUnavailableError) return 'unavailable';
	if (error instanceof TooCloseError) return 'tooclose';
	if (error instanceof NoRouteError) return 'noroute';
	return 'error';
}

export function errorFor(kind: PlanFailure, message: string): Error {
	if (kind === 'unavailable') return new RoutingUnavailableError();
	if (kind === 'tooclose') return new TooCloseError(message);
	if (kind === 'noroute') return new NoRouteError(message);
	return new Error(message);
}
