import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FINE_E4, TILE_CELLS, tileEast, tileNorth, tileOf, tileWest } from './grid';
import { COARSE_BYTES, decodeTile, encodeTile, FINE_LAYER_BYTES, type TileData } from './tile-format';
import { joinStreams, TileStore } from './tiles';

function emptyTile(x: number, y: number): TileData {
	return {
		x,
		y,
		coarse: new Uint8Array(COARSE_BYTES),
		fine: new Uint8Array(3 * FINE_LAYER_BYTES),
		roads: new Uint8Array(2 * FINE_LAYER_BYTES),
		pois: [],
		landmarks: { names: [], points: [] },
		places: [],
		streams: []
	};
}

/** Bit einer Ebene in der Kachel setzen (Zeile, Spalte von links oben) */
function setFine(t: TileData, layer: number, row: number, col: number, target: 'fine' | 'roads' = 'fine') {
	const i = row * TILE_CELLS.fine.width + col;
	t[target][layer * FINE_LAYER_BYTES + (i >> 3)] |= 1 << (i & 7);
}

function serve(tiles: TileData[]) {
	const files = new Map(tiles.map((t) => [`${t.x}_${t.y}.tile`, deflateRawSync(encodeTile(t))]));
	const manifest = { dir: 'v1', tiles: Object.fromEntries([...files].map(([k, v]) => [k.replace('.tile', ''), v.length])), kinds: ['cafe', 'eis'] };
	const calls: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			calls.push(url);
			const name = url.split('/').pop()!;
			if (name === 'index.json') return new Response(JSON.stringify(manifest));
			const file = files.get(name);
			return file ? new Response(file) : new Response('nicht da', { status: 404 });
		})
	);
	return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('Kachelformat', () => {
	it('gibt eine Kachel unverändert zurück', () => {
		const t = emptyTile(24, 285);
		t.coarse[5] = 3;
		setFine(t, 2, 10, 20);
		t.pois = [[600000, 5150000, 0, 1, 'Café Eck', 'Mo-Su 10:00-18:00']];
		t.places = [[60000, 51500, 1, 'Moers']];
		t.landmarks = { names: [['Rhein', 'river']], points: [[60100, 51400, 0]] };
		t.streams = [{ id: 3, seq: 0, name: 'Moersbach', line: '_p~iF~ps|U' }];
		const back = decodeTile(encodeTile(t));
		expect(back.x).toBe(24);
		expect(back.coarse[5]).toBe(3);
		expect(back.fine).toEqual(t.fine);
		expect(back.pois).toEqual(t.pois);
		expect(back.landmarks).toEqual(t.landmarks);
		expect(back.streams).toEqual(t.streams);
	});
});

