/**
 * Schönere Umwege vorschlagen (F7, Wunsch Jan, 10.10.2026).
 *
 * Die gewählte Tour wird in Abschnitte geteilt (1,5 und 3 km, alle 500 m verschoben) und jeder wie ein ganzer Weg
 * bewertet (score.ts). Für die schwächsten Abschnitte rechnet die Planung (plan.ts, planDirection) Wege vom Anfang
 * zum Ende des Abschnitts – über Seeufer, Wald, Parks, Bäche, an der Straße vorbei. Angeboten wird, was deutlich
 * schöner und nicht zu viel länger ist. Übernehmen ersetzt nur diesen Abschnitt; der Rest der Tour bleibt.
 */
import { distance, type LngLat } from '$lib/geo/geo';
import { highlightSentence, honestTitles } from '$lib/routing/describe';
import { NoRouteError, type RoutePath } from '$lib/routing/graphhopper';
import { longCrossingMeters, planDirection, shapeProblem, type PlanDeps } from '$lib/routing/plan';
import { highlightOf, landmarkTitle, routeNames } from '$lib/naming/title';
import { mutualOverlap, overlapShare } from '$lib/scoring/overlap';
import { analyzeRoute, beautyScore, combineStats, lineOf, type RouteStats } from '$lib/scoring/score';
import { OFFERS, TITLE_MIN_SHARE_OF_TOP } from '$lib/scoring/weights';
import { rideMinutes } from '$lib/tour/duration';
import { elevationProfile } from '$lib/tour/elevation';
import { legFromPath, pathOfLeg, type PlannedTour, type Waypoint } from '$lib/tour/model';
import { cumulative, deviation, slicePath, spliceLeg, windowsOf, type Window } from './slice';

/** Ein Vorschlag: dieses Stück der Tour durch einen schöneren Weg ersetzen */
export interface Offer {
	id: string;
	/** Hin- (0) oder Rückweg (1) */
	legIndex: number;
	/** ersetztes Stück: Punkte `from`…`to` der Teilstrecke */
	from: number;
	to: number;
	oldLine: LngLat[];
	newLine: LngLat[];
	newPath: RoutePath;
	/** Mehrweg in Metern (kann kleiner als 0 sein: dann ist der neue Weg sogar kürzer) */
	extraMeters: number;
	/** Mehr-Fahrzeit in Minuten */
	extraMinutes: number;
	/** z. B. „Am Elfrather See vorbei“ */
	title: string;
	/** ein Satz, was daran besser ist */
	why: string;
	/** Schönheitsgewinn des Stücks (Punkte wie beautyScore) */
	gain: number;
	/** Lage des Stücks entlang der Teilstrecke (Meter), um nahe beieinanderliegende Vorschläge zu erkennen */
	startM: number;
	endM: number;
}

export type ImproveDeps = PlanDeps;

/** Anteil „laut“: Hauptstraßen, größere Nebenstraßen und Radwege direkt daneben */
const traffic = (s: RouteStats) => s.major + (s.busy ?? 0) + (s.roadsideNoise ?? s.roadside ?? 0);

/** Was am neuen Weg besser ist – in einem Satz für Kunden */
export function whyBetter(before: RouteStats, after: RouteStats): string {
	if (traffic(before) >= 0.3 && traffic(after) < traffic(before) - 0.2) return 'Statt an einer größeren Straße entlang.';
	if (after.water - before.water >= 0.2) return 'Mehr Wasser am Weg.';
	const wood = (s: RouteStats) => (s.forestThrough ?? s.forest) + (s.greenThrough ?? s.green);
	if (wood(after) - wood(before) >= 0.2) return 'Mehr Wald und Grün.';
	if (traffic(before) - traffic(after) >= 0.1) return 'Weniger Autoverkehr.';
	return 'Ruhiger und grüner.';
}

const ascentOf = (path: RoutePath) => elevationProfile(path.coordinates).ascent;

/** Zwei Stücke liegen zu nah beieinander (Meter entlang derselben Teilstrecke) */
function near(a: { legIndex: number; startM: number; endM: number }, b: typeof a, apart: number): boolean {
	return a.legIndex === b.legIndex && a.startM < b.endM + apart && b.startM < a.endM + apart;
}

