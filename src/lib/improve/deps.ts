/** Daten und Routenplaner für die Bausteine im Tourdetail (spannende Umwege, Stopps einbauen) */
import { corridorTiles } from '$lib/data/area';
import { tilesUrl } from '$lib/data/config';
import { tileStore } from '$lib/data/tiles';
import { route } from '$lib/routing/graphhopper';
import type { PlanDeps } from '$lib/routing/plan';
import { tourLine, type PlannedTour } from '$lib/tour/model';

/** So weit neben der Tour (m) sucht das Tourdetail nach Umwegen: Highlights bis 6 km, dazu Platz für den Weg dorthin */
const SEARCH_MARGIN_M = 9000;

/** Kartendaten entlang der Tour laden (fehlt etwas, geht es ohne weiter – nur weniger schön benannt und bewertet) */
export async function loadPlanDeps(tour: PlannedTour, signal?: AbortSignal): Promise<PlanDeps> {
	const area = await tileStore(tilesUrl())
		.area(corridorTiles(tourLine(tour), SEARCH_MARGIN_M))
		.catch((error) => (console.warn('Kartendaten nicht verfügbar:', error), undefined));
	return { route, landscape: area?.landscape, names: area?.names, roads: area?.roads, fine: area?.fine, streams: area?.streams, signal };
}
