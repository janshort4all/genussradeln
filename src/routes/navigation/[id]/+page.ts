import { error } from '@sveltejs/kit';
import { findSampleTour, sampleTours } from '$lib/tour/sample';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => sampleTours.map((tour) => ({ id: tour.id }));

export const load: PageLoad = ({ params }) => {
	const tour = findSampleTour(params.id);
	if (!tour) error(404, 'Diese Tour gibt es nicht.');
	return { tour };
};
