/** Stopps (Cafés, Bänke …) entlang einer Strecke aus den Kacheln holen */
import { corridorTiles } from '$lib/data/area';
import { tilesUrl } from '$lib/data/config';
import { tileStore } from '$lib/data/tiles';
import type { LngLat } from '$lib/geo/geo';
import { PoiIndex } from '$lib/stops/pois';

/** So weit neben der Strecke (m) liegen Stopps, die gezeigt werden (STOP_RADIUS_M) – plus Platz für den Rand der Kachel */
const MARGIN_M = 1500;

export async function loadPoisAlong(line: LngLat[]): Promise<PoiIndex> {
	const area = await tileStore(tilesUrl()).area(corridorTiles(line, MARGIN_M));
	return area.pois ?? new PoiIndex([]);
}
