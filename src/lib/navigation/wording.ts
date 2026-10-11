/**
 * Abbiegehinweise in einfachen Worten – für die Anzeige und die Sprachansage.
 * Zahlen gerundet („300 m“ statt „287 m“), keine Fachbegriffe.
 */
import type { Maneuver } from './track';

export type ArrowKind =
	| 'straight'
	| 'left'
	| 'right'
	| 'slight-left'
	| 'slight-right'
	| 'sharp-left'
	| 'sharp-right'
	| 'keep-left'
	| 'keep-right'
	| 'roundabout'
	| 'uturn'
	| 'finish';

export function arrowOf(sign: number): ArrowKind {
	switch (sign) {
		case -3:
			return 'sharp-left';
		case -2:
			return 'left';
		case -1:
			return 'slight-left';
		case 1:
			return 'slight-right';
		case 2:
			return 'right';
		case 3:
			return 'sharp-right';
		case -7:
			return 'keep-left';
		case 7:
			return 'keep-right';
		case 6:
			return 'roundabout';
		case -8:
		case 8:
		case -98:
			return 'uturn';
		case 4:
			return 'finish';
		default:
			return 'straight';
	}
}

/** „links abbiegen“, „halb rechts“, „im Kreisverkehr die 2. Ausfahrt“ … */
export function actionText(m: Pick<Maneuver, 'sign' | 'exit'>): string {
	switch (m.sign) {
		case -3:
			return 'scharf links abbiegen';
		case -2:
			return 'links abbiegen';
		case -1:
			return 'halb links abbiegen';
		case 1:
			return 'halb rechts abbiegen';
		case 2:
			return 'rechts abbiegen';
		case 3:
			return 'scharf rechts abbiegen';
		case -7:
			return 'links halten';
		case 7:
			return 'rechts halten';
		case 6:
			return m.exit ? `im Kreisverkehr die ${m.exit}. Ausfahrt nehmen` : 'in den Kreisverkehr fahren';
		case -8:
		case 8:
		case -98:
			return 'wenden';
		case 4:
			return 'am Ziel';
		default:
			return 'geradeaus weiter';
	}
}

/** Entfernung für die Anzeige: „jetzt“, „80 m“, „300 m“, „1,2 km“ */
export function distanceText(meters: number): string {
	if (meters < 20) return 'jetzt';
	if (meters < 100) return `${Math.round(meters / 10) * 10} m`;
	if (meters < 1000) return `${Math.round(meters / 50) * 50} m`;
	return `${(Math.round(meters / 100) / 10).toLocaleString('de-DE')} km`;
}

/** Entfernung für die Ansage: „In 150 Metern“, „In 1,2 Kilometern“ */
export function spokenDistance(meters: number): string {
	if (meters < 1000) {
		const rounded = meters < 100 ? Math.round(meters / 10) * 10 : Math.round(meters / 50) * 50;
		return `In ${rounded} Metern`;
	}
	const km = Math.round(meters / 100) / 10;
	return km === 1 ? 'In einem Kilometer' : `In ${km.toLocaleString('de-DE')} Kilometern`;
}

/**
 * Ansage vor einer Abzweigung, z. B. „In 150 Metern links abbiegen, Uerdinger Straße.“
 * Folgt gleich die nächste (`then`): „In 150 Metern links abbiegen und gleich danach rechts abbiegen.“
 */
export function announceAhead(
	m: Maneuver,
	meters: number,
	isFinalGoal: boolean,
	goalName?: string,
	then?: Maneuver
): string {
	if (m.sign === 4) {
		return isFinalGoal
			? `${spokenDistance(meters)} sind Sie am Ziel.`
			: `${spokenDistance(meters)} erreichen Sie ${goalName ?? 'Ihr Ziel'}.`;
	}
	if (then && then.sign !== 4) return `${spokenDistance(meters)} ${actionText(m)} und gleich danach ${actionText(then)}.`;
	return `${spokenDistance(meters)} ${actionText(m)}${ontoText(m)}.`;
}

/** „, Uerdinger Straße“ bzw. „ auf den Feldweg“ – wohin es geht, wenn man es erkennen kann */
export function ontoText(m: Pick<Maneuver, 'street' | 'way'>): string {
	if (m.street) return `, ${m.street}`;
	return m.way ? ` auf den ${m.way}` : '';
}

/**
 * „Nochmal“: der aktuelle Stand in einem Satz, auch wenn die letzte Ansage schon eine Weile her ist –
 * „In 150 Metern links abbiegen“ mit der Entfernung von jetzt, nicht von damals.
 */
export function repeatAnnouncement(
	view:
		| {
				maneuver?: Maneuver;
				distance?: number;
				then?: Maneuver;
				offRoute?: { meters: number };
		  }
		| undefined,
	isFinalGoal: boolean,
	goalName?: string
): string {
	if (!view) return 'Ihr Standort wird noch gesucht.';
	if (view.offRoute) {
		const meters = view.offRoute.meters < 100 ? Math.round(view.offRoute.meters / 10) * 10 : Math.round(view.offRoute.meters / 50) * 50;
		return `Sie sind etwa ${meters} Meter von der Strecke entfernt. Bitte fahren Sie zurück zur Strecke.`;
	}
	if (!view.maneuver || view.distance === undefined) return 'Bitte der Strecke folgen.';
	if (view.distance < 25) return announceNow(view.maneuver, view.then, isFinalGoal, goalName);
	return announceAhead(view.maneuver, view.distance, isFinalGoal, goalName, view.then);
}

/** Ansage an der Abzweigung, z. B. „Jetzt links abbiegen.“ – optional mit der nächsten gleich danach */
export function announceNow(m: Maneuver, then: Maneuver | undefined, isFinalGoal: boolean, goalName?: string): string {
	if (m.sign === 4) {
		return isFinalGoal
			? 'Sie sind am Ziel. Schöne Pause!'
			: `Sie haben ${goalName ?? 'Ihr Ziel'} erreicht. Jetzt beginnt der Rückweg – auf einem anderen Weg.`;
	}
	const now = `Jetzt ${actionText(m)}${m.street ? '' : ontoText(m)}.`;
	if (then && then.sign !== 4) return `${now} Danach gleich ${actionText(then)}.`;
	return now;
}
