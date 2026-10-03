/** Hilfen nur für Tests: künstliche Landschaft und künstliche GraphHopper-Wege */
import { lineLength, type LngLat } from '$lib/geo/geo';
import type { RoutePath } from '$lib/routing/graphhopper';
import { Landscape, NONE } from './landscape';

/** 200 × 200 Zellen ab (6.5 / 51.4), Inhalt per Funktion */
export function makeLandscape(fill: (row: number, col: number) => number = () => NONE): Landscape {
	const meta = { west: 6.5, north: 51.4, cellLon: 0.0015, cellLat: 0.0009, width: 200, height: 200 };
	const cells = new Uint8Array(meta.width * meta.height);
	for (let r = 0; r < meta.height; r++) for (let c = 0; c < meta.width; c++) cells[r * meta.width + c] = fill(r, c);
	return new Landscape(meta, cells);
}

/** Weg entlang der Punkte, alle Abschnitte mit denselben Eigenschaften */
export function makePath(
	line: LngLat[],
	props: Partial<{ roadClass: string; network: string; surface: string; slope: number }> = {}
): RoutePath {
	const last = line.length - 1;
	return {
		distance: lineLength(line),
		time: 0,
		ascend: 0,
		descend: 0,
		coordinates: line.map(([lon, lat]) => [lon, lat, 30]),
		details: {
			road_class: [[0, last, props.roadClass ?? 'residential']],
			bike_network: [[0, last, props.network ?? 'missing']],
			surface: [[0, last, props.surface ?? 'asphalt']],
			smoothness: [[0, last, 'good']],
			street_name: [[0, last, null]],
			average_slope: [[0, last, props.slope ?? 0]]
		}
	};
}
