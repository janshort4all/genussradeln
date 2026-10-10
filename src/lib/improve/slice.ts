/** Teilstücke eines Wegs: Abschnitte ausschneiden und einen neuen Weg an die Stelle eines Abschnitts setzen */
import { bearing, distance, distanceToLine, resample, type LngLat } from '$lib/geo/geo';
import type { DetailInterval, RouteDetails, RouteInstruction, RoutePath } from '$lib/routing/graphhopper';
import type { TourLeg } from '$lib/tour/model';

/**
 * Wie weit weicht `line` von `other` ab? `max` = größter Abstand, `different` = Meter von `line`, die weiter als
 * `apart` von `other` entfernt sind (geprüft alle 40 m).
 */
export function deviation(line: LngLat[], other: LngLat[], apart: number): { max: number; different: number } {
	const step = 40;
	let max = 0;
	let different = 0;
	for (const p of resample(line, step)) {
		const d = distanceToLine(p, other);
		if (d > max) max = d;
		if (d > apart) different += step;
	}
	return { max, different };
}

/** Länge bis zu jedem Punkt der Linie (Meter, erster Punkt 0) */
export function cumulative(line: LngLat[]): number[] {
	const cum = [0];
	for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distance(line[i - 1], line[i]));
	return cum;
}

/** Ein Abschnitt eines Wegs: von Punkt `from` bis Punkt `to` (Indizes der Koordinaten) */
export interface Window {
	from: number;
	to: number;
	/** Länge in Metern */
	meters: number;
}

/**
 * Abschnitte der Länge `size`, alle `step` Meter verschoben – ohne die ersten und letzten `freeEnds` Meter. Ist der Weg
 * kürzer als zwei Abschnitte, wird ein kürzerer Abschnitt aus dem mittleren Teil genommen.
 */
export function windowsOf(cum: number[], size: number, step: number, freeEnds: number): Window[] {
	const total = cum[cum.length - 1];
	const first = Math.min(freeEnds, total * 0.1);
	const last = total - first;
	const length = Math.min(size, (last - first) * 0.6);
	if (length < 400) return [];
	const out: Window[] = [];
	const indexAt = (meters: number) => {
		const i = cum.findIndex((c) => c >= meters);
		return i < 0 ? cum.length - 1 : i;
	};
	for (let start = first; start + length <= last + 1; start += step) {
		const from = indexAt(start);
		const to = indexAt(start + length);
		if (to > from) out.push({ from, to, meters: cum[to] - cum[from] });
	}
	return out;
}

function clip<T>(intervals: DetailInterval<T>[] | undefined, from: number, to: number): DetailInterval<T>[] {
	const out: DetailInterval<T>[] = [];
	for (const [f, t, v] of intervals ?? []) {
		const start = Math.max(f, from);
		const end = Math.min(t, to);
		if (end > start) out.push([start - from, end - from, v]);
	}
	return out;
}

/** Das Stück von Punkt `from` bis Punkt `to` als eigener Weg (mit zugeschnittenen Abschnitts-Angaben) */
export function slicePath(path: RoutePath, from: number, to: number): RoutePath {
	const coordinates = path.coordinates.slice(from, to + 1);
	const d = path.details;
	const details: RouteDetails = {
		road_class: clip(d.road_class, from, to),
		bike_network: clip(d.bike_network, from, to),
		surface: clip(d.surface, from, to),
		smoothness: clip(d.smoothness, from, to),
		street_name: clip(d.street_name, from, to),
		average_slope: clip(d.average_slope, from, to),
		road_environment: clip(d.road_environment, from, to),
		max_speed: clip(d.max_speed, from, to)
	};
	let meters = 0;
	for (let i = 1; i < coordinates.length; i++) {
		meters += distance([coordinates[i - 1][0], coordinates[i - 1][1]], [coordinates[i][0], coordinates[i][1]]);
	}
	return { distance: meters, time: 0, ascend: 0, descend: 0, coordinates, details };
}

/**
 * Angaben je Abschnitt (Index = Teilstück zwischen Punkt i und i+1) nach dem Ersetzen der Punkte `from`…`to` durch ein
 * Stück mit `count` Punkten: vorne unverändert, dann die Angaben des neuen Stücks, hinten um `shift` verschoben.
 */
