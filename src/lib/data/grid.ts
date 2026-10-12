/**
 * Kachelraster für die Kartendaten (Landschaft, feine Karte, große Straßen, Stopps, Namen, Gewässer).
 * Feste Grenzen für ganz Europa – dieselbe Kachel hat immer dieselbe Adresse, egal wie groß das Gebiet ist.
 * Wird vom Datenbau (scripts/build-tiles.ts) und von der App (src/lib/data/tiles.ts) gleich benutzt.
 *
 * Alles in ganzen Zehntausendstel-Grad gerechnet, damit die Zellgrenzen genau auf den Kachelgrenzen liegen
 * (0,24° = 800 feine Zellen = 160 grobe Zellen, 0,18° = 900 feine = 200 grobe).
 */
import type { LngLat } from '$lib/geo/geo';

/** Kachelgröße in 1e-4 Grad (0,24° × 0,18° ≈ 17 × 20 km) */
export const TILE_E4 = { lon: 2400, lat: 1800 };
/** Zellgröße in 1e-4 Grad: grobe Landschaftskarte (≈ 100 m) und feine Karte/Straßenmaske (≈ 21 m) */
export const COARSE_E4 = { lon: 15, lat: 9 };
export const FINE_E4 = { lon: 3, lat: 2 };

/** Zellen je Kachel */
export const TILE_CELLS = {
	coarse: { width: TILE_E4.lon / COARSE_E4.lon, height: TILE_E4.lat / COARSE_E4.lat },
	fine: { width: TILE_E4.lon / FINE_E4.lon, height: TILE_E4.lat / FINE_E4.lat }
};

export interface TileId {
	x: number;
	y: number;
}

export interface TileRange {
	x0: number;
	x1: number;
	y0: number;
	y1: number;
}

export const tileKey = (id: TileId): string => `${id.x}_${id.y}`;

export function tileOf([lon, lat]: LngLat): TileId {
	return { x: Math.floor((lon * 1e4) / TILE_E4.lon), y: Math.floor((lat * 1e4) / TILE_E4.lat) };
}

/** Westgrenze der Kachel in Grad */
export const tileWest = (x: number): number => (x * TILE_E4.lon) / 1e4;
/** Nordgrenze der Kachel in Grad */
export const tileNorth = (y: number): number => ((y + 1) * TILE_E4.lat) / 1e4;
export const tileEast = (x: number): number => ((x + 1) * TILE_E4.lon) / 1e4;
export const tileSouth = (y: number): number => (y * TILE_E4.lat) / 1e4;

/** Alle Kacheln, die ein Rechteck (Grad) berühren */
export function tilesInBox(west: number, south: number, east: number, north: number): TileId[] {
	const a = tileOf([west, south]);
	const b = tileOf([east, north]);
	const out: TileId[] = [];
	for (let y = a.y; y <= b.y; y++) for (let x = a.x; x <= b.x; x++) out.push({ x, y });
	return out;
}

/** Kleinstes Rechteck aus ganzen Kacheln um eine Menge von Kacheln */
export function rangeOf(ids: TileId[]): TileRange {
	const range = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
	for (const { x, y } of ids) {
		range.x0 = Math.min(range.x0, x);
		range.x1 = Math.max(range.x1, x);
		range.y0 = Math.min(range.y0, y);
		range.y1 = Math.max(range.y1, y);
	}
	return range;
}
