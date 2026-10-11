/**
 * Aufgezeichnete Fahrten: liegen nur auf dem Gerät (IndexedDB), bis die Person die Datei selbst weitergibt.
 * Eigene Datenbank, damit die gemerkten Touren (`tours.ts`) unberührt bleiben.
 */
import type { RideRecord } from '$lib/navigation/recorder';

const DB_NAME = 'genuss-radeln-fahrten';
const STORE = 'rides';

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

/** Fahrt speichern bzw. aktualisieren (die laufende Aufzeichnung wird regelmäßig überschrieben) */
export async function saveRide(record: RideRecord): Promise<void> {
	// als einfache Daten ablegen
	await run('readwrite', (store) => store.put(JSON.parse(JSON.stringify(record))));
}

export async function getRide(id: string): Promise<RideRecord | undefined> {
	return (await run('readonly', (store) => store.get(id))) ?? undefined;
}

export async function removeRide(id: string): Promise<void> {
	await run('readwrite', (store) => store.delete(id));
}

/** Alle Fahrten, die neueste zuerst */
export async function listRides(): Promise<RideRecord[]> {
	const all = (await run('readonly', (store) => store.getAll())) as RideRecord[];
	return all.sort((a, b) => b.startedAt - a.startedAt);
}
