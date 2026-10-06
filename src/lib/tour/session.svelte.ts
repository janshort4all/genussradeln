/**
 * Aktueller Tourwunsch und die berechneten Vorschläge.
 * Wird zusätzlich im sessionStorage gehalten, damit Neuladen oder „Zurück“ nichts verliert.
 * (Dauerhaftes Merken von Touren kommt mit M8 in IndexedDB.)
 */
import type { PlannedTour, TourRequest } from './model';

const STORAGE_KEY = 'genuss-radeln:sitzung';

interface SessionData {
	request?: TourRequest;
	/** Vorschläge gehören immer zu genau diesem Wunsch */
	requestKey?: string;
	tours: PlannedTour[];
	/** über einen Link geöffnete Touren (z. B. vom PC aufs Handy geschickt) */
	shared?: PlannedTour[];
}

function load(): SessionData {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw);
	} catch {
		// Speicher nicht verfügbar (z. B. privater Modus) → ohne weitermachen
	}
	return { tours: [] };
}

function save(data: SessionData) {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch {
		// zu groß oder nicht verfügbar – dann eben nur im Speicher
	}
}

export function requestKey(r: TourRequest): string {
	return JSON.stringify([r.start.lngLat, r.destination.lngLat, r.effort, r.returnMode, r.round ?? null]);
}

const data: SessionData = $state(typeof sessionStorage === 'undefined' ? { tours: [] } : load());

export const session = {
	get request(): TourRequest | undefined {
		return data.request;
	},
	get tours(): PlannedTour[] {
		return data.tours;
	},
	/** Vorschläge passend zum aktuellen Wunsch (sonst leer) */
	get currentTours(): PlannedTour[] {
		return data.request && data.requestKey === requestKey(data.request) ? data.tours : [];
	},
	setRequest(request: TourRequest) {
		data.request = request;
		save($state.snapshot(data));
	},
	setTours(request: TourRequest, tours: PlannedTour[]) {
		data.requestKey = requestKey(request);
		data.tours = tours;
		save($state.snapshot(data));
	},
	findTour(id: string): PlannedTour | undefined {
		return data.tours.find((t) => t.id === id) ?? data.shared?.find((t) => t.id === id);
	},
	addShared(tour: PlannedTour) {
		data.shared = [tour, ...(data.shared ?? []).filter((t) => t.id !== tour.id)].slice(0, 5);
		save($state.snapshot(data));
	}
};
