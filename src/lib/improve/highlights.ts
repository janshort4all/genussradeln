/**
 * Spannende Umwege (Wunsch Jan, 12.10.2026): Highlights in der Nähe der Tour – Seen, Flussabschnitte, Wälder, Parks –,
 * die nur wegen der Längenvorgabe nicht in der Tour gelandet sind. Für jedes Highlight wird ein deutlicher Umweg
 * gerechnet, der die Tour ein gutes Stück vorher verlässt, durch das Highlight bzw. an ihm entlang führt und später
 * zurückkommt. Kleine Abstecher (unter DETOURS.minExtraM) werden nicht angeboten.
 * Angezeigt wird das nur in der großen Karte, nach dem Knopf „Spannende Umwege suchen“.
 */
import { band, distance, distanceToLine, type LngLat } from '$lib/geo/geo';
import type { LandmarkKind, NameData, NamedPoint } from '$lib/naming/names';
import { landmarkTitle } from '$lib/naming/title';
import { NoRouteError, type RoutePath } from '$lib/routing/graphhopper';
import { shapeProblem, type PlanDeps } from '$lib/routing/plan';
import { overlapShare } from '$lib/scoring/overlap';
import { DETOURS } from '$lib/scoring/weights';
import { rideMinutes } from '$lib/tour/duration';
import { elevationProfile } from '$lib/tour/elevation';
import type { PlannedTour } from '$lib/tour/model';
import type { Offer } from './offers';
import { cumulative } from './slice';

export interface Highlight {
	id: string;
	name: string;
	kind: LandmarkKind;
	/** Randpunkte (Seen, Wälder, Parks) bzw. Punkte entlang des Flusses in der Nähe der Tour */
	points: LngLat[];
	/** Punkt für das Symbol auf der Karte */
	marker: LngLat;
	/** Abstand zur Tour (Meter) */
	distance: number;
	/** Teilstrecke und Punkt der Tour, der dem Highlight am nächsten liegt */
	legIndex: number;
	index: number;
	score: number;
}

/** Ein Highlight mit dem gerechneten Umweg dorthin */
export interface Detour {
	highlight: Highlight;
	offer: Offer;
}

const KIND_WEIGHT: Record<LandmarkKind, number> = { lake: 1.2, river: 1.1, forest: 1.0, park: 0.9 };

/** Punkte gleichen Namens in Gruppen teilen, die zusammenhängen (zwei Wälder namens „Stadtwald“ sind zwei Highlights) */
function clusters(points: LngLat[]): LngLat[][] {
	const groups: LngLat[][] = [];
	const used = new Set<number>();
	for (let i = 0; i < points.length; i++) {
		if (used.has(i)) continue;
		const group: LngLat[] = [];
		const queue = [i];
		used.add(i);
		while (queue.length) {
			const k = queue.pop()!;
			group.push(points[k]);
			for (let j = 0; j < points.length; j++) {
				if (!used.has(j) && distance(points[k], points[j]) <= DETOURS.clusterLinkM) {
					used.add(j);
					queue.push(j);
				}
			}
		}
		groups.push(group);
	}
	return groups;
}

/**
 * Highlights in der Nähe der Tour: benannte Seen, Flüsse, Wälder und Parks ab einer Mindestgröße, bis DETOURS.reachM neben
 * der Tour, nicht schon am Weg. Die besten zuerst (Art, Größe, Nähe), untereinander nicht an derselben Stelle.
 */
