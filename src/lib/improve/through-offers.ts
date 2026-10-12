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
import { throughVariants } from '$lib/routing/through';
import { lineOf, type RouteStats } from '$lib/scoring/score';
import { DETOURS, THROUGH } from '$lib/scoring/weights';
import { rideMinutes } from '$lib/tour/duration';
import { elevationProfile } from '$lib/tour/elevation';
import { pathOfLeg, type PlannedTour } from '$lib/tour/model';
import type { Detour } from './highlights';

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

export async function findThroughDetours(tour: PlannedTour, deps: PlanDeps): Promise<Detour[]> {
	const { effort } = tour.request;
	const out: Detour[] = [];
	for (const [legIndex, leg] of tour.legs.entries()) {
		const path = pathOfLeg(leg);
		const line = lineOf(path);
		const variants = await throughVariants(path, deps, { effort, signal: deps.signal }, {
			maxExtraRatio: THROUGH.offerMaxExtraRatio,
			maxExtraM: THROUGH.offerMaxExtraM
		});
		for (const v of variants) {
			const { before, after, gain } = v;
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