/** Vorschläge ordnen: Gewinn je Mehr-Kilometer, nicht zwei an derselben Stelle */
function rank(all: Offer[]): Offer[] {
	const value = (o: Offer) => o.gain / Math.max(0.5, o.extraMeters / 1000);
	const chosen: Offer[] = [];
	for (const o of [...all].sort((a, b) => value(b) - value(a))) {
		if (chosen.length >= OFFERS.maxOffers) break;
		if (chosen.some((c) => near(c, o, OFFERS.minApartM))) continue;
		chosen.push(o);
	}
	// gleicher Titel an zwei Stellen: die Stelle dazuschreiben, damit man sie unterscheiden kann
	return chosen.map((o) =>
		chosen.some((c) => c !== o && c.title === o.title) ? { ...o, title: `${o.title} – ab km ${Math.round(o.startM / 1000)}` } : o
	);
}

/**
 * Schönere Umwege für eine Tour suchen. `onUpdate` meldet nach jedem untersuchten Abschnitt den aktuellen Stand,
 * damit der erste Vorschlag schon erscheint, während die Suche weiterläuft.
 */
export async function findOffers(
	tour: PlannedTour,
	deps: ImproveDeps,
	onUpdate?: (offers: Offer[]) => void
): Promise<Offer[]> {
	const { effort } = tour.request;
	const paths = tour.legs.map(pathOfLeg);
	const lines = paths.map(lineOf);
	const cums = lines.map(cumulative);
	// hatte die Tour schon vorher einen Zipfel/Kreis, prüfen wir das nach dem Austausch nicht erneut
	const baseProblem = paths.map((p) => !!shapeProblem(p));

	// 1. Abschnitte bewerten, die schwächsten je Teilstrecke auswählen
	interface Job {
		legIndex: number;
		win: Window;
		startM: number;
		endM: number;
		part: RoutePath;
		stats: RouteStats;
		beauty: number;
	}
	const perLeg = Math.ceil(OFFERS.tryWindows / paths.length);
	const jobs: Job[] = [];
	paths.forEach((path, legIndex) => {
		const all: Job[] = [];
		for (const size of OFFERS.windowsM) {
			for (const win of windowsOf(cums[legIndex], size, OFFERS.stepM, OFFERS.freeEndsM)) {
				const part = slicePath(path, win.from, win.to);
				// Brücken über große Flüsse und Fähren lassen sich nicht umfahren
				if (longCrossingMeters(part) > 0) continue;
				const stats = analyzeRoute(part, deps.landscape, deps.roads, deps.fine);
				all.push({
					legIndex,
					win,
					startM: cums[legIndex][win.from],
					endM: cums[legIndex][win.to],
					part,
					stats,
					beauty: beautyScore(stats)
				});
			}
		}
		const picked: Job[] = [];
		for (const job of all.sort((a, b) => a.beauty - b.beauty)) {
			if (picked.length >= perLeg) break;
			if (picked.some((p) => near(p, job, OFFERS.minSpacingM))) continue;
			picked.push(job);
		}
		jobs.push(...picked);
	});
	jobs.sort((a, b) => a.beauty - b.beauty);

	// 2. Für jeden schwachen Abschnitt nach einem schöneren Weg suchen
	const found: Offer[] = [];
	for (const job of jobs) {
		if (deps.signal?.aborted) break;
		const { legIndex, win } = job;
		const line = lines[legIndex];
		const oldLine = line.slice(win.from, win.to + 1);
		const baseLength = job.part.distance;
		const allowed = Math.min(OFFERS.maxExtraM, OFFERS.extraRatio * baseLength + OFFERS.extraBaseM);
		let result;
		try {
			result = await planDirection(line[win.from], line[win.to], { effort }, deps, {
				maxLength: baseLength + allowed,
				light: true
			});
		} catch (error) {
			if (error instanceof NoRouteError) continue;
			throw error;
		}
		// der übrige Teil der Tour: der neue Weg soll nicht auf ihm zurückfahren
		const rest = [
			line.slice(0, win.from + 1),
			line.slice(win.to),
			...lines.filter((_, i) => i !== legIndex)
		].filter((l) => l.length > 1);

		let best: { offer: Offer; value: number } | undefined;
		for (const cand of result.candidates) {
			const extra = cand.path.distance - baseLength;
			if (extra > allowed) continue;
			const gain = cand.beauty - job.beauty;
			if (gain < OFFERS.minGain) continue;
			if (mutualOverlap(cand.line, oldLine) > OFFERS.maxOverlapWithOld) continue;
			// eine echte Umfahrung von mehreren hundert Metern, kein kleiner Schlenker zur Seite
			const away = deviation(cand.line, oldLine, OFFERS.apartM);
			if (away.max < OFFERS.minDeviationM || away.different < OFFERS.minDifferentM) continue;
			if (rest.some((r) => overlapShare(cand.line, r) > OFFERS.maxOverlapWithRest)) continue;
			if (!baseProblem[legIndex] && shapeProblem(pathOfLeg(spliceLeg(tour.legs[legIndex], win.from, win.to, cand.path)))) continue;
			const value = gain - OFFERS.perExtraKm * (Math.max(0, extra) / 1000);
			if (best && best.value >= value) continue;
			const names = deps.names && routeNames(cand.line, deps.names, deps.landscape, deps.fine);
			const highlight = names && highlightOf(names);
			best = {
				value,
				offer: {
					id: `${legIndex}-${win.from}-${win.to}-${Math.round(cand.path.distance)}`,
					legIndex,
					from: win.from,
					to: win.to,
					oldLine,
					newLine: cand.line,
					newPath: cand.path,
					extraMeters: extra,
					extraMinutes:
						rideMinutes(cand.path.distance, ascentOf(cand.path), effort) -
						rideMinutes(baseLength, ascentOf(job.part), effort),
					title: highlight ? landmarkTitle(highlight) : (honestTitles(cand.stats, TITLE_MIN_SHARE_OF_TOP)[0] ?? 'Ruhigerer Weg'),
					why: whyBetter(job.stats, cand.stats),
					gain,
					startM: job.startM,
					endM: job.endM
				}
			};
		}
		if (best) {
			found.push(best.offer);
			onUpdate?.(rank(found));
		}
	}
	return rank(found);
}