export function findHighlights(tour: PlannedTour, names: NameData): Highlight[] {
	const lines = tour.legs.map((leg) => leg.coordinates.map(([lon, lat]): LngLat => [lon, lat]));
	// alle benannten Punkte im Umkreis der Tour, nach Name und Art gesammelt
	const byName = new Map<string, { name: string; kind: LandmarkKind; points: LngLat[] }>();
	const seen = new Set<NamedPoint>();
	for (const line of lines) {
		for (let i = 0; i < line.length; i += Math.max(1, Math.floor(line.length / 60))) {
			for (const p of names.landmarks.within(line[i], DETOURS.reachM + 1500)) {
				if (seen.has(p)) continue;
				seen.add(p);
				const key = `${p.kind}|${p.name}`;
				const entry = byName.get(key) ?? { name: p.name, kind: p.kind as LandmarkKind, points: [] };
				entry.points.push(p.lngLat);
				byName.set(key, entry);
			}
		}
	}

	const nearestOnTour = (p: LngLat) => {
		let best = { legIndex: 0, index: 0, d: Infinity };
		lines.forEach((line, legIndex) => {
			for (let i = 0; i < line.length; i++) {
				const d = distance(p, line[i]);
				if (d < best.d) best = { legIndex, index: i, d };
			}
		});
		return best;
	};
	const toTour = (p: LngLat) => Math.min(...lines.map((line) => distanceToLine(p, line)));

	const found: Highlight[] = [];
	for (const { name, kind, points } of byName.values()) {
		for (const group of clusters(points)) {
			const distances = group.map(toTour);
			// schon am Weg? Dann ist es kein Umweg mehr wert
			const onRoute = distances.filter((d) => d < DETOURS.onRouteM).length / group.length;
			if (onRoute >= DETOURS.maxOnRouteShare) continue;
			// nur der Teil abseits der Tour zählt (bei Flüssen: der Abschnitt, den man noch nicht fährt)
			const away = group.filter((_, i) => distances[i] >= DETOURS.onRouteM && distances[i] <= DETOURS.reachM);
			if (away.length < DETOURS.minPoints[kind]) continue;
			const nearest = away.reduce((a, b) => (toTour(a) <= toTour(b) ? a : b));
			const d = toTour(nearest);
			const size = Math.min(away.length, DETOURS.sizeCapPoints);
			const score = KIND_WEIGHT[kind] * (size / DETOURS.sizeCapPoints) - 0.3 * (d / DETOURS.reachM);
			const at = nearestOnTour(nearest);
			found.push({
				id: `${kind}-${name}-${Math.round(nearest[0] * 1e3)}-${Math.round(nearest[1] * 1e3)}`,
				name,
				kind,
				points: away,
				marker: kind === 'river' ? nearest : centre(away),
				distance: d,
				legIndex: at.legIndex,
				index: at.index,
				score
			});
		}
	}
	const chosen: Highlight[] = [];
	for (const h of found.sort((a, b) => b.score - a.score)) {
		if (chosen.length >= DETOURS.candidates) break;
		if (chosen.some((c) => distance(c.marker, h.marker) < DETOURS.minApartM)) continue;
		chosen.push(h);
	}
	return chosen;
}

function centre(points: LngLat[]): LngLat {
	const lon = points.reduce((s, p) => s + p[0], 0) / points.length;
	const lat = points.reduce((s, p) => s + p[1], 0) / points.length;
	return [lon, lat];
}

/** Punkte entlang der Achse A → B ordnen (für die Reihenfolge der Hilfspunkte am Fluss) */
function alongAxis(p: LngLat, a: LngLat, b: LngLat): number {
	const kx = Math.cos((a[1] * Math.PI) / 180);
	const ax = (b[0] - a[0]) * kx;
	const ay = b[1] - a[1];
	return ((p[0] - a[0]) * kx * ax + (p[1] - a[1]) * ay) / (ax * ax + ay * ay || 1);
}

/**
 * Der Umweg zu einem Highlight: Die Tour wird ein gutes Stück vor der nächsten Stelle verlassen (je weiter das Highlight
 * weg ist, desto früher) und ebenso weit danach wieder erreicht. Dazwischen führt der Weg durch das Highlight (Wald, Park:
 * über seine Mitte) bzw. an ihm entlang (See, Fluss: über zwei Punkte am Ufer); ein Streifen um diese Linie hält ihn dort,
 * ohne Zipfel. `undefined`, wenn sich kein Umweg findet, der sich lohnt.
 */
