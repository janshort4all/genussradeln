/**
 * Vergleich der gebauten Kacheln (static/tiles, `npm run tiles`) mit den alten Gesamt-Dateien (static/data) an Stichproben –
 * fängt Verschiebungen und vertauschte Zeilen/Spalten ab. Läuft nur, wenn beides gebaut vorliegt (sonst übersprungen).
 */
import { existsSync, readFileSync } from 'node:fs';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { FineMap } from '$lib/scoring/fine';
import { Landscape } from '$lib/scoring/landscape';
import { RoadMask } from '$lib/scoring/roads';
import { tileOf } from './grid';
import { TileStore } from './tiles';

const root = new URL('../../../static/', import.meta.url);
const ready = existsSync(new URL('tiles/index.json', root)) && existsSync(new URL('data/fine.bin', root));

/** 8-Bit-Graustufen-PNG lesen (so wie scripts/lib/png.ts es schreibt) */
function readGrayPng(path: URL): { width: number; height: number; pixels: Uint8Array } {
	const bytes = readFileSync(path);
	let at = 8;
	let width = 0;
	let height = 0;
	const parts: Buffer[] = [];
	while (at < bytes.length) {
		const length = bytes.readUInt32BE(at);
		const type = bytes.toString('latin1', at + 4, at + 8);
		const data = bytes.subarray(at + 8, at + 8 + length);
		if (type === 'IHDR') {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
		} else if (type === 'IDAT') parts.push(data);
		at += 12 + length;
	}
	const raw = inflateSync(Buffer.concat(parts));
	const pixels = new Uint8Array(width * height);
	const stride = width + 1;
	for (let r = 0; r < height; r++) {
		const filter = raw[r * stride];
		for (let c = 0; c < width; c++) {
			const x = raw[r * stride + 1 + c];
			const left = c ? pixels[r * width + c - 1] : 0;
			const up = r ? pixels[(r - 1) * width + c] : 0;
			const upLeft = r && c ? pixels[(r - 1) * width + c - 1] : 0;
			const paeth = () => {
				const p = left + up - upLeft;
				const pa = Math.abs(p - left);
				const pb = Math.abs(p - up);
				const pc = Math.abs(p - upLeft);
				return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
			};
			pixels[r * width + c] = (x + (filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : paeth())) & 255;
		}
	}
	return { width, height, pixels };
}

describe.skipIf(!ready)('Kacheln gegen die alten Gesamt-Dateien', () => {
	it('stimmen an Stichproben überein', async () => {
		const read = (name: string) => JSON.parse(readFileSync(new URL(`data/${name}`, root), 'utf8'));
		const oldCoarseMeta = read('landscape.json');
		const png = readGrayPng(new URL('data/landscape.png', root));
		const oldCoarse = new Landscape(
			oldCoarseMeta,
			png.pixels.map((v: number) => Math.round(v / oldCoarseMeta.step))
		);
		const oldFine = new FineMap(read('fine.json'), new Uint8Array(inflateRawSync(readFileSync(new URL('data/fine.bin', root)))));
		const oldRoads = new RoadMask(read('roads.json'), new Uint8Array(inflateRawSync(readFileSync(new URL('data/roads.bin', root)))));

		const index = JSON.parse(readFileSync(new URL('tiles/index.json', root), 'utf8'));
		vi.stubGlobal('fetch', async (url: string) => {
			const file = url.replace('/tiles/', '');
			return new Response(file === 'index.json' ? readFileSync(new URL(`tiles/${file}`, root)) : readFileSync(new URL(`tiles/${file}`, root)));
		});
		const ids = Object.keys(index.tiles).map((k) => {
			const [x, y] = k.split('_').map(Number);
			return { x, y };
		});
		const area = await new TileStore('/tiles').area(ids);
		vi.unstubAllGlobals();
		expect(area.tiles.length).toBe(ids.length);

		// Stichprobe: gleichmäßig verteilte Punkte im Gebiet der alten Karten
		let seed = 7;
		const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
		const confusion: Record<string, number> = {};
		const stats = { interior: 0, interiorSame: 0, n: 0, coarse: 0, forest: 0, water: 0, road: 0, forestN: 0, waterN: 0, roadN: 0, covered: 0 };
		for (let i = 0; i < 60000; i++) {
			const lon = oldCoarse.meta.west + rnd() * (oldCoarse.east - oldCoarse.meta.west);
			const lat = oldCoarse.south + rnd() * (oldCoarse.meta.north - oldCoarse.south);
			if (!index.tiles[`${tileOf([lon, lat]).x}_${tileOf([lon, lat]).y}`]) continue;
			// der alte Auszug deckt nur den Regierungsbezirk ab; der Rest seines Rechtecks ist leer – dort können die Kacheln (NRW) mehr wissen
			const here = oldCoarse.classAt([lon, lat]);
			if (here === 0) continue;
			stats.n++;
			if (here === area.landscape!.classAt([lon, lat])) stats.coarse++;
			// Zellen, deren Nachbarn (3 × 3) alle gleich sind: dort darf die Verschiebung der Zellgrenzen nichts ändern
			const row = oldCoarse.rowOf(lat);
			const col = oldCoarse.colOf(lon);
			let uniform = true;
			for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (oldCoarse.cell(row + dr, col + dc) !== here) uniform = false;
			if (uniform) {
				const k = `${here}->${area.landscape!.classAt([lon, lat])}`;
				confusion[k] = (confusion[k] ?? 0) + 1;
				stats.interior++;
				if (here === area.landscape!.classAt([lon, lat])) stats.interiorSame++;
			}
			const ow = oldFine.isWater([lon, lat]);
			const of = !!oldFine.woodDepth([lon, lat]);
			const or = oldRoads.near([lon, lat]);
			if (ow) stats.waterN++;
			if (of) stats.forestN++;
			if (or) stats.roadN++;
			if (ow === area.fine!.isWater([lon, lat])) stats.water++;
			if (of === !!area.fine!.woodDepth([lon, lat])) stats.forest++;
			if (or === area.roads!.near([lon, lat])) stats.road++;
		}
		console.log('Kachel-Vergleich', stats);
		void confusion;
		expect(stats.n).toBeGreaterThan(5000);
		// Zellgrenzen liegen anders (anderer Ursprung) – nur Ränder dürfen abweichen
		// Mit Kacheln aus demselben Auszug wie die alten Dateien (Düsseldorf) stimmen innere Zellen zu > 99 % überein; mit Kacheln aus dem NRW-Auszug
		// (neuerer Stand, 11.10. statt 2.10., ganze Flächen statt am Rand abgeschnitten) weichen einige Prozent ab
		expect(stats.interiorSame / stats.interior).toBeGreaterThan(0.93);
		expect(stats.coarse / stats.n).toBeGreaterThan(0.7);
		expect(stats.water / stats.n).toBeGreaterThan(0.95);
		expect(stats.forest / stats.n).toBeGreaterThan(0.9);
		expect(stats.road / stats.n).toBeGreaterThan(0.97);
		// und es gibt überhaupt Wasser, Wald, Straßen in der Stichprobe
		expect(stats.waterN).toBeGreaterThan(50);
		expect(stats.forestN).toBeGreaterThan(500);
		expect(stats.roadN).toBeGreaterThan(50);
	}, 120_000);
});