/** Wegpunkte nach dem Austausch: Hilfspunkte im ersetzten Stück entfallen, ein Hilfspunkt mitten im neuen Stück kommt dazu */
function waypointsAfter(tour: PlannedTour, offer: Offer): Waypoint[] {
	const wps = tour.waypoints;
	const split = wps.findIndex((w) => w.kind === 'destination');
	// Wegpunkte der betroffenen Teilstrecke: Hinweg = Anfang bis Ziel, Rückweg = Ziel bis Ende
	const [lo, hi] = tour.legs.length < 2 || split < 0 ? [0, wps.length - 1] : offer.legIndex === 0 ? [0, split] : [split, wps.length - 1];
	const line = tour.legs[offer.legIndex].coordinates.map(([lon, lat]): LngLat => [lon, lat]);
	const indexOf = (p: LngLat) => {
		let best = 0;
		let bestDistance = Infinity;
		line.forEach((q, i) => {
			const d = distance(p, q);
			if (d < bestDistance) {
				bestDistance = d;
				best = i;
			}
		});
		return best;
	};
	const vias = wps
		.slice(lo + 1, hi)
		.map((wp) => ({ wp, at: indexOf(wp.lngLat) }))
		.filter(({ at }) => at < offer.from || at > offer.to);
	const mid = offer.newLine[Math.floor(offer.newLine.length / 2)];
	vias.push({ wp: { lngLat: mid, kind: 'via' }, at: (offer.from + offer.to) / 2 });
	vias.sort((a, b) => a.at - b.at);
	return [...wps.slice(0, lo + 1), ...vias.map((v) => v.wp), ...wps.slice(hi)];
}

/**
 * Vorschlag übernehmen: das Stück der Teilstrecke wird durch den neuen Weg ersetzt (spliceLeg). Es wird nichts neu
 * berechnet – Weg, Abbiegehinweise und Kennzahlen stimmen mit dem überein, was die Karte gezeigt hat.
 */
export function applyOffer(tour: PlannedTour, offer: Offer, deps: Pick<ImproveDeps, 'landscape' | 'roads' | 'fine'>): PlannedTour {
	const leg = spliceLeg(tour.legs[offer.legIndex], offer.from, offer.to, offer.newPath);
	const legs = tour.legs.map((l, i) => (i === offer.legIndex ? leg : l));
	const stats = combineStats(legs.map((l) => analyzeRoute(pathOfLeg(l), deps.landscape, deps.roads, deps.fine)));
	const length = legs.reduce((sum, l) => sum + l.distance, 0);
	return {
		...tour,
		highlight: highlightSentence(stats, tour.title),
		waypoints: waypointsAfter(tour, offer),
		legs,
		stats,
		extraDistance: Math.max(0, tour.extraDistance + (leg.distance - tour.legs[offer.legIndex].distance)),
		minutes: rideMinutes(length, legs.reduce((sum, l) => sum + elevationProfile(l.coordinates).ascent, 0), tour.request.effort)
	};
}
