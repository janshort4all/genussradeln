/**
 * Daten und Rechnung für die Wegplanung an einer Stelle – von der Planung im Hintergrund (plan.worker.ts) und vom Notweg
 * auf der Hauptseite (planner.ts) gemeinsam benutzt.
 */
import { loadNames } from '$lib/naming/names';
import { loadLandscape } from '$lib/scoring/landscape';
import { loadFineMap } from '$lib/scoring/fine';
import { loadRoadMask } from '$lib/scoring/roads';
import type { PlannedTour, TourRequest } from '$lib/tour/model';
import { NoRouteError, route, RoutingUnavailableError } from './graphhopper';
import { planTours, TooCloseError, type PlanDeps } from './plan';
import { planRound } from './round';
import { loadStreams } from './streams';

/** Adressen der Datendateien (die Hauptseite kennt den Unterpfad der App, der Hintergrundprozess nicht) */
export interface DataUrls {
	landscape: [meta: string, image: string];
	names: [landmarks: string, places: string];
	roads: [meta: string, bin: string];
	fine: [meta: string, bin: string];
	streams: string;
}

export type PlanFailure = 'unavailable' | 'noroute' | 'tooclose' | 'error';

/** Alle Daten laden – ohne sie geht die Planung auch, nur weniger schön benannt */
export async function loadPlanDeps(urls: DataUrls): Promise<PlanDeps> {
	const [landscape, names, roads, fine, streams] = await Promise.all([
		loadLandscape(...urls.landscape).catch((error) => (console.warn('Landschaftskarte nicht verfügbar:', error), undefined)),
		loadNames(...urls.names).catch((error) => (console.warn('Namensdaten nicht verfügbar:', error), undefined)),
		loadRoadMask(...urls.roads).catch((error) => (console.warn('Straßenkarte nicht verfügbar:', error), undefined)),
		loadFineMap(...urls.fine).catch((error) => (console.warn('Feine Karte nicht verfügbar:', error), undefined)),
		loadStreams(urls.streams).catch((error) => (console.warn('Gewässerdaten nicht verfügbar:', error), undefined))
	]);
	return { route, landscape, names, roads, fine, streams };
}

export async function planWithData(request: TourRequest, urls: DataUrls): Promise<PlannedTour[]> {
	const deps = await loadPlanDeps(urls);
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
