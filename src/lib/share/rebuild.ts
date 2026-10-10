/**
 * Kurze Teilen-Links (Fassung 2): Stützpunkte so wählen, dass die Nachrechnung **genau** denselben Weg ergibt
 * (packVerified, beim Absender), und den Weg beim Empfänger nachrechnen (rebuildTour).
 */
import { distance, type LngLat } from '$lib/geo/geo';
import { highlightSentence } from '$lib/routing/describe';
import { NoRouteError, type route as routeGraphHopper } from '$lib/routing/graphhopper';
import type { FineMap } from '$lib/scoring/fine';
import type { Landscape } from '$lib/scoring/landscape';
import type { RoadMask } from '$lib/scoring/roads';
import { analyzeRoute, combineStats } from '$lib/scoring/score';
import { rideMinutes } from '$lib/tour/duration';
import { elevationProfile } from '$lib/tour/elevation';
import type { PlannedTour, Waypoint } from '$lib/tour/model';
import { ANCHOR_SPACING_M, decodePolyline, packShort, packTour, roundPoint, type TourSpec } from './link';

type Route = typeof routeGraphHopper;

/** Ein Teilstück gilt als gleich, wenn seine Länge auf diese Meter genau stimmt (Rundung der Punkte ≈ 1 m) */
const SAME_LENGTH_M = 3;
/** so oft wird bei Abweichungen verdichtet, danach gibt es den langen Link */
const MAX_ROUNDS = 8;
/** weicht die nachgerechnete Länge stärker ab, haben sich die Kartendaten seit dem Teilen geändert */
const CHANGED_DATA_M = 20;

const EXACT = { effort: 'easy' as const, exactPoints: true };

/** Strecke mit Kilometrierung: Punkt in der Mitte des Wegstücks bei Meter `along` (nie auf Knick/Kreuzung) */
function midSegmentPoint(line: LngLat[], cum: number[], along: number): { point: LngLat; along: number } {
	let i = cum.findIndex((c) => c > along);
	if (i < 1) i = 1;
	// sehr kurze Stücke überspringen (dort liegen oft Kreuzungen dicht beieinander)
	while (i < line.length - 1 && cum[i] - cum[i - 1] < 2) i++;
	return {
		point: roundPoint([(line[i - 1][0] + line[i][0]) / 2, (line[i - 1][1] + line[i][1]) / 2]),
		along: (cum[i - 1] + cum[i]) / 2
	};
}

/** Anfragen gleichzeitig, aber höchstens `limit` auf einmal */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				results[i] = await fn(items[i]);
			}
		})
	);
	return results;
}

/**
 * Stützpunkte für einen Abschnitt, mit denen die Nachrechnung exakt diesen Weg ergibt: jedes Teilstück zwischen
 * zwei Stützpunkten wird nachgerechnet; stimmt seine Länge nicht, kommt in seiner Mitte ein weiterer Punkt dazu.
 * `undefined`, wenn das nach MAX_ROUNDS Runden nicht gelingt.
 */
export async function verifiedAnchors(coordinates: LngLat[], route: Route): Promise<LngLat[] | undefined> {
	const line = coordinates;
	const cum = [0];
	for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distance(line[i - 1], line[i]));
	const total = cum[cum.length - 1];

	type Anchor = { point: LngLat; along: number };
	let anchors: Anchor[] = [{ point: roundPoint(line[0]), along: 0 }];
	for (let target = ANCHOR_SPACING_M; target < total - ANCHOR_SPACING_M / 2; target += ANCHOR_SPACING_M) {
		const a = midSegmentPoint(line, cum, target);
		if (a.along > anchors[anchors.length - 1].along + 1) anchors.push(a);
	}
	anchors.push({ point: roundPoint(line[line.length - 1]), along: total });

	for (let round = 0; round < MAX_ROUNDS; round++) {
		const pairs = anchors.slice(0, -1).map((a, i) => [a, anchors[i + 1]] as const);
		const ok = await mapLimited(pairs, 4, async ([a, b]) => {
			const [path] = await route([a.point, b.point], EXACT);
			return !!path && Math.abs(path.distance - (b.along - a.along)) <= SAME_LENGTH_M;
		});
		if (ok.every(Boolean)) return anchors.map((a) => a.point);
		const next: Anchor[] = [anchors[0]];
		pairs.forEach(([a, b], i) => {
			if (!ok[i]) {
				const mid = midSegmentPoint(line, cum, (a.along + b.along) / 2);
				if (mid.along > a.along + 1 && mid.along < b.along - 1) next.push(mid);
			}
			next.push(b);
		});
		if (next.length === anchors.length) return undefined; // nichts mehr zu verdichten
		anchors = next;
	}
	return undefined;
}

/**
 * Link-Daten zum Teilen: kurz, wenn die Nachrechnung nachweislich exakt denselben Weg ergibt –
 * sonst die lange Fassung mit der ganzen Strecke. Ein abweichender Weg wird nie verschickt.
 */
export async function packVerified(tour: PlannedTour, route: Route): Promise<string> {
	try {
		const anchors = await Promise.all(
			tour.legs.map((leg) => verifiedAnchors(leg.coordinates.map(([lon, lat]) => [lon, lat] as LngLat), route))
		);
		if (anchors.every((a): a is LngLat[] => !!a)) return packShort(tour, anchors);
	} catch (error) {
		console.warn('Kurzer Link nicht möglich, verschicke die ganze Strecke:', error);
	}
	return packTour(tour);
}

export async function rebuildTour(
	spec: TourSpec,
	deps: { route: Route; landscape?: Landscape; roads?: RoadMask; fine?: FineMap }
): Promise<PlannedTour> {
	const legs = await Promise.all(
		spec.g.map(async (encoded) => {
			const anchors = decodePolyline(encoded);
			const [path] = await deps.route(anchors, EXACT);
			if (!path) throw new NoRouteError('Weg aus dem Link nicht gefunden');
			return { anchors, path };
		})
	);
	const stats = combineStats(legs.map(({ path }) => analyzeRoute(path, deps.landscape, deps.roads, deps.fine)));
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

	// Kontrolle: Länge wie beim Absender? Sonst wurden die Kartendaten inzwischen erneuert
	const changed = spec.m?.some((meters, i) => Math.abs(meters - (legs[i]?.path.distance ?? 0)) > CHANGED_DATA_M);

	return {
		id: spec.id,
		title: spec.t,
		label: spec.l,
		highlight: highlightSentence(stats, spec.t),
		request: {
			start,
			destination,
			effort: 'easy',
			returnMode: spec.r,
			...(spec.k ? { round: { km: spec.k, seed: 0 } } : {})
		},
		waypoints,
		legs: legs.map(({ path }) => ({
			coordinates: path.coordinates,
			distance: path.distance,
			instructions: path.instructions,
			bridges: (path.details.road_environment ?? [])
				.filter(([, , v]) => v === 'bridge' || v === 'tunnel')
				.map(([from, to]) => [from, to] as [number, number])
		})),
		stats,
		extraDistance: spec.x,
		minutes: rideMinutes(
			stats.distance,
			legs.reduce((sum, { path }) => sum + elevationProfile(path.coordinates).ascent, 0),
			'easy'
		),
		shared: true,
		...(changed
			? { note: 'Die Kartendaten wurden seit dem Teilen erneuert – der Weg kann leicht vom geteilten abweichen.' }
			: {})
	};
}
