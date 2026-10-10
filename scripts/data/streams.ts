/**
 * Verläufe benannter Bäche, Flüsse und Kanäle – damit die Planung einem Gewässer über viele Kilometer folgen kann
 * („links dem Moersbach folgen“, Wunsch Jan, 10.10.2026). Die Orientierungspunkte in landmarks.json liegen nur alle
 * ≈ 400 m ungeordnet und reichen dafür nicht.
 *
 * Ausgabe: static/data/streams.json
 *   { lines: [[Name, kodierte Polylinie (Google-Format, 5 Nachkommastellen)], …] }
 * Wege gleichen Namens werden an den Enden zu langen Linien verbunden, kurze (< MIN_M) fallen weg, die Linien
 * werden auf ≈ SIMPLIFY_M vereinfacht.
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { writeFile } from 'node:fs/promises';
import type { Bounds, OsmElement } from '../lib/osm-file.ts';

type Point = [number, number]; // [lon, lat]

/** kürzere Gewässer taugen nicht zum Folgen */
const MIN_M = 2000;
const SIMPLIFY_M = 8;

const KX = 111_320 * Math.cos((51.4 * Math.PI) / 180);
const KY = 110_540;

function lineLength(line: Point[]): number {
	let sum = 0;
	for (let i = 1; i < line.length; i++) sum += Math.hypot((line[i][0] - line[i - 1][0]) * KX, (line[i][1] - line[i - 1][1]) * KY);
	return sum;
}

/** Douglas-Peucker */
function simplify(line: Point[], tolerance: number): Point[] {
	if (line.length < 3) return line;
	const keep = new Uint8Array(line.length);
	keep[0] = keep[line.length - 1] = 1;
	const stack: [number, number][] = [[0, line.length - 1]];
	while (stack.length) {
		const [a, b] = stack.pop()!;
		let worst = 0;
		let index = -1;
		const ax = line[a][0] * KX;
		const ay = line[a][1] * KY;
		const dx = line[b][0] * KX - ax;
		const dy = line[b][1] * KY - ay;
		const len2 = dx * dx + dy * dy;
		for (let i = a + 1; i < b; i++) {
			const px = line[i][0] * KX - ax;
			const py = line[i][1] * KY - ay;
			const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
			const d = Math.hypot(px - t * dx, py - t * dy);
			if (d > worst) {
				worst = d;
				index = i;
			}
		}
		if (worst > tolerance && index >= 0) {
			keep[index] = 1;
			stack.push([a, index], [index, b]);
		}
	}
	return line.filter((_, i) => keep[i]);
}

/** Google-Polylinie, 5 Nachkommastellen (wie src/lib/share/link.ts) */
function encode(points: Point[]): string {
	let out = '';
	let lat = 0;
	let lon = 0;
	const put = (value: number) => {
		let v = value < 0 ? ~(value << 1) : value << 1;
		while (v >= 0x20) {
			out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
			v >>= 5;
		}
		out += String.fromCharCode(v + 63);
	};
	for (const [x, y] of points) {
		const nLat = Math.round(y * 1e5);
		const nLon = Math.round(x * 1e5);
		put(nLat - lat);
		put(nLon - lon);
		lat = nLat;
		lon = nLon;
	}
	return out;
}

/** Wege an gleichen Endpunkten zu langen Linien verbinden */
function chain(parts: Point[][]): Point[][] {
	const same = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
	const open = parts.filter((p) => p.length > 1).map((p) => [...p]);
	const lines: Point[][] = [];
	while (open.length) {
		let line = open.shift()!;
		let extended = true;
		while (extended) {
			extended = false;
			for (let i = 0; i < open.length; i++) {
				const part = open[i];
				const end = line[line.length - 1];
				const start = line[0];
				if (same(part[0], end)) line = [...line, ...part.slice(1)];
				else if (same(part[part.length - 1], end)) line = [...line, ...part.slice(0, -1).reverse()];
				else if (same(part[part.length - 1], start)) line = [...part.slice(0, -1), ...line];
				else if (same(part[0], start)) line = [...part.slice(1).reverse(), ...line];
				else continue;
				open.splice(i, 1);
				extended = true;
				break;
			}
		}
		lines.push(line);
	}
	return lines;
}

export async function buildStreams(elements: OsmElement[], bounds: Bounds) {
	const byName = new Map<string, Point[][]>();
	for (const e of elements) {
		const name = e.tags?.name?.trim();
		if (!name || e.type !== 'way' || !e.geometry?.length) continue;
		const line = e.geometry.filter(Boolean).map((p): Point => [p.lon, p.lat]);
		if (line.some(([lon, lat]) => lon < bounds.west || lon > bounds.east || lat < bounds.south || lat > bounds.north)) continue;
		(byName.get(name) ?? byName.set(name, []).get(name)!).push(line);
	}
	const lines: [string, string][] = [];
	let points = 0;
	for (const [name, parts] of byName) {
		for (const line of chain(parts)) {
			if (lineLength(line) < MIN_M) continue;
			const simple = simplify(line, SIMPLIFY_M);
			points += simple.length;
			lines.push([name, encode(simple)]);
		}
	}
	const json = JSON.stringify({ lines, source: '© OpenStreetMap-Mitwirkende (ODbL)' });
	await writeFile(new URL('../../static/data/streams.json', import.meta.url), json + '\n');
	console.log(`Fertig: static/data/streams.json (${Math.round(json.length / 1024)} KB, ${lines.length} Gewässer, ${points} Punkte)`);
}
