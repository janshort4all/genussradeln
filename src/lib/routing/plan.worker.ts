/**
 * Wegplanung im Hintergrund (Web Worker): Die Rechnung (Bewerten, Vergleichen, Benennen) hält die Seite nicht mehr an –
 * das Fahrrad im Wartebild ruckelt nicht mehr, auch auf dem Handy nicht. Nachrichten: siehe planner.ts.
 */
import type { PlannedTour, TourRequest } from '$lib/tour/model';
import { failureOf, planWithData, type DataUrls, type PlanFailure } from './plan-deps';
import type { PlanProgress } from './progress';

export interface WorkerRequest {
	id: number;
	request: TourRequest;
	urls: DataUrls;
}

export type WorkerReply =
	| { id: number; progress: PlanProgress }
	| { id: number; tours: PlannedTour[] }
	| { id: number; failure: PlanFailure; message: string };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
	const { id, request, urls } = event.data;
	try {
		// Fortschritt höchstens alle 150 ms melden (die Seite braucht nicht jede der vielen Anfragen einzeln)
		let last = 0;
		const tours = await planWithData(request, urls, (progress) => {
			const now = Date.now();
			if (now - last < 150 && progress.fraction < 0.99) return;
			last = now;
			(self as unknown as Worker).postMessage({ id, progress } satisfies WorkerReply);
		});
		(self as unknown as Worker).postMessage({ id, tours } satisfies WorkerReply);
	} catch (error) {
		console.warn('Wegberechnung:', error);
		(self as unknown as Worker).postMessage({
			id,
			failure: failureOf(error),
			message: (error as Error)?.message ?? ''
		} satisfies WorkerReply);
	}
};
