/**
 * Kartenkacheln für die Navigation vorladen (Jan, 14.10.2026: „einen größeren Bereich puffern, ohne gleich alles herunterzuladen“).
 *
 * Die Kacheln (OpenFreeMap, Vektorkacheln) gibt es bis Zoomstufe 14; eine Kachel deckt dort etwa 1,5 km ab und ist 60–160 KB groß.
 * Geladen werden nur Kacheln im Streifen neben der Strecke: die ersten Kilometer schon vor der Fahrt, danach immer ein Stück
 * voraus, dazu die ganze Strecke grob (niedrige Zoomstufen, für „Ganze Strecke“). Die Adressen sind dieselben wie bei der Karte,
 * der Zwischenspeicher des Service Workers (vite.config.ts) hebt sie auf – auch ohne Netz bleibt die Karte dann an diesen Stellen da.
 */
import { offset, resample, type LngLat } from '$lib/geo/geo';

const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';

/** Kachel-Nummer (Zoom/x/y) eines Punkts */
export function tileOf(p: LngLat, z: number): { x: number; y: number } {
	const n = 2 ** z;
	const lat = (p[1] * Math.PI) / 180;
	const x = Math.floor(((p[0] + 180) / 360) * n);
	const y = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);
	return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** Alle Kacheln auf Zoomstufe `z`, die höchstens `radius` Meter um den Punkt liegen (Punkt, Himmelsrichtungen und Ecken) */
function tilesNear(p: LngLat, radius: number, z: number, into: Set<string>) {
	const probes: LngLat[] = [p];
	for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) probes.push(offset(p, bearing, radius));
	for (const q of probes) {
		const { x, y } = tileOf(q, z);
		into.add(`${z}/${x}/${y}`);
	}
}

/**
 * Kacheln für ein Stück der Strecke: alle Zoomstufen in `zooms`, im Streifen von `radius` Metern neben der Linie.
 * Die Linie wird alle `step` Meter abgetastet (kleiner als eine Kachel, damit keine Lücke entsteht).
 */
export function tilesAlong(line: LngLat[], zooms: number[], radius: number, step = 400): string[] {
	const out = new Set<string>();
	const samples = resample(line, step);
	// auch der letzte Punkt, falls die Abtastung ihn nicht trifft
	if (line.length) samples.push(line[line.length - 1]);
	for (const z of zooms) for (const p of samples) tilesNear(p, radius, z, out);
	return [...out];
}

export interface PrefetchResult {
	loaded: number;
	failed: number;
	bytes: number;
}

/**
 * Lädt Kacheln im Hintergrund, höchstens wenige gleichzeitig und mit niedriger Priorität, jede nur einmal pro Sitzung.
 * Tut nichts, wenn das Handy „Datensparmodus“ meldet.
 */
export class TilePrefetcher {
	private requested = new Set<string>();
	private template: string | undefined;
	private maxZoom = 14;
	private controller = new AbortController();

	/** Die Adressvorlage der Kacheln (steht im TileJSON, das auch die Karte lädt) */
	private async source(): Promise<string | undefined> {
		if (this.template) return this.template;
		try {
			const response = await fetch(TILEJSON_URL, { signal: this.controller.signal });
			const json = (await response.json()) as { tiles?: string[]; maxzoom?: number };
			this.template = json.tiles?.[0];
			this.maxZoom = json.maxzoom ?? 14;
		} catch {
			// kein Netz: nichts vorzuladen
		}
		return this.template;
	}

	get topZoom(): number {
		return this.maxZoom;
	}

	async load(keys: string[], concurrency = 3): Promise<PrefetchResult> {
		const result: PrefetchResult = { loaded: 0, failed: 0, bytes: 0 };
		const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
		if (connection?.saveData) return result;
		const template = await this.source();
		if (!template) return { ...result, failed: keys.length };
		const todo = keys.filter((k) => !this.requested.has(k));
		for (const k of todo) this.requested.add(k);
		let next = 0;
		const worker = async () => {
			while (next < todo.length && !this.controller.signal.aborted) {
				const [z, x, y] = todo[next++].split('/');
				try {
					const response = await fetch(template.replace('{z}', z).replace('{x}', x).replace('{y}', y), {
						signal: this.controller.signal,
						// niedrige Priorität: die Kacheln, die die Karte gerade braucht, haben Vorrang
						priority: 'low'
					} as RequestInit);
					if (!response.ok) throw new Error(String(response.status));
					result.bytes += (await response.arrayBuffer()).byteLength;
					result.loaded++;
				} catch {
					result.failed++;
					// beim nächsten Mal noch einmal versuchen
					this.requested.delete(todo[next - 1]);
				}
			}
		};
		await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
		return result;
	}

	stop() {
		this.controller.abort();
	}
}
