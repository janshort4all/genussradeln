/**
 * Austausch eines Stücks der Tour: ersetzt die Punkte `from`…`to` einer Teilstrecke durch einen neuen Weg (spannende
 * Umwege, siehe highlights.ts). Es wird nichts neu berechnet – Weg, Abbiegehinweise und Kennzahlen stimmen mit dem überein,
 * was die Karte gezeigt hat. (Die frühere Suche nach „schöneren Umwegen“ entfiel am 12.10.2026: zu unübersichtlich.)
 */
import { distance, type LngLat } from '$lib/geo/geo';
import { highlightSentence } from '$lib/routing/describe';
import type { RoutePath } from '$lib/routing/graphhopper';
import type { PlanDeps } from '$lib/routing/plan';
import { analyzeRoute, combineStats } from '$lib/scoring/score';
import { rideMinutes } from '$lib/tour/duration';
import { elevationProfile } from '$lib/tour/elevation';
import { pathOfLeg, type PlannedTour, type Waypoint } from '$lib/tour/model';
import { spliceLeg } from './slice';

/** Ein Austausch: dieses Stück der Tour durch einen anderen Weg ersetzen */
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
	/** Mehrweg in Metern (kann kleiner als 0 sein: dann ist der neue Weg kürzer) */
	extraMeters: number;
	/** Mehr-Fahrzeit in Minuten */
	extraMinutes: number;
	/** z. B. „Am Elfrather See vorbei“ */
	title: string;
	/** ein Satz, z. B. „Statt „Anger““ */
	why: string;
	/** Einbau eines Stopps (Café, Biergarten …): der Ort wird als Stopp-Wegpunkt gemerkt, nicht als Hilfspunkt */
	stop?: { lngLat: LngLat; name: string };
}

export type ImproveDeps = PlanDeps;

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
	vias.push({
		wp: offer.stop ? { lngLat: offer.stop.lngLat, kind: 'stop', name: offer.stop.name } : { lngLat: mid, kind: 'via' },
		at: offer.stop ? indexOf(offer.stop.lngLat) : (offer.from + offer.to) / 2
	});
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
