/**
 * Geteilte Tour (kurzer Link, Fassung 2) nachrechnen: durch die Stützpunkte des Links fragt das Handy die
 * Wegberechnung nach genau diesem Weg und baut daraus wieder eine vollständige Tour mit Kennzahlen.
 */
import type { LngLat } from '$lib/geo/geo';
import { highlightSentence } from '$lib/routing/describe';
import { NoRouteError, type route as routeGraphHopper } from '$lib/routing/graphhopper';
import type { Landscape } from '$lib/scoring/landscape';
import { analyzeRoute, combineStats } from '$lib/scoring/score';
import { rideMinutes } from '$lib/tour/duration';
import { elevationProfile } from '$lib/tour/elevation';
import type { PlannedTour, Waypoint } from '$lib/tour/model';
import { decodePolyline, type TourSpec } from './link';

export async function rebuildTour(
	spec: TourSpec,
	deps: { route: typeof routeGraphHopper; landscape?: Landscape }
): Promise<PlannedTour> {
	const legs = await Promise.all(
		spec.g.map(async (encoded) => {
			const anchors = decodePolyline(encoded);
			const [path] = await deps.route(anchors, { effort: 'easy', exactPoints: true });
			if (!path) throw new NoRouteError('Weg aus dem Link nicht gefunden');
			return { anchors, path };
		})
	);
	const stats = combineStats(legs.map(({ path }) => analyzeRoute(path, deps.landscape)));
	const [sName, sLon, sLat] = spec.s;
	const [dName, dLon, dLat, settlement] = spec.d;
	const start = { name: sName, lngLat: [sLon, sLat] as LngLat };
	const destination = { name: dName, lngLat: [dLon, dLat] as LngLat, ...(settlement ? { settlement: true } : {}) };

	// Wegpunkte: Start, Stützpunkte, Ziel (und bei der Runde zurück zum Start)
	const waypoints: Waypoint[] = [{ lngLat: start.lngLat, kind: 'start', name: start.name }];
	legs.forEach(({ anchors }, i) => {
		for (const p of anchors.slice(1, -1)) waypoints.push({ lngLat: p, kind: 'via' });
		waypoints.push(
			i === 0
				? { lngLat: destination.lngLat, kind: 'destination', name: destination.name }
				: { lngLat: start.lngLat, kind: 'start', name: start.name }
		);
	});

	return {
		id: spec.id,
		title: spec.t,
		label: spec.l,
		highlight: highlightSentence(stats, spec.t),
		request: { start, destination, effort: 'easy', returnMode: spec.r },
		waypoints,
		legs: legs.map(({ path }) => ({ coordinates: path.coordinates, distance: path.distance, instructions: path.instructions })),
		stats,
		extraDistance: spec.x,
		minutes: rideMinutes(
			stats.distance,
			legs.reduce((sum, { path }) => sum + elevationProfile(path.coordinates).ascent, 0),
			'easy'
		),
		shared: true
	};
}