describe('Kacheln zu Karten zusammensetzen', () => {
	// zwei Kacheln nebeneinander (Ost-West) und eine darüber
	const a = emptyTile(24, 285);
	const b = emptyTile(25, 285);
	const c = emptyTile(24, 286);

	it('findet Werte an der richtigen Stelle, auch über Kachelgrenzen', async () => {
		// Zelle (Zeile 3, Spalte 7) der Kachel b: grob = Wald
		b.coarse[3 * TILE_CELLS.coarse.width + 7] = 3;
		// feine Zelle (Zeile 100, Spalte 50) der Kachel a: Wasser; feine Zelle in c ganz unten links: Wald; Straße in b
		setFine(a, 2, 100, 50);
		setFine(c, 0, TILE_CELLS.fine.height - 1, 0);
		setFine(b, 0, 40, 0, 'roads');
		serve([a, b, c]);
		const area = await new TileStore('/tiles').area([a, b, c].map((t) => ({ x: t.x, y: t.y })));

		const lonOf = (x: number, col: number, cell: number) => tileWest(x) + (col + 0.5) * (cell / 1e4);
		const latOf = (y: number, row: number, cell: number) => tileNorth(y) - (row + 0.5) * (cell / 1e4);
		expect(area.landscape!.classAt([lonOf(25, 7, 15), latOf(285, 3, 9)])).toBe(3);
		expect(area.landscape!.classAt([lonOf(24, 7, 15), latOf(285, 3, 9)])).toBe(0);
		expect(area.fine!.isWater([lonOf(24, 50, FINE_E4.lon), latOf(285, 100, FINE_E4.lat)])).toBe(true);
		expect(area.fine!.isWater([lonOf(25, 50, FINE_E4.lon), latOf(285, 100, FINE_E4.lat)])).toBe(false);
		expect(area.fine!.woodDepth([lonOf(24, 0, FINE_E4.lon), latOf(286, TILE_CELLS.fine.height - 1, FINE_E4.lat)])).toBeDefined();
		expect(area.roads!.near([lonOf(25, 0, FINE_E4.lon), latOf(285, 40, FINE_E4.lat)])).toBe(true);
		expect(area.roads!.near([lonOf(24, 0, FINE_E4.lon), latOf(285, 40, FINE_E4.lat)])).toBe(false);
		expect(area.tiles.sort()).toEqual(['24_285', '24_286', '25_285']);
	});

	it('lässt fehlende Kacheln leer und lädt jede Kachel nur einmal', async () => {
		const calls = serve([a]);
		const store = new TileStore('/tiles');
		const area = await store.area([{ x: 24, y: 285 }, { x: 40, y: 285 }]);
		expect(area.tiles).toEqual(['24_285']);
		await store.area([{ x: 24, y: 285 }]);
		expect(calls.filter((u) => u.endsWith('24_285.tile'))).toHaveLength(1);
		expect(calls.filter((u) => u.endsWith('index.json'))).toHaveLength(1);
		// Gebiet ganz ohne Daten
		const none = await store.area([{ x: 1, y: 1 }]);
		expect(none.tiles).toEqual([]);
		expect(none.landscape).toBeUndefined();
	});

	it('baut Namen und Stopps aus den Kacheln', async () => {
		const t = emptyTile(24, 285);
		const lon = tileWest(24) + 0.05;
		const lat = tileNorth(285) - 0.05;
		t.landmarks = { names: [['Rhein', 'river']], points: [[Math.round(lon * 1e4), Math.round(lat * 1e4), 0]] };
		t.places = [[Math.round(lon * 1e4), Math.round(lat * 1e4), 1, 'Moers']];
		t.pois = [[Math.round(lon * 1e5), Math.round(lat * 1e5), 1, 0, 'Eisdiele']];
		serve([t]);
		const area = await new TileStore('/tiles').area([{ x: 24, y: 285 }]);
		expect(area.names!.landmarks.nearest([lon, lat], 200)?.name).toBe('Rhein');
		expect(area.names!.places.nearest([lon, lat], 200)?.name).toBe('Moers');
		expect(area.pois!.near([lon, lat], 100).map((p) => [p.kind, p.name])).toEqual([['eis', 'Eisdiele']]);
		expect(tileOf([lon, lat])).toEqual({ x: 24, y: 285 });
		void tileEast;
	});
});

describe('Gewässer', () => {
	// Linie von West nach Ost über drei Stücke; Nachbarpunkte überlappen (siehe build-tiles.ts)
	const enc = (pts: [number, number][]) => {
		let out = '';
		let lat = 0;
		let lon = 0;
		const put = (n: number) => {
			let v = n < 0 ? ~(n << 1) : n << 1;
			while (v >= 0x20) {
				out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
				v >>= 5;
			}
			out += String.fromCharCode(v + 63);
		};
		for (const [x, y] of pts) {
			const nLat = Math.round(y * 1e5);
			const nLon = Math.round(x * 1e5);
			put(nLat - lat);
			put(nLon - lon);
			lat = nLat;
			lon = nLon;
		}
		return out;
	};
	const line: [number, number][] = [
		[6.0, 51.0],
		[6.1, 51.0],
		[6.2, 51.0],
		[6.3, 51.0],
		[6.4, 51.0],
		[6.5, 51.0]
	];
	const pieces = [
		{ id: 1, seq: 0, name: 'Bach', line: enc(line.slice(0, 3)) }, // Punkte 0,1 + Nachbar 2
		{ id: 1, seq: 1, name: 'Bach', line: enc(line.slice(1, 5)) }, // Nachbar 1, eigene 2,3, Nachbar 4
		{ id: 1, seq: 2, name: 'Bach', line: enc(line.slice(3, 6)) } // Nachbar 3, eigene 4,5
	];

	it('verbindet aufeinanderfolgende Stücke wieder zu einer Linie', () => {
		const joined = joinStreams(pieces);
		expect(joined).toHaveLength(1);
		expect(joined[0].line.map(([x]) => +x.toFixed(1))).toEqual([6.0, 6.1, 6.2, 6.3, 6.4, 6.5]);
	});

	it('lässt die Linie getrennt, wenn eine Kachel fehlt', () => {
		const joined = joinStreams([pieces[0], pieces[2]]);
		expect(joined).toHaveLength(2);
	});
});
