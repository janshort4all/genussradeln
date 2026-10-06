/**
 * Karte der großen Straßen (Autobahn bis Landes-/Kreisstraße der Klasse „secondary“) als feines Raster:
 * Zellen, deren Mitte höchstens ROADSIDE_M von einer solchen Straße entfernt liegt.
 * Damit erkennt die App Radwege, die zwar als eigener Weg eingetragen sind, aber direkt neben einer
 * großen Straße verlaufen (gefunden: Radweg 5–12 m neben der Rheinberger Straße in Moers).
 *
 * Ausgabe:
 *   static/data/roads.bin    zwei Ebenen mit je einem Bit pro Zelle (Zeile für Zeile), hintereinander, mit deflate-raw
 *                            gepackt: 0 = irgendeine große Straße, 1 = Autobahn/Kraftfahrstraße (lauter)
 *   static/data/roads.json   Ausdehnung und Zellgröße
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import type { Bounds, OsmElement } from '../lib/osm-file.ts';

const CELL_LON = 0.0003; // ≈ 21 m bei 51° N
const CELL_LAT = 0.0002; // ≈ 22 m
/** Abstand zur Straßenmitte, bis zu dem ein Weg als „neben der Straße“ gilt */
const ROADSIDE_M = 25;

export async function buildRoads(elements: OsmElement[], bounds: Bounds) {
	const width = Math.ceil((bounds.east - bounds.west) / CELL_LON);
	const height = Math.ceil((bounds.north - bounds.south) / CELL_LAT);
	const layerBytes = Math.ceil((width * height) / 8);
	const bits = new Uint8Array(layerBytes * 2);
	const kx = Math.cos((((bounds.north + bounds.south) / 2) * Math.PI) / 180) * 111_320;
	const ky = 110_540;
	const reach = ROADSIDE_M / kx / CELL_LON + 1;

	let marked = 0;
	for (const e of elements) {
		if (e.type !== 'way' || !e.geometry || e.tags?.tunnel === 'yes') continue;
		const g = e.geometry;
		const motorway = /^(motorway|trunk)/.test(e.tags?.highway ?? '');
		for (let i = 1; i < g.length; i++) {
			const a = g[i - 1];
			const b = g[i];
			const c0 = Math.floor((Math.min(a.lon, b.lon) - bounds.west) / CELL_LON - reach);
			const c1 = Math.ceil((Math.max(a.lon, b.lon) - bounds.west) / CELL_LON + reach);
			const r0 = Math.floor((bounds.north - Math.max(a.lat, b.lat)) / CELL_LAT - reach);
			const r1 = Math.ceil((bounds.north - Math.min(a.lat, b.lat)) / CELL_LAT + reach);
			for (let r = Math.max(0, r0); r <= Math.min(height - 1, r1); r++) {
				const lat = bounds.north - (r + 0.5) * CELL_LAT;
				for (let c = Math.max(0, c0); c <= Math.min(width - 1, c1); c++) {
					const lon = bounds.west + (c + 0.5) * CELL_LON;
					// Abstand Zellmitte – Straßenstück (lokal flach gerechnet)
					const ax = (a.lon - lon) * kx;
					const ay = (a.lat - lat) * ky;
					const dx = (b.lon - a.lon) * kx;
					const dy = (b.lat - a.lat) * ky;
					const len2 = dx * dx + dy * dy;
					const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
					if (Math.hypot(ax + t * dx, ay + t * dy) > ROADSIDE_M) continue;
					const i2 = r * width + c;
					if (!(bits[i2 >> 3] & (1 << (i2 & 7)))) {
						bits[i2 >> 3] |= 1 << (i2 & 7);
						marked++;
					}
					if (motorway) bits[layerBytes + (i2 >> 3)] |= 1 << (i2 & 7);
				}
			}
		}
	}

	const packed = deflateRawSync(bits, { level: 9 });
	await writeFile(new URL('../../static/data/roads.bin', import.meta.url), packed);
	await writeFile(
		new URL('../../static/data/roads.json', import.meta.url),
		JSON.stringify({
			west: bounds.west,
			north: bounds.north,
			cellLon: CELL_LON,
			cellLat: CELL_LAT,
			width,
			height,
			roadsideM: ROADSIDE_M,
			layers: 2,
			source: '© OpenStreetMap-Mitwirkende (ODbL)',
			created: new Date().toISOString().slice(0, 10)
		}) + '\n'
	);
	console.log(
		`Fertig: static/data/roads.bin (${Math.round(packed.length / 1024)} KB, ${width} × ${height} Zellen, ${marked} an großen Straßen)`
	);
}
