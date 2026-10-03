/** Stopps aus static/data/pois.json laden und räumlich schnell finden */
import { distance, type LngLat } from '$lib/geo/geo';
import { STOP_KINDS, type StopKind } from './kinds';

export interface Poi {
	id: string;
	lngLat: LngLat;
	kind: StopKind;
	flags: number;
	name?: string;
}

type RawItem = [number, number, number, number, string?];

export function parsePois(json: { kinds: string[]; items: RawItem[] }): Poi[] {
	// Arten über den Namen zuordnen – so bleibt eine ältere Datei lesbar, falls sich die Liste ändert
	const kindOf = json.kinds.map((k) => (STOP_KINDS as readonly string[]).includes(k) ? (k as StopKind) : undefined);
	const pois: Poi[] = [];
	for (const [lonE5, latE5, kindIndex, flags, name] of json.items) {
		const kind = kindOf[kindIndex];
		if (!kind) continue;
		pois.push({ id: `${lonE5}:${latE5}:${kindIndex}`, lngLat: [lonE5 / 1e5, latE5 / 1e5], kind, flags, name });
	}
	return pois;
}

const CELL = 0.002; // Rasterweite für die Nachbarschaftssuche (≈ 140 × 220 m)

export class PoiIndex {
	private readonly cells = new Map<string, Poi[]>();

	constructor(pois: Poi[]) {
		for (const poi of pois) {
			const key = this.key(poi.lngLat[0], poi.lngLat[1]);
			const bucket = this.cells.get(key);
			if (bucket) bucket.push(poi);
			else this.cells.set(key, [poi]);
		}
	}

	private key(lon: number, lat: number): string {
		return `${Math.floor(lon / CELL)}:${Math.floor(lat / CELL)}`;
	}

	/** Alle Stopps im Umkreis (Meter) eines Punkts */
	near(point: LngLat, radius: number): Poi[] {
		const reach = Math.ceil(radius / 140) + 1;
		const cx = Math.floor(point[0] / CELL);
		const cy = Math.floor(point[1] / CELL);
		const out: Poi[] = [];
		for (let dx = -reach; dx <= reach; dx++) {
			for (let dy = -reach; dy <= reach; dy++) {
				for (const poi of this.cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
					if (distance(point, poi.lngLat) <= radius) out.push(poi);
				}
			}
		}
		return out;
	}
}

let loading: Promise<PoiIndex> | undefined;

/** Lädt die Stopp-Datei einmalig (im Browser) */
export function loadPois(url: string): Promise<PoiIndex> {
	loading ??= (async () => {
		const response = await fetch(url);
		if (!response.ok) throw new Error('Stopp-Daten nicht gefunden');
		return new PoiIndex(parsePois(await response.json()));
	})();
	loading.catch(() => (loading = undefined));
	return loading;
}
