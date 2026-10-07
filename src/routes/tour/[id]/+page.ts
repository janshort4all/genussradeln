import { error } from '@sveltejs/kit';
import { session } from '$lib/tour/session.svelte';
import { fromPlanned } from '$lib/tour/view';
import type { PageLoad } from './$types';

// Berechnete Touren liegen nur auf dem Gerät (sessionStorage) → Seite nur im Browser aufbauen.
// Unbekannte Adressen liefert GitHub Pages über 404.html aus (SPA-Ersatzseite).
export const ssr = false;
export const prerender = false;

export const load: PageLoad = ({ params }) => {
	const planned = session.findTour(params.id);
	if (planned) return { tour: fromPlanned(planned), planned };
	error(404, 'Diese Tour ist nicht mehr da.');
};
