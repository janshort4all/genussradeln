/**
 * Navigation Schritt für Schritt: Aus jeder neuen Standortmeldung wird berechnet, wo auf der Strecke man ist,
 * was als Nächstes kommt, ob man die Strecke verlassen hat – und was jetzt angesagt werden soll.
 * Reine Rechnung ohne Browser-Funktionen, daher gut testbar (guidance.test.ts).
 */
import { bearing, type LngLat } from '$lib/geo/geo';
import type { Maneuver, RouteTrack } from './track';
import { announceAhead, announceNow, spokenDistance } from './wording';

export const NAV = {
	/** Ansage „In 150 Metern …“ */
	aheadM: 150,
	/** Ansage „Jetzt …“ mit Signalton */
	nowM: 25,
	/** weiter als so viele Meter neben der Strecke → „Strecke verlassen“ (bei ungenauem GPS mehr) */
	offRouteM: 40,
	/** so nah wieder dran → „Wieder auf der Strecke“ */
	backOnRouteM: 25,
	/** so viele Meldungen in Folge neben der Strecke, bevor wir es ansagen (GPS springt manchmal) */
	offRouteFixes: 2,
	/** folgt eine Abzweigung so kurz danach, wird sie gleich mit angesagt („Danach gleich rechts“) */
	thenWithinM: 60,
	/** lange Gerade: „Der Strecke 2,5 Kilometer folgen“ */
	longStraightM: 1000,
	/** Suchfenster auf der Strecke ab dem letzten Stand (verhindert Sprünge auf den Rückweg) */
	searchAheadM: 800,
	searchBackM: 60
} as const;

export interface NavState {
	/** Meter ab Start entlang der Strecke */
	along: number;
	started: boolean;
	offRoute: boolean;
	offCount: number;
	finished: boolean;
	/** bereits gesagte Ansagen (Schlüssel) */
	said: string[];
}

export interface Fix {
	lngLat: LngLat;
	/** Genauigkeit in Metern laut GPS */
	accuracy?: number;
}

export interface Announcement {
	text: string;
	beep: boolean;
}

export interface NavView {
	state: NavState;
	/** nächste Abzweigung (oder Ziel) und die Entfernung dorthin */
	maneuver?: Maneuver;
	distance?: number;
	/** restliche Meter bis zum Ende der Tour */
	remaining: number;
	/** Anzeige-Position: auf der Strecke, oder der echte Standort, wenn man daneben ist */
	position: LngLat;
	/** Fahrtrichtung laut Strecke (für die mitgedrehte Karte) */
	heading: number;
	/** neben der Strecke: wie weit und in welche Richtung (Grad ab Norden) es zurückgeht */
	offRoute?: { meters: number; bearing: number };
	speak: Announcement[];
}

export function initialNavState(): NavState {
	return { along: 0, started: false, offRoute: false, offCount: 0, finished: false, said: [] };
}

export function guide(track: RouteTrack, previous: NavState, fix: Fix, goalName?: string): NavView {
	const state: NavState = { ...previous, said: [...previous.said] };
	const speak: Announcement[] = [];
	const say = (key: string, text: string, beep = false) => {
		if (state.said.includes(key)) return;
		state.said.push(key);
		speak.push({ text, beep });
	};

	// 1. Wo auf der Strecke? Beim ersten Mal am Anfang suchen (bei Rundwegen liegt das Ende am selben Ort)
	let loc = state.started
		? track.locate(fix.lngLat, state.along, NAV.searchAheadM, NAV.searchBackM)
		: track.locate(fix.lngLat, 0, 1500);
	if (!loc || loc.offset > 200) loc = track.locate(fix.lngLat, state.started ? state.along - NAV.searchBackM : 0) ?? loc;
	if (!loc) return { state, remaining: track.total, position: fix.lngLat, heading: 0, speak };

	const limit = Math.max(NAV.offRouteM, (fix.accuracy ?? 0) * 1.5);
	// Abkürzung genommen? Weiter vorne wieder auf der Strecke → dort weitermachen
	if (loc.offset > limit && state.started) {
		const ahead = track.locate(fix.lngLat, state.along);
		if (ahead && ahead.offset <= NAV.backOnRouteM) loc = ahead;
	}

	if (!state.started) {
		state.started = true;
		say('start', 'Los geht’s. Gute Fahrt!');
	}

	// 2. Strecke verlassen?
	state.offCount = loc.offset > limit ? state.offCount + 1 : 0;
	if (!state.offRoute && state.offCount >= NAV.offRouteFixes) {
		state.offRoute = true;
		state.said = state.said.filter((k) => k !== 'back');
		say('off', 'Sie haben die Strecke verlassen. Der Pfeil zeigt zurück zur Strecke.', true);
	} else if (state.offRoute && loc.offset <= NAV.backOnRouteM) {
		state.offRoute = false;
		state.said = state.said.filter((k) => k !== 'off');
		say('back', 'Wieder auf der Strecke.');
	}

	if (!state.offRoute) state.along = loc.along;
	const along = state.along;
	const heading = track.bearingAt(along);
	const remaining = Math.max(0, track.total - along);

	// 3. Was kommt als Nächstes?
	const maneuver = track.nextManeuver(along);
	const distance = maneuver ? maneuver.at - along : undefined;

	if (maneuver && distance !== undefined && !state.offRoute) {
		const isFinal = maneuver.sign === 4 && maneuver.leg === track.legCount - 1;
		if (distance <= NAV.nowM) {
			const then = track.maneuverAfter(maneuver);
			const soon = then && then.at - maneuver.at <= NAV.thenWithinM ? then : undefined;
			say(`now:${maneuver.at}`, announceNow(maneuver, soon, isFinal, goalName), true);
			if (soon) state.said.push(`ahead:${soon.at}`);
			if (isFinal) state.finished = true;
		} else if (distance <= NAV.aheadM && distance > NAV.nowM * 2) {
			say(`ahead:${maneuver.at}`, announceAhead(maneuver, distance, isFinal, goalName));
		} else if (distance >= NAV.longStraightM) {
			say(`straight:${maneuver.at}`, `${spokenDistance(distance)} kommt die nächste Abzweigung. Bis dahin der Strecke folgen.`);
		}
	}

	const offRoute = state.offRoute ? { meters: Math.round(loc.offset), bearing: bearing(fix.lngLat, loc.point) } : undefined;
	return {
		state,
		maneuver,
		distance,
		remaining,
		position: state.offRoute ? fix.lngLat : loc.point,
		heading,
		offRoute,
		speak
	};
}
