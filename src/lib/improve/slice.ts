/** Teilstücke eines Wegs: Länge messen und einen neuen Weg an die Stelle eines Abschnitts setzen */
import { bearing, distance, type LngLat } from '$lib/geo/geo';
import type { DetailInterval, RouteDetails, RouteInstruction, RoutePath } from '$lib/routing/graphhopper';
import type { TourLeg } from '$lib/tour/model';

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

/** Länge bis zu jedem Punkt der Linie (Meter, erster Punkt 0) */
export function cumulative(line: LngLat[]): number[] {
	const cum = [0];
	for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distance(line[i - 1], line[i]));
	return cum;
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
 * Abbiegehinweise nach dem Ersetzen: davor unverändert, die des neuen Stücks (ohne Start und Ziel), dahinter verschoben.
 * An den beiden Nahtstellen kommt ein Hinweis aus der Geometrie dazu, wenn der Weg dort abbiegt.
 */
function spliceInstructions(
	old: RouteInstruction[] | undefined,
	piece: RoutePath,
	at: (i: number) => LngLat,
	count: number,
	from: number,
	to: number
): RouteInstruction[] {
	const n = piece.coordinates.length;
	const shift = n - (to + 1 - from);
	const instructions: RouteInstruction[] = (old ?? []).filter((i) => i.index < from);
	if (from > 0) {
		const startTurn = turnSign(bearing(at(from - 1), at(from)), bearing(at(from), at(from + 1)));
		if (startTurn !== undefined) {
			const street = piece.instructions?.find((i) => i.index === 0)?.street;
			instructions.push({ index: from, sign: startTurn, ...(street ? { street } : {}) });
		}
	}
	for (const i of piece.instructions ?? []) {
		if (i.index > 0 && i.index < n - 1 && i.sign !== 4) instructions.push({ ...i, index: i.index + from });
	}
	const joint = from + n - 1;
	if (joint + 1 < count) {
		const endTurn = turnSign(bearing(at(joint - 1), at(joint)), bearing(at(joint), at(joint + 1)));
		if (endTurn !== undefined) {
			const street = (old ?? []).find((i) => i.index === to)?.street;
			instructions.push({ index: joint, sign: endTurn, ...(street ? { street } : {}) });
		}
	}
	for (const i of (old ?? []).filter((i) => i.index > to)) instructions.push({ ...i, index: i.index + shift });
	return instructions;
}

/**
 * Den Abschnitt `from`…`to` eines GraphHopper-Wegs durch `piece` ersetzen (ohne neu zu rechnen) – wie spliceLeg, aber
 * für die Planung (alle Angaben je Abschnitt bleiben erhalten, damit sich der Weg wie jeder andere bewerten lässt).
 * Das Stück beginnt und endet an denselben Punkten wie der ersetzte Abschnitt.
 */
export function splicePath(path: RoutePath, from: number, to: number, piece: RoutePath): RoutePath {
	const coordinates = [...path.coordinates.slice(0, from), ...piece.coordinates, ...path.coordinates.slice(to + 1)];
	const shift = piece.coordinates.length - (to + 1 - from);
	const at = (i: number): LngLat => [coordinates[i][0], coordinates[i][1]];
	let meters = 0;
	for (let i = 1; i < coordinates.length; i++) meters += distance(at(i - 1), at(i));
	// Höhenmeter des ersetzten Abschnitts (ungeglättet) abziehen, die des neuen Stücks dazu
	let oldUp = 0;
	let oldDown = 0;
	for (let i = from + 1; i <= to; i++) {
		const step = path.coordinates[i][2] - path.coordinates[i - 1][2];
		if (step > 0) oldUp += step;
		else oldDown -= step;
	}
	const oldMeters = slicePath(path, from, to).distance;
	const d = path.details;
	const p = piece.details;
	return {
		distance: meters,
		time: Math.max(0, path.time - (path.distance ? (path.time * oldMeters) / path.distance : 0)) + piece.time,
		ascend: Math.max(0, path.ascend - oldUp + piece.ascend),
		descend: Math.max(0, path.descend - oldDown + piece.descend),
		coordinates,
		instructions: spliceInstructions(path.instructions, piece, at, coordinates.length, from, to),
		details: {
			road_class: spliceIntervals(d.road_class, p.road_class, from, to, shift),
			bike_network: spliceIntervals(d.bike_network, p.bike_network, from, to, shift),
			surface: spliceIntervals(d.surface, p.surface, from, to, shift),
			smoothness: spliceIntervals(d.smoothness, p.smoothness, from, to, shift),
			street_name: spliceIntervals(d.street_name, p.street_name, from, to, shift),
			average_slope: spliceIntervals(d.average_slope, p.average_slope, from, to, shift),
			road_environment: spliceIntervals(d.road_environment, p.road_environment, from, to, shift),
			max_speed: spliceIntervals(d.max_speed, p.max_speed, from, to, shift)
		}
	};
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

	const instructions = spliceInstructions(leg.instructions, piece, at, coordinates.length, from, to);

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
