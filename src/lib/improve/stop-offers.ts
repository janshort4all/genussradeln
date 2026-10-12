/**
 * Einen Stopp (Café, Biergarten …) in die Tour einbauen (Jan, 14.10.2026: „wenn man den Biergarten auswählt, soll gefragt werden, ob die
 * Route dorthin angepasst werden soll – meist nur ein kleiner Schlenker, aber der soll in der Route sein, damit man es beim Fahren nicht
 * verfehlen kann“). Liegt der Stopp nicht ohnehin am Weg, wird die Tour ein kurzes Stück vor und nach ihm verlassen und durch den Stopp geführt.
 * Der Stopp bleibt immer drin, auch wenn er nur über einen Abstecher hin und zurück erreichbar ist (Entscheidung 04.10.2026, siehe
 * CLAUDE.md „Hilfspunkt vs. Stopp“) – darum keine Stummel-Prüfung wie bei den Hilfspunkten der App.
 */
import { distanceToLine, type LngLat } from '$lib/geo/geo';
import type { PlanDeps } from '$lib/routing/plan';
import { NoRouteError } from '$lib/routing/graphhopper';
import { STOP_LABELS } from '$lib/stops/kinds';
import { rideMinutes } from '$lib/tour/duration';
import { elevationProfile } from '$lib/tour/elevation';
import { pathOfLeg, type PlannedTour } from '$lib/tour/model';
import type { ViewStop } from '$lib/tour/view';
import type { Detour } from './highlights';
import { cumulative, slicePath } from './slice';

/** So nah am Weg gilt ein Stopp als „am Weg“ – dann gibt es nichts anzupassen */
export const STOP_ON_ROUTE_M = 60;
/** So viel Strecke vor und nach dem Stopp wird neu gerechnet (je Seite) */
const WINDOW_M = 500;
/** Ein Schlenker über so viele Meter ist keiner mehr – dann wird nichts angeboten */
const MAX_EXTRA_M = 6000;

/** Wie weit der Stopp vom Weg der Tour entfernt liegt (Meter) */
export function distanceFromTour(tour: PlannedTour, point: LngLat): number {
	return Math.min(...tour.legs.map((leg) => distanceToLine(point, leg.coordinates.map(([lon, lat]): LngLat => [lon, lat]))));
}

export async function detourToStop(tour: PlannedTour, stop: ViewStop, deps: PlanDeps): Promise<Detour | undefined> {
	if (!stop.lngLat) return undefined;
	const { effort } = tour.request;
	// Teilstrecke und Punkt, die dem Stopp am nächsten liegen
	let legIndex = 0;
	let nearest = 0;
	let best = Infinity;
	tour.legs.forEach((leg, li) =>
		leg.coordinates.forEach(([lon, lat], i) => {
			const d = distanceToLine(stop.lngLat!, [[lon, lat]]);
			if (d < best) {
				best = d;
				legIndex = li;
				nearest = i;
			}
		})
	);
	const leg = tour.legs[legIndex];
	const line = leg.coordinates.map(([lon, lat]): LngLat => [lon, lat]);
	const cum = cumulative(line);
	let from = nearest;
	while (from > 0 && cum[nearest] - cum[from] < WINDOW_M) from--;
	let to = nearest;
	while (to < line.length - 1 && cum[to] - cum[nearest] < WINDOW_M) to++;
	if (to - from < 2) return undefined;

	let path;
	try {
		[path] = await deps.route([line[from], stop.lngLat, line[to]], { effort, signal: deps.signal, exactPoints: true });
	} catch (error) {
		if (error instanceof NoRouteError) return undefined;
		throw error;
	}
	if (!path) return undefined;
	const newLine = path.coordinates.map(([lon, lat]): LngLat => [lon, lat]);
	// führt er wirklich zum Stopp?
	if (distanceToLine(stop.lngLat, newLine) > 40) return undefined;
	const old = slicePath(pathOfLeg(leg), from, to);
	const extra = path.distance - old.distance;
	if (extra > MAX_EXTRA_M) return undefined;

	const climb = (coords: [number, number, number][]) => elevationProfile(coords).ascent;
	const name = stop.name ?? STOP_LABELS[stop.kind];
	const id = `halt-${stop.id}`;
	return {
		highlight: {
			id,
			name,
			kind: 'park',
			points: [stop.lngLat],
			marker: stop.lngLat,
			distance: best,
			legIndex,
			index: nearest,
			score: 0
		},
		offer: {
			id,
			legIndex,
			from,
			to,
			oldLine: line.slice(from, to + 1),
			newLine,
			newPath: path,
			extraMeters: extra,
			extraMinutes:
				rideMinutes(path.distance, climb(path.coordinates), effort) - rideMinutes(old.distance, climb(leg.coordinates.slice(from, to + 1)), effort),
			title: name,
			why: 'unterwegs einkehren',
			stop: { lngLat: stop.lngLat, name }
		},
		gain: 0
	};
}
