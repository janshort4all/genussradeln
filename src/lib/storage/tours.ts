/**
 * Gemerkte Touren (F13/F14): liegen nur auf dem Gerät, in IndexedDB – kein Konto, kein Server.
 * Gespeichert wird die ganze Tour (Weg, Kennzahlen, Abbiegehinweise), damit sie auch ohne Neuberechnung
 * geöffnet und befahren werden kann.
 */
import type { PlannedTour } from '$lib/tour/model';

const DB_NAME = 'genuss-radeln';
const STORE = 'tours';

/** Eine gemerkte Tour mit dem Zeitpunkt des Merkens */
export interface SavedTour {
	tour: PlannedTour;
	savedAt: number;
}

let opening: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
	opening ??= new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB nicht verfügbar'));
			return;
		}
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB lässt sich nicht öffnen'));
	});
	opening.catch(() => (opening = undefined));
	return opening;
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE, mode);
		const request = work(transaction.objectStore(STORE));
		transaction.oncomplete = () => resolve(request.result);
		transaction.onerror = () => reject(transaction.error ?? new Error('Speichern fehlgeschlagen'));
		transaction.onabort = () => reject(transaction.error ?? new Error('Speichern abgebrochen'));
	});
}

/** Tour merken (überschreibt eine schon gemerkte mit derselben Nummer, behält dann das alte Datum) */
export async function saveTour(tour: PlannedTour): Promise<void> {
	const existing = await getSaved(tour.id);
	// als einfache Daten ablegen (die Tour kann ein reaktiver Proxy sein)
	const plain: PlannedTour = JSON.parse(JSON.stringify(tour));
	delete plain.saved;
	await run('readwrite', (store) => store.put({ id: tour.id, tour: plain, savedAt: existing?.savedAt ?? Date.now() }));
}

export async function removeTour(id: string): Promise<void> {
	await run('readwrite', (store) => store.delete(id));
}

async function getSaved(id: string): Promise<SavedTour | undefined> {
	return (await run('readonly', (store) => store.get(id))) ?? undefined;
}

/** Eine gemerkte Tour (oder nichts) */
export async function getTour(id: string): Promise<PlannedTour | undefined> {
	const saved = await getSaved(id);
	return saved && { ...saved.tour, saved: true };
}

/** Alle gemerkten Touren, die zuletzt gemerkte zuerst */
export async function listTours(): Promise<SavedTour[]> {
	const all = (await run('readonly', (store) => store.getAll())) as (SavedTour & { id: string })[];
	return all
		.map(({ tour, savedAt }) => ({ tour: { ...tour, saved: true }, savedAt }))
		.sort((a, b) => b.savedAt - a.savedAt);
}
