/** Daten und Routenplaner für die Bausteine im Tourdetail (Umwege, Stationen): einmal laden, überall verwenden */
import { asset } from '$app/paths';
import { loadNames } from '$lib/naming/names';
import { route } from '$lib/routing/graphhopper';
import type { PlanDeps } from '$lib/routing/plan';
import { loadStreams } from '$lib/routing/streams';
import { loadFineMap } from '$lib/scoring/fine';
import { loadLandscape } from '$lib/scoring/landscape';
import { loadRoadMask } from '$lib/scoring/roads';

const quiet = <T>(promise: Promise<T>, what: string) =>
	promise.catch((error) => {
		console.warn(`${what} nicht verfügbar:`, error);
		return undefined;
	});

/** Alle Kartendaten laden (fehlt etwas, geht es ohne weiter – nur weniger schön benannt und bewertet) */
export async function loadPlanDeps(signal?: AbortSignal): Promise<PlanDeps> {
	const [landscape, names, roads, fine, streams] = await Promise.all([
		quiet(loadLandscape(asset('/data/landscape.json'), asset('/data/landscape.png')), 'Landschaftskarte'),
		quiet(loadNames(asset('/data/landmarks.json'), asset('/data/places.json')), 'Namensdaten'),
		quiet(loadRoadMask(asset('/data/roads.json'), asset('/data/roads.bin')), 'Straßenkarte'),
		quiet(loadFineMap(asset('/data/fine.json'), asset('/data/fine.bin')), 'Feine Karte'),
		quiet(loadStreams(asset('/data/streams.json')), 'Gewässerdaten')
	]);
	return { route, landscape, names, roads, fine, streams, signal };
}
