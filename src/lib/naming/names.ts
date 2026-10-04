/**
 * Namen für Wege: benannte Orientierungspunkte (Rhein, Stadtwald …) und Orte (Meerbusch, Kaarst …).
 * Daten aus static/data/landmarks.json (scripts/build-landmarks.ts) und places.json (scripts/fetch-places.ts).
 */
import { distance, type LngLat } from '$lib/geo/geo';

export type LandmarkKind = 'river' | 'lake' | 'forest' | 'park';

export interface NamedPoint {
	lngLat: LngLat;
	name: string;
	/** Orientierungspunkt: Art; Ort: Rang (0 Stadt … 3 Viertel) */
	kind: LandmarkKind | number;
}

const CELL = 0.01; // ≈ 700 × 1100 m

/** Räumlicher Index für „welcher benannte Punkt liegt in der Nähe?“ */
export class NameIndex {
	private readonly cells = new Map<string, NamedPoint[]>();

	constructor(points: NamedPoint[]) {
		for (const p of points) {
			const key = `${Math.floor(p.lngLat[0] / CELL)}:${Math.floor(p.lngLat[1] / CELL)}`;
			const bucket = this.cells.get(key);
			if (bucket) bucket.push(p);
			else this.cells.set(key, [p]);
		}
	}

	/** Nächster Punkt im Umkreis (Meter), optional nur bestimmter Arten */
	nearest(point: LngLat, radius: number, accept?: (p: NamedPoint) => boolean): NamedPoint | undefined {
		const reach = Math.ceil(radius / 700) + 1;
		const cx = Math.floor(point[0] / CELL);
		const cy = Math.floor(point[1] / CELL);
		let best: NamedPoint | undefined;
		let bestDistance = radius;
		for (let dx = -reach; dx <= reach; dx++) {
			for (let dy = -reach; dy <= reach; dy++) {
				for (const p of this.cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
					if (accept && !accept(p)) continue;
					const d = distance(point, p.lngLat);
					if (d <= bestDistance) {
						best = p;
						bestDistance = d;
					}
				}
			}
		}
		return best;
	}
}

export interface NameData {
	landmarks: NameIndex;
	places: NameIndex;
}

export function parseLandmarks(json: { names: [string, LandmarkKind][]; points: [number, number, number][] }): NamedPoint[] {
	return json.points.map(([lon, lat, index]) => ({
		lngLat: [lon / 1e4, lat / 1e4],
		name: json.names[index][0],
		kind: json.names[index][1]
	}));
}

export function parsePlaces(json: { places: [number, number, number, string][] }): NamedPoint[] {
	return json.places.map(([lon, lat, rank, name]) => ({ lngLat: [lon / 1e4, lat / 1e4], name, kind: rank }));
}

let loading: Promise<NameData> | undefined;

/** Lädt Orientierungspunkte und Orte einmalig (im Browser) */
export function loadNames(landmarksUrl: string, placesUrl: string): Promise<NameData> {
	loading ??= (async () => {
		const [l, p] = await Promise.all([fetch(landmarksUrl), fetch(placesUrl)]);
		if (!l.ok || !p.ok) throw new Error('Namensdaten nicht gefunden');
		return {
			landmarks: new NameIndex(parseLandmarks(await l.json())),
			places: new NameIndex(parsePlaces(await p.json()))
		};
	})();
	loading.catch(() => (loading = undefined));
	return loading;
}
