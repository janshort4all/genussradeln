/**
 * Welche Kacheln braucht ein Wunsch? Die Planung sucht schöne Stellen nur innerhalb der Umweg-Ellipse um Start und Ziel
 * (Summe der Abstände ≤ ca. 2 × Luftlinie + 2,4 km, siehe plan.ts: maxLength / roadFactor) bzw. bei einer Runde in einem Kreis
 * um den Start – nur dort müssen Karten geladen werden.
 */
import { distance, type LngLat } from '$lib/geo/geo';
import type { TourRequest } from '$lib/tour/model';
import { tileEast, tileNorth, tileOf, tileSouth, tileWest, tilesInBox, type TileId } from './grid';

/** Punkte je Kachel und Richtung, an denen geprüft wird, ob sie im Gebiet liegt (Abstand ca. 3–4 km) */
const SAMPLES = 6;

function boxAround(centre: LngLat, radiusM: number): [number, number, number, number] {
	const dLat = radiusM / 110_540;
	const dLon = radiusM / (111_320 * Math.cos((centre[1] * Math.PI) / 180));
	return [centre[0] - dLon, centre[1] - dLat, centre[0] + dLon, centre[1] + dLat];
}

/** Kacheln, in denen mindestens ein Prüfpunkt die Bedingung erfüllt */
function tilesWhere(box: [number, number, number, number], inside: (p: LngLat) => boolean): TileId[] {
	const out: TileId[] = [];
	for (const id of tilesInBox(...box)) {
		let hit = false;
		for (let i = 0; i < SAMPLES && !hit; i++) {
			for (let j = 0; j < SAMPLES && !hit; j++) {
				const lon = tileWest(id.x) + ((tileEast(id.x) - tileWest(id.x)) * (i + 0.5)) / SAMPLES;
				const lat = tileSouth(id.y) + ((tileNorth(id.y) - tileSouth(id.y)) * (j + 0.5)) / SAMPLES;
				hit = inside([lon, lat]);
			}
		}
		if (hit) out.push(id);
	}
	return out;
}

const unique = (ids: TileId[]): TileId[] => [...new Map(ids.map((t) => [`${t.x}_${t.y}`, t])).values()];

/** Kacheln der Umweg-Ellipse um zwei Orte; `sumM` = größte Summe der beiden Abstände */
export function ellipseTiles(from: LngLat, to: LngLat, sumM: number): TileId[] {
	const centre: LngLat = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
	const inside = (p: LngLat) => distance(p, from) + distance(p, to) <= sumM;
	return unique([...tilesWhere(boxAround(centre, sumM / 2 + 3000), inside), tileOf(from), tileOf(to)]);
}

/** Kacheln eines Kreises um einen Ort */
export function discTiles(centre: LngLat, radiusM: number): TileId[] {
	return unique([...tilesWhere(boxAround(centre, radiusM + 3000), (p) => distance(p, centre) <= radiusM), tileOf(centre)]);
}

/** Gebiet einer Runde: weiter als die halbe Länge kommt sie nicht vom Start weg; dazu Platz für die Suche nach schönen Stellen */
export const roundArea = (start: LngLat, km: number): TileId[] => discTiles(start, km * 500 + 3000);

/** Gebiet eines Wegs zum Ziel: Umweg-Ellipse (Summe der Abstände bis 2 × Luftlinie, mit Spielraum) */
export const goalArea = (start: LngLat, destination: LngLat): TileId[] =>
	ellipseTiles(start, destination, distance(start, destination) * 2.2 + 5000);

/** Kacheln, die ein Wunsch für die Planung braucht */
export function planningArea(request: TourRequest): TileId[] {
	const { start, destination, round } = request;
	return round ? roundArea(start.lngLat, round.km) : goalArea(start.lngLat, destination.lngLat);
}

/** Kacheln entlang einer Strecke bis `marginM` daneben (für Umwege und Stopps im Tourdetail) */
export function corridorTiles(line: LngLat[], marginM: number, stepM = 2500): TileId[] {
	const ids: TileId[] = [];
	let carried = stepM;
	for (let i = 0; i < line.length; i++) {
		if (i > 0) carried += distance(line[i - 1], line[i]);
		if (carried < stepM && i < line.length - 1) continue;
		carried = 0;
		ids.push(...tilesInBox(...boxAround(line[i], marginM)));
	}
	return unique(ids);
}
