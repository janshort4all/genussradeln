/**
 * Vorschläge „Durch den Wald / am See entlang“ (Jan, 14.10.2026: „das ist doch der perfekte Fall für einen Routenvorschlag,
 * um die Tour noch schöner zu machen“): Stücke durch Wald, Park oder am Seeufer (routing/through.ts), die die Planung nicht
 * selbst übernommen hat – weil eine Runde sonst mehr als 10 % von der gewünschten Länge abwiche oder das Stück länger ist,
 * als die Planung von sich aus nimmt. Sie erscheinen bei „Spannende Umwege suchen“ wie die Umwege zu Highlights; die Person
 * entscheidet. Anders als dort gibt es keinen Mindest-Mehrweg – es geht nicht um ein Ziel abseits, sondern um denselben Weg,
 * nur durchs Grüne statt daneben.
 */
import { distanceToLine, type LngLat } from '$lib/geo/geo';
import type { LandmarkKind } from '$lib/naming/names';
import { landmarkTitle, routeNames } from '$lib/naming/title';
import type { PlanDeps } from '$lib/routing/plan';
import type { RouteOptions, RoutePath } from '$lib/routing/graphhopper';
import { cleanSplice, throughVariants, type ThroughVariant } from '$lib/routing/through';
import { analyzeRoute, beautyScore, lineOf, type RouteStats } from '$lib/scoring/score';
import { DETOURS, THROUGH } from '$lib/scoring/weights';
import { rideMinutes } from '$lib/tour/duration';
import { elevationProfile } from '$lib/tour/elevation';
import { pathOfLeg, type PlannedTour } from '$lib/tour/model';
import type { Detour } from './highlights';
import { cumulative, slicePath, splicePath } from './slice';

/** Anteil „laut“: Hauptstraßen, größere Nebenstraßen, Radwege direkt daneben (wie bei den Umwegen) */
const traffic = (s: RouteStats) => s.major + (s.busy ?? 0) + (s.roadsideNoise ?? s.roadside ?? 0);

/** Name des Vorschlags: das benannte Gewässer bzw. der Wald/Park, an dem das neue Stück am meisten entlangführt – sonst allgemein */
function nameOf(line: LngLat[], before: RouteStats, after: RouteStats, deps: PlanDeps): { name: string; kind: LandmarkKind } {
	const landmark = deps.names
		? routeNames(line, deps.names, deps.landscape, deps.fine).landmarks.find((l) => l.share >= 0.25)
		: undefined;
	if (landmark) return { name: landmarkTitle(landmark), kind: landmark.kind };
	const shore = (after.shoreWater ?? 0) - (before.shoreWater ?? 0);
	const wood = (after.forestThrough ?? 0) - (before.forestThrough ?? 0);
	const park = (after.greenThrough ?? 0) - (before.greenThrough ?? 0);
	if (shore >= wood && shore >= park) return { name: 'Am Wasser entlang', kind: 'lake' };
	if (wood >= park) return { name: 'Durch den Wald', kind: 'forest' };
	return { name: 'Durchs Grüne', kind: 'park' };
}

/** Für Vorschläge: ohne Längengrenze, weiter seitlich, mehr Abschnitte (THROUGH.offer…) */
const OFFER_LIMITS = {
	maxExtraRatio: THROUGH.offerMaxExtraRatio,
	maxExtraM: THROUGH.offerMaxExtraM,
	maxOffsetM: THROUGH.offerMaxOffsetM,
	distancePenaltyM: THROUGH.offerDistancePenaltyM,
	maxStretches: THROUGH.offerMaxStretches
};

/** Stück `from`…`to` eines Wegs samt Abbiegehinweisen (für die Navigation nach dem Übernehmen) */
function pieceOf(path: RoutePath, from: number, to: number): RoutePath {
	return {
		...slicePath(path, from, to),
		instructions: (path.instructions ?? []).filter((i) => i.index >= from && i.index <= to).map((i) => ({ ...i, index: i.index - from }))
	};
}

/**
 * Ein Vorschlag soll alles mitnehmen, was an dieser Stelle geht. Sonst gab es nach dem Übernehmen gleich den nächsten
 * Vorschlag „Am Rhein entlang“ für das Stück daneben (Jan, 14.10.2026: „wenn ich Übernehmen drücke, übernimmt er es nicht“ –
 * übernommen war es, aber derselbe Name stand wieder in der Liste). Deshalb wird nach dem ersten Stück in der Nähe weiter
 * gesucht (bis THROUGH.chainSteps Mal) und alles zu einem Vorschlag zusammengefasst.
 */