function spliceIntervals<T>(
	old: DetailInterval<T>[] | undefined,
	piece: DetailInterval<T>[] | undefined,
	from: number,
	to: number,
	shift: number
): DetailInterval<T>[] {
	const out: DetailInterval<T>[] = [];
	for (const [f, t, v] of old ?? []) if (f < from) out.push([f, Math.min(t, from), v]);
	for (const [f, t, v] of piece ?? []) out.push([f + from, t + from, v]);
	for (const [f, t, v] of old ?? []) if (t > to) out.push([Math.max(f, to) + shift, t + shift, v]);
	return out;
}

/** Abbiegehinweis (GraphHopper-Zeichen) für eine Richtungsänderung; `undefined`, wenn der Weg praktisch geradeaus geht */
function turnSign(before: number, after: number): number | undefined {
	const delta = ((after - before + 540) % 360) - 180;
	const size = Math.abs(delta);
	if (size < 20) return undefined;
	const side = delta > 0 ? 1 : -1;
	if (size > 165) return 8 * side;
	if (size > 120) return 3 * side;
	if (size > 60) return 2 * side;
	return side;
}

/**
 * Den Abschnitt `from`…`to` einer Teilstrecke durch `piece` ersetzen (ohne neu zu rechnen): Koordinaten, Angaben je
 * Abschnitt und Abbiegehinweise werden zusammengesetzt. An den beiden Nahtstellen kommt ein Hinweis aus der Geometrie
 * dazu, wenn der Weg dort abbiegt. Das Stück beginnt und endet an denselben Punkten wie der ersetzte Abschnitt.
 */
export function spliceLeg(leg: TourLeg, from: number, to: number, piece: RoutePath): TourLeg {
	const base = leg.coordinates;
	const n = piece.coordinates.length;
	const coordinates = [...base.slice(0, from), ...piece.coordinates, ...base.slice(to + 1)];
	const shift = n - (to + 1 - from);
	const at = (i: number): LngLat => [coordinates[i][0], coordinates[i][1]];

	let meters = 0;
	for (let i = 1; i < coordinates.length; i++) meters += distance(at(i - 1), at(i));

	const d = leg.details ?? {};
	const p = piece.details;
	const bridgesOf = (ranges: [number, number][] | undefined) =>
		(ranges ?? []).map(([f, t]): DetailInterval<string> => [f, t, 'bridge']);
	const pieceBridges = (p.road_environment ?? []).filter(([, , v]) => v === 'bridge' || v === 'tunnel');
	const bridges = spliceIntervals(bridgesOf(leg.bridges), pieceBridges, from, to, shift).map(
		([f, t]) => [f, t] as [number, number]
	);

	// Abbiegehinweise: davor unverändert, die des neuen Stücks (ohne Start und Ziel), dahinter verschoben
	const instructions: RouteInstruction[] = (leg.instructions ?? []).filter((i) => i.index < from);
	const startTurn = turnSign(bearing(at(from - 1), at(from)), bearing(at(from), at(from + 1)));
	if (startTurn !== undefined) {
		const street = piece.instructions?.find((i) => i.index === 0)?.street;
		instructions.push({ index: from, sign: startTurn, ...(street ? { street } : {}) });
	}
	for (const i of piece.instructions ?? []) {
		if (i.index > 0 && i.index < n - 1 && i.sign !== 4) instructions.push({ ...i, index: i.index + from });
	}
	const joint = from + n - 1;
	const endTurn = turnSign(bearing(at(joint - 1), at(joint)), bearing(at(joint), at(joint + 1)));
	const behind = (leg.instructions ?? []).filter((i) => i.index > to);
	if (endTurn !== undefined) {
		const street = (leg.instructions ?? []).find((i) => i.index === to)?.street;
		instructions.push({ index: joint, sign: endTurn, ...(street ? { street } : {}) });
	}
	for (const i of behind) instructions.push({ ...i, index: i.index + shift });

	return {
		coordinates,
		distance: meters,
		instructions,
		bridges,
		details: {
			road_class: spliceIntervals(d.road_class, p.road_class, from, to, shift),
			bike_network: spliceIntervals(d.bike_network, p.bike_network, from, to, shift),
			surface: spliceIntervals(d.surface, p.surface, from, to, shift),
			smoothness: spliceIntervals(d.smoothness, p.smoothness, from, to, shift),
			max_speed: spliceIntervals(d.max_speed, p.max_speed, from, to, shift)
		}
	};
}
