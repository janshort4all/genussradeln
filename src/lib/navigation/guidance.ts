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
	/** folgt eine Abzweigung so kurz danach, wird sie gleich mit angesagt und angezeigt („und gleich danach rechts“) */
	thenWithinM: 100,
	/** lange Gerade: „Der Strecke 2,5 Kilometer folgen“ */
	longStraightM: 1000,
	/** Suchfenster auf der Strecke ab dem letzten Stand (verhindert Sprünge auf den Rückweg) */
	searchAheadM: 800,
	searchBackM: 60,
	/**
	 * Mehr als so viele Meter Ungenauigkeit (z. B. Ortung über Funkzellen): die Meldung zählt nicht für die Position –
	 * sonst springt die Anzeige. Dann zeigt die App „Standort ungenau“.
	 */
	maxAccuracyM: 60,
	/** schneller als so viele Meter pro Sekunde fährt niemand (50 km/h) – daraus folgt, wie weit die Position höchstens vorrücken kann */
	maxSpeedMs: 14,
	/** Spielraum zusätzlich zu Tempo × Zeit (GPS-Rauschen, Strecke ist ein Stück kürzer als die Fahrt) */
	jumpSlackM: 30,
	/** so weit voraus darf man nach einer Abkürzung wieder an die Strecke anschließen */
	rejoinAheadM: 5000
} as const;

export interface NavState {
	/** Zeit (ms) der letzten Meldung, die für die Position zählte */
	time?: number;
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
	/** Zeitpunkt der Messung (ms) – damit lässt sich beurteilen, wie weit die Position seit der letzten Meldung höchstens gekommen ist */
	time?: number;
	/** Tempo (m/s) und Richtung (Grad) laut GPS – nur für die Aufzeichnung */
	speed?: number | null;
	heading?: number | null;
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
	/** Abzweigung gleich danach (für „dann rechts abbiegen“) */
	then?: Maneuver;
	/** restliche Meter bis zum Ende der Tour */
	remaining: number;
	/** Anzeige-Position: auf der Strecke, oder der echte Standort, wenn man daneben ist */
	position: LngLat;
	/** Die letzte Meldung war zu ungenau und wurde nicht für die Position benutzt */
	weak?: boolean;
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

	// 0. Zu ungenaue Meldung (Ortung über Funkzellen, Tunnel, dichte Bebauung): nicht für die Position benutzen.
	//    Sonst springt die Anzeige um hundert Meter und eine Abzweigung wird übersprungen.
	if ((fix.accuracy ?? 0) > NAV.maxAccuracyM) {
		const along = state.along;
		const maneuver = state.started ? track.nextManeuver(along) : undefined;
		return {
			state,
			maneuver,
			distance: maneuver ? maneuver.at - along : undefined,
			remaining: Math.max(0, track.total - along),
			position: state.started ? track.pointAt(along) : fix.lngLat,
			heading: track.bearingAt(along),
			weak: true,
			speak
		};
	}

	// 1. Wo auf der Strecke? Beim ersten Mal am Anfang suchen (bei Rundwegen liegt das Ende am selben Ort).
	//    Danach nur in einem Fenster ab dem letzten Stand, das nach Zeit und Höchsttempo begrenzt ist: Die Position kann
	//    nicht in einer Sekunde 90 m vorrücken, nur weil das GPS einmal danebenlag.
	const seconds = fix.time !== undefined && state.time !== undefined ? Math.max(0, (fix.time - state.time) / 1000) : undefined;
	const reach =
		seconds === undefined
			? NAV.searchAheadM
			: Math.min(NAV.searchAheadM, seconds * NAV.maxSpeedMs + (fix.accuracy ?? 0) + NAV.jumpSlackM);
	let loc = state.started
		? track.locate(fix.lngLat, state.along, reach, NAV.searchBackM + (fix.accuracy ?? 0))
		: track.locate(fix.lngLat, 0, 1500);
	// Erste Meldung weit weg vom Anfang (App neu gestartet, mitten in der Tour eingestiegen): überall suchen
	if (!state.started && (!loc || loc.offset > 200)) loc = track.locate(fix.lngLat) ?? loc;
	if (!loc) return { state, remaining: track.total, position: fix.lngLat, heading: 0, speak };

	const limit = Math.max(NAV.offRouteM, (fix.accuracy ?? 0) * 1.5);
	// Abkürzung genommen? Erst wenn schon die Meldung davor neben der Strecke lag (ein Ausreißer genügt nicht) und man weiter
	// vorne wieder auf ihr ist → dort weitermachen, und zwar an der ersten passenden Stelle, nicht an einer viel späteren
	if (loc.offset > limit && state.started && state.offCount >= 1) {
		const ahead = track.firstWithin(fix.lngLat, state.along, NAV.rejoinAheadM, NAV.backOnRouteM);
		if (ahead) loc = ahead;
	}
	if (fix.time !== undefined && loc.offset <= limit) state.time = fix.time;

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

	// Weit neben der Strecke (z. B. ein Ausreißer) rückt die Position nicht vor
	if (!state.offRoute && loc.offset <= limit) state.along = loc.along;
	const along = state.along;
	const heading = track.bearingAt(along);
	const remaining = Math.max(0, track.total - along);

	// 3. Was kommt als Nächstes?
	const maneuver = track.nextManeuver(along);
	const distance = maneuver ? maneuver.at - along : undefined;
	const after = maneuver && track.maneuverAfter(maneuver);
	const then = maneuver && maneuver.sign !== 4 && after && after.at - maneuver.at <= NAV.thenWithinM ? after : undefined;

	if (maneuver && distance !== undefined && !state.offRoute) {
		const isFinal = maneuver.sign === 4 && maneuver.leg === track.legCount - 1;
		if (distance <= NAV.nowM) {
			say(`now:${maneuver.at}`, announceNow(maneuver, then, isFinal, goalName), true);
			if (then) state.said.push(`ahead:${then.at}`);
			if (isFinal) state.finished = true;
		} else if (distance <= NAV.aheadM && distance > NAV.nowM * 2) {
			say(`ahead:${maneuver.at}`, announceAhead(maneuver, distance, isFinal, goalName, then));
			if (then) state.said.push(`ahead:${then.at}`);
		} else if (distance >= NAV.longStraightM) {
			say(`straight:${maneuver.at}`, `${spokenDistance(distance)} kommt die nächste Abzweigung. Bis dahin der Strecke folgen.`);
		}
	}

	const offRoute = state.offRoute ? { meters: Math.round(loc.offset), bearing: bearing(fix.lngLat, loc.point) } : undefined;
	return {
		state,
		maneuver,
		distance,
		then,
		remaining,
		position: state.offRoute ? fix.lngLat : loc.point,
		heading,
		offRoute,
		speak
	};
}