async function chained(
	path: RoutePath,
	first: ThroughVariant,
	deps: PlanDeps,
	options: RouteOptions
): Promise<{ from: number; to: number; piece: RoutePath }> {
	let current = splicePath(path, first.from, first.to, first.piece);
	// Bereich des neuen Stücks im aktuellen Weg und im ursprünglichen
	let cur: [number, number] = [first.from, first.from + first.piece.coordinates.length - 1];
	let orig: [number, number] = [first.from, first.to];
	for (let step = 0; step < THROUGH.chainSteps; step++) {
		const cum = cumulative(lineOf(current));
		let a = cur[0];
		while (a > 0 && cum[cur[0]] - cum[a] < THROUGH.chainNearM) a--;
		let b = cur[1];
		while (b < cum.length - 1 && cum[b] - cum[cur[1]] < THROUGH.chainNearM) b++;
		const [more] = (
			await throughVariants(current, deps, options, OFFER_LIMITS, { from: a, to: b })
		)
			.filter((v) => v.gain >= DETOURS.minGain)
			.sort((x, y) => y.gain - x.gain);
		if (!more) break;
		const shift = more.piece.coordinates.length - (more.to + 1 - more.from);
		const offset = cur[1] - orig[1];
		const nextOrig: [number, number] = [more.from < cur[0] ? more.from : orig[0], more.to > cur[1] ? more.to - offset : orig[1]];
		const nextCur: [number, number] = [Math.min(cur[0], more.from), Math.max(cur[1], more.to) + shift];
		current = splicePath(current, more.from, more.to, more.piece);
		cur = nextCur;
		orig = nextOrig;
	}
	return { from: orig[0], to: orig[1], piece: pieceOf(current, cur[0], cur[1]) };
}

export async function findThroughDetours(tour: PlannedTour, deps: PlanDeps): Promise<Detour[]> {
	const { effort } = tour.request;
	const options = { effort, signal: deps.signal };
	const out: Detour[] = [];
	for (const [legIndex, leg] of tour.legs.entries()) {
		const path = pathOfLeg(leg);
		const line = lineOf(path);
		const found = await throughVariants(path, deps, options, OFFER_LIMITS);
		const taken: [number, number][] = [];
		for (const first of found.filter((v) => v.gain >= DETOURS.minGain).sort((x, y) => y.gain - x.gain)) {
			if (taken.some(([f, t]) => first.from <= t && first.to >= f)) continue;
			// zusammengefasst nur, wenn dabei kein Stummel entsteht – sonst das erste Stück allein
			const all = await chained(path, first, deps, options);
			const joined = cleanSplice(path, all.from, all.to, all.piece) ? all : first;
			if (taken.some(([f, t]) => joined.from <= t && joined.to >= f)) continue;
			taken.push([joined.from, joined.to]);
			const old = slicePath(path, joined.from, joined.to);
			const before = analyzeRoute(old, deps.landscape, deps.roads, deps.fine);
			const after = analyzeRoute(joined.piece, deps.landscape, deps.roads, deps.fine);
			const gain = beautyScore(after) - beautyScore(before);
			const v = { ...joined, passBy: first.passBy, extra: joined.piece.distance - old.distance };
			if (gain < DETOURS.minGain) continue;
			if (traffic(after) > Math.max(traffic(before) + DETOURS.trafficSlack, DETOURS.maxTraffic)) continue;
			const newLine = lineOf(v.piece);
			const { name, kind } = nameOf(newLine, before, after, deps);
			const climb = (coords: [number, number, number][]) => elevationProfile(coords).ascent;
			const middle = newLine[Math.floor(newLine.length / 2)];
			const id = `durch-${legIndex}-${v.from}`;
			out.push({
				highlight: {
					id,
					name,
					kind,
					points: v.passBy.inside,
					marker: middle,
					distance: distanceToLine(middle, line),
					legIndex,
					index: Math.round((v.from + v.to) / 2),
					score: gain
				},
				offer: {
					id,
					legIndex,
					from: v.from,
					to: v.to,
					oldLine: line.slice(v.from, v.to + 1),
					newLine,
					newPath: v.piece,
					extraMeters: v.extra,
					extraMinutes:
						rideMinutes(v.piece.distance, climb(v.piece.coordinates), effort) -
						rideMinutes(v.piece.distance - v.extra, climb(leg.coordinates.slice(v.from, v.to + 1)), effort),
					title: name,
					why: 'statt am Rand vorbei'
				},
				gain
			});
		}
	}
	return out;
}
