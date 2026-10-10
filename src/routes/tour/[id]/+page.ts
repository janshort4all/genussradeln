import { error } from '@sveltejs/kit';
import { getTour } from '$lib/storage/tours';
import { session } from '$lib/tour/session.svelte';
import { fromPlanned } from '$lib/tour/view';
import type { PageLoad } from './$types';

// Berechnete Touren liegen nur auf dem Gerät (sessionStorage) → Seite nur im Browser aufbauen.
// Unbekannte Adressen liefert GitHub Pages über 404.html aus (SPA-Ersatzseite).
export const ssr = false;
export const prerender = false;

export const load: PageLoad = async ({ params }) => {
	let planned = session.findTour(params.id);
	if (!planned) {
		// nicht in dieser Sitzung geplant → vielleicht gemerkt (Meine Touren)
		planned = await getTour(params.id).catch(() => undefined);
		if (planned) session.addShared(planned);
	}
	if (planned) return { tour: fromPlanned(planned), planned };
	error(404, 'Diese Tour ist nicht mehr da.');
};
