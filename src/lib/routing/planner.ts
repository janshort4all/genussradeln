/**
 * Wegplanung für die Seiten: rechnet im Hintergrund (plan.worker.ts), damit die Seite flüssig bleibt, und merkt sich
 * Ergebnisse für gleiche Wünsche (zweites Mal sofort da). Kann der Browser keinen Hintergrundprozess, rechnet die Seite selbst.
 */
import type { PlannedTour, TourRequest } from '$lib/tour/model';
import { errorFor, planWithData, type DataUrls } from './plan-deps';
import type { WorkerReply, WorkerRequest } from './plan.worker';
import type { PlanProgress } from './progress';

/** Gleiche Wünsche = gleicher Start (auf ≈ 100 m gerundet: das GPS schwankt), gleiches Ziel, gleiche Einstellungen, gleicher Zufallswert */
function cacheKey(request: TourRequest): string {
	const near = (p: [number, number]) => p.map((v) => v.toFixed(3));
	return JSON.stringify([
		near(request.start.lngLat),
		near(request.destination.lngLat),
		request.effort,
		request.returnMode,
		request.round ?? null
	]);
}

const CACHE_SIZE = 8;
const cache = new Map<string, PlannedTour[]>();

let worker: Worker | undefined;
let nextId = 1;
const waiting = new Map<
	number,
	{ resolve: (tours: PlannedTour[]) => void; reject: (error: Error) => void; onProgress?: (p: PlanProgress) => void }
>();

async function startWorker(): Promise<Worker | undefined> {
	if (worker) return worker;
	if (typeof Worker === 'undefined') return undefined;
	try {
		// erst bei Gebrauch laden (beim Vorrendern der Seiten gibt es keinen Hintergrundprozess)
		const { default: PlanWorker } = await import('./plan.worker?worker');
		worker = new PlanWorker();
		worker.onmessage = (event: MessageEvent<WorkerReply>) => {
			const reply = event.data;
			const pending = waiting.get(reply.id);
			if (!pending) return;
			if ('progress' in reply) {
				pending.onProgress?.(reply.progress);
				return;
			}
			waiting.delete(reply.id);
			if ('tours' in reply) pending.resolve(reply.tours);
			else pending.reject(errorFor(reply.failure, reply.message));
		};
		worker.onerror = () => {
			// Hintergrundprozess nicht lauffähig → wartende Anfragen bekommen einen Fehler und die Seite rechnet selbst
			const failed = [...waiting.values()];
			waiting.clear();
			worker?.terminate();
			worker = undefined;
			for (const pending of failed) pending.reject(new WorkerFailed());
		};
		return worker;
	} catch {
		return undefined;
	}
}

class WorkerFailed extends Error {}

/** onProgress bekommt während der Rechnung Etappe, Fortschritt (0 … 1) und die Zahl der bisher gerechneten Wege – für das Wartebild */
export async function planTours(request: TourRequest, urls: DataUrls, onProgress?: (p: PlanProgress) => void): Promise<PlannedTour[]> {
	const key = cacheKey(request);
	const hit = cache.get(key);
	if (hit) return hit;

	const tours = await plan(request, urls, onProgress);
	cache.set(key, tours);
	if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
	return tours;
}

async function plan(request: TourRequest, urls: DataUrls, onProgress?: (p: PlanProgress) => void): Promise<PlannedTour[]> {
	const target = await startWorker();
	if (target) {
		try {
			return await new Promise<PlannedTour[]>((resolve, reject) => {
				const id = nextId++;
				waiting.set(id, { resolve, reject, onProgress });
				target.postMessage({ id, request: plain(request), urls } satisfies WorkerRequest);
			});
		} catch (error) {
			if (!(error instanceof WorkerFailed)) throw error;
		}
	}
	return planWithData(request, urls, onProgress);
}

/** Svelte-Zustand (Proxy) in einfache Daten umwandeln – Proxys lassen sich nicht an den Hintergrundprozess schicken */
function plain<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}