export async function detourTo(tour: PlannedTour, highlight: Highlight, deps: PlanDeps): Promise<Offer | undefined> {
	const { effort } = tour.request;
	const leg = tour.legs[highlight.legIndex];
	const line = leg.coordinates.map(([lon, lat]): LngLat => [lon, lat]);
	const cum = cumulative(line);
	const last = line.length - 1;
	const tourLength = tour.legs.reduce((s, l) => s + l.distance, 0);
	const maxExtra = Math.min(DETOURS.maxExtraRatio * tourLength, DETOURS.maxExtraM);
	const others = tour.legs.filter((_, i) => i !== highlight.legIndex).map((l) => l.coordinates.map(([lon, lat]): LngLat => [lon, lat]));

	for (const reachFactor of DETOURS.windowFactors) {
		const around = Math.max(DETOURS.minWindowM, reachFactor * highlight.distance);
		let from = highlight.index;
		while (from > 0 && cum[highlight.index] - cum[from] < around) from--;
		let to = highlight.index;
		while (to < last && cum[to] - cum[highlight.index] < around) to++;
		if (to - from < 2) continue;
		const A = line[from];
		const B = line[to];

		// Hilfspunkte: Wald/Park über die Mitte, See/Fluss über zwei Uferpunkte (zuerst der zu A, dann der zu B)
		let vias: LngLat[];
		if (highlight.kind === 'forest' || highlight.kind === 'park') vias = [centre(highlight.points)];
		else {
			const sorted = [...highlight.points].sort((p, q) => alongAxis(p, A, B) - alongAxis(q, A, B));
			const entry = sorted[0];
			const exit = sorted[sorted.length - 1];
			if (highlight.kind === 'lake') {
				// der Uferpunkt, der am weitesten von der Tour weg liegt: so führt der Weg ums Wasser herum
				const far = highlight.points.reduce((a, b) => (distanceToLine(a, line) >= distanceToLine(b, line) ? a : b));
				vias = [entry, far, exit].filter((p, i, all) => i === 0 || distance(p, all[i - 1]) >= DETOURS.minShoreM);
			} else vias = distance(entry, exit) < DETOURS.minShoreM ? [highlight.marker] : [entry, exit];
		}
		const chain = [A, ...vias, B];
		const rings: LngLat[][] = [];
		for (let i = 0; i + 1 < chain.length; i++) rings.push(band(chain[i], chain[i + 1], DETOURS.corridorHalfWidthM));

		const attempt = async (points: LngLat[], outsideFactor: number) => {
			try {
				const [found] = await deps.route(points, { effort, signal: deps.signal, preferAreas: { rings, outsideFactor } });
				return found && !shapeProblem(found) ? found : undefined;
			} catch (error) {
				if (error instanceof NoRouteError) return undefined;
				throw error;
			}
		};
		// 1. über die Hilfspunkte im Streifen; 2. ergibt das Zipfel (Hilfspunkt am Ufer ohne Weg dorthin): nur der Streifen,
		// enger gefasst – GraphHopper sucht sich darin selbst den Weg am Highlight entlang
		const path: RoutePath | undefined =
			(await attempt(chain, DETOURS.outsideFactor)) ?? (await attempt([A, B], DETOURS.corridorOnlyFactor));
		if (!path) continue;

		const newLine = path.coordinates.map(([lon, lat]): LngLat => [lon, lat]);
		const baseLength = cum[to] - cum[from];
		const extra = path.distance - baseLength;
		if (extra < DETOURS.minExtraM || extra > maxExtra) continue;
		// führt er wirklich ans Highlight?
		const reaches = highlight.points.some((p) => distanceToLine(p, newLine) <= DETOURS.reachHighlightM);
		if (!reaches) continue;
		// nicht auf dem Rest der Tour zurück
		const rest = [line.slice(0, from + 1), line.slice(to), ...others].filter((l) => l.length > 1);
		if (rest.some((r) => overlapShare(newLine, r) > DETOURS.maxOverlapWithRest)) continue;

		const climb = (coords: [number, number, number][]) => elevationProfile(coords).ascent;
		const extraMinutes =
			rideMinutes(path.distance, climb(path.coordinates), effort) -
			rideMinutes(baseLength, climb(leg.coordinates.slice(from, to + 1)), effort);
		return {
			id: `umweg-${highlight.id}`,
			legIndex: highlight.legIndex,
			from,
			to,
			oldLine: line.slice(from, to + 1),
			newLine,
			newPath: path,
			extraMeters: extra,
			extraMinutes,
			title: landmarkTitle({ name: highlight.name, kind: highlight.kind }),
			why: `ca. ${Math.max(1, Math.round(highlight.distance / 1000))} km abseits Ihrer Route`
		};
	}
	return undefined;
}

/**
 * Alle spannenden Umwege einer Tour: Highlights suchen, für jedes den Umweg rechnen, die lohnenden behalten (höchstens
 * DETOURS.max, die besten zuerst).
 */
export async function findDetours(tour: PlannedTour, deps: PlanDeps): Promise<Detour[]> {
	if (!deps.names) return [];
	const highlights = findHighlights(tour, deps.names);
	const results: (Detour | undefined)[] = new Array(highlights.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(3, highlights.length) }, async () => {
			while (next < highlights.length) {
				const i = next++;
				const offer = await detourTo(tour, highlights[i], deps);
				results[i] = offer && { highlight: highlights[i], offer };
			}
		})
	);
	return results.filter((d): d is Detour => !!d).slice(0, DETOURS.max);
}
