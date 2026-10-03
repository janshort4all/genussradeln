/** Geo-Hilfsfunktionen. Koordinaten immer als [Längengrad, Breitengrad] (wie GeoJSON/GraphHopper). */

export type LngLat = [number, number];

const EARTH_RADIUS = 6371000;
const RAD = Math.PI / 180;

/** Entfernung in Metern */
export function distance(a: LngLat, b: LngLat): number {
	const dLat = (b[1] - a[1]) * RAD;
	const dLon = (b[0] - a[0]) * RAD;
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Längen der einzelnen Abschnitte einer Linie (Index i = Abschnitt von Punkt i zu i+1) */
export function segmentLengths(line: LngLat[]): number[] {
	const out: number[] = [];
	for (let i = 0; i + 1 < line.length; i++) out.push(distance(line[i], line[i + 1]));
	return out;
}

export function lineLength(line: LngLat[]): number {
	return segmentLengths(line).reduce((sum, d) => sum + d, 0);
}

/** Punkte im gleichmäßigen Abstand (Meter) entlang der Linie, inklusive Anfang und Ende */
export function resample(line: LngLat[], step: number): LngLat[] {
	if (line.length < 2) return [...line];
	const out: LngLat[] = [line[0]];
	let carried = 0;
	for (let i = 0; i + 1 < line.length; i++) {
		const a = line[i];
		const b = line[i + 1];
		const len = distance(a, b);
		let pos = step - carried;
		while (pos <= len) {
			const t = pos / len;
			out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
			pos += step;
		}
		carried = len - (pos - step);
	}
	const last = line[line.length - 1];
	const tail = out[out.length - 1];
	if (tail[0] !== last[0] || tail[1] !== last[1]) out.push(last);
	return out;
}

/** Kürzeste Entfernung (Meter) von Punkt p zur Strecke a–b (lokal flach gerechnet, für kurze Abstände genau genug) */
export function distanceToSegment(p: LngLat, a: LngLat, b: LngLat): number {
	const kx = Math.cos(p[1] * RAD) * EARTH_RADIUS * RAD;
	const ky = EARTH_RADIUS * RAD;
	const ax = (a[0] - p[0]) * kx;
	const ay = (a[1] - p[1]) * ky;
	const bx = (b[0] - p[0]) * kx;
	const by = (b[1] - p[1]) * ky;
	const dx = bx - ax;
	const dy = by - ay;
	const len2 = dx * dx + dy * dy;
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
	return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Kürzeste Entfernung (Meter) von Punkt p zur Linie */
export function distanceToLine(p: LngLat, line: LngLat[]): number {
	if (line.length === 1) return distance(p, line[0]);
	let best = Infinity;
	for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, distanceToSegment(p, line[i], line[i + 1]));
	return best;
}

/** Punkt, der von `from` aus `meters` in Richtung `bearing` (Grad, 0 = Norden) liegt */
export function offset(from: LngLat, bearing: number, meters: number): LngLat {
	const b = bearing * RAD;
	const dLat = (meters * Math.cos(b)) / EARTH_RADIUS / RAD;
	const dLon = (meters * Math.sin(b)) / (EARTH_RADIUS * Math.cos(from[1] * RAD)) / RAD;
	return [from[0] + dLon, from[1] + dLat];
}

/** Richtung von a nach b in Grad (0 = Norden, 90 = Osten) */
export function bearing(a: LngLat, b: LngLat): number {
	const y = Math.sin((b[0] - a[0]) * RAD) * Math.cos(b[1] * RAD);
	const x =
		Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) -
		Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos((b[0] - a[0]) * RAD);
	return (Math.atan2(y, x) / RAD + 360) % 360;
}

export function midpoint(a: LngLat, b: LngLat): LngLat {
	return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export interface Bounds {
	west: number;
	south: number;
	east: number;
	north: number;
}

export function boundsOf(lines: LngLat[][]): Bounds {
	const b = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
	for (const line of lines) {
		for (const [lon, lat] of line) {
			b.west = Math.min(b.west, lon);
			b.east = Math.max(b.east, lon);
			b.south = Math.min(b.south, lat);
			b.north = Math.max(b.north, lat);
		}
	}
	return b;
}

export function contains(bounds: Bounds, [lon, lat]: LngLat): boolean {
	return lon >= bounds.west && lon <= bounds.east && lat >= bounds.south && lat <= bounds.north;
}
