/**
 * Erzeugt die benannten Orientierungspunkte für Weg-Titel wie „Am Rhein entlang“ oder „Durch den Stadtwald“:
 * Flüsse und Kanäle, größere Seen, Wälder, Parks und Naturschutzgebiete mit Namen.
 * Nutzt die bereits geladenen Overpass-Daten der Landschaftskarte (scripts/.cache/landscape) – kein neuer Download.
 *
 * Ausgabe: static/data/landmarks.json – kompakt:
 *   { names: [[Name, Art], …], points: [[lon·1e4, lat·1e4, Name-Index], …] }
 *   Art: river | lake | forest | park. Punkte liegen alle ca. 400 m entlang von Flüssen bzw. am Rand von Flächen.
 *
 * Aufruf: npm run data:landmarks   (nach npm run data:landscape)
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { REGION, type OsmElement } from './lib/overpass.ts';

type Point = [number, number];
type Kind = 'river' | 'lake' | 'forest' | 'park';

const SPACING_M = 400;
/** Mindestgröße (Länge bzw. Umfang in Metern), damit ein Name als Titel taugt */
const MIN_SIZE_M: Record<Kind, number> = { river: 3000, lake: 900, forest: 3000, park: 3000 };
/** Namen, die als Titel nichts taugen (Häfen, Vereinsgewässer, technische Becken) */
const SKIP_NAME = /hafen|angel|e\.\s?v\.|becken|klär|schönung|rückhalte|regenrück/i;
/** Seen nur, wenn der Name wie ein See klingt (sonst z. B. Firmen- oder Flurnamen) */
const LAKE_NAME = /see|weiher|teich|meer|maar|kolk|altarm|baggerloch/i;

const cacheDir = new URL('./.cache/landscape/', import.meta.url);
const byName = new Map<string, { kind: Kind; parts: Point[][] }>();
const seen = new Set<string>();

for (const file of await readdir(cacheDir)) {
	const { elements } = JSON.parse(await readFile(new URL(file, cacheDir), 'utf8')) as { elements: OsmElement[] };
	for (const e of elements) {
		const key = `${e.type}/${e.id}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const t = e.tags ?? {};
		const name = t.name?.trim();
		if (!name || SKIP_NAME.test(name)) continue;
		const kind = kindOf(t, name);
		if (!kind) continue;

		const parts =
			e.type === 'way'
				? [toPoints(e.geometry)]
				: (e.members ?? []).filter((m) => m.type === 'way' && m.role !== 'inner').map((m) => toPoints(m.geometry));
		const mapKey = `${kind}|${name}`;
		const entry = byName.get(mapKey) ?? { kind, parts: [] };
		entry.parts.push(...parts.filter((p) => p.length > 1));
		byName.set(mapKey, entry);
	}
}

const names: [string, Kind][] = [];
const points: [number, number, number][] = [];
for (const [mapKey, { kind, parts }] of byName) {
	const size = parts.reduce((sum, p) => sum + lineLength(p), 0);
	if (size < MIN_SIZE_M[kind]) continue;
	const index = names.push([mapKey.split('|')[1], kind]) - 1;
	// je Name höchstens ein Punkt pro Rasterzelle (≈ 400 m) und nur innerhalb der Testregion
	// (Flüsse wie Rhein und Maas kommen aus OSM in voller Länge)
	const taken = new Set<string>();
	for (const part of parts) {
		for (const [lon, lat] of sample(part, SPACING_M)) {
			if (lon < REGION.west || lon > REGION.east || lat < REGION.south || lat > REGION.north) continue;
			const k = `${Math.floor(lon / 0.0058)}:${Math.floor(lat / 0.0036)}`;
			if (taken.has(k)) continue;
			taken.add(k);
			points.push([Math.round(lon * 1e4), Math.round(lat * 1e4), index]);
		}
	}
	if (!taken.size) names.pop();
}

const json = JSON.stringify({ names, points, source: '© OpenStreetMap-Mitwirkende (ODbL)' });
await writeFile(new URL('../static/data/landmarks.json', import.meta.url), json + '\n');
const counts = names.reduce<Record<string, number>>((acc, [, k]) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {});
console.log(`Fertig: static/data/landmarks.json (${Math.round(json.length / 1024)} KB, ${points.length} Punkte)`, counts);

// ---------------------------------------------------------------------------

function kindOf(t: Record<string, string>, name: string): Kind | undefined {
	if (t.waterway === 'river' || t.waterway === 'canal') return 'river';
	if (t.natural === 'water' && (t.water === 'river' || t.water === 'canal')) return 'river';
	if (t.natural === 'water' && LAKE_NAME.test(name)) return 'lake';
	if (t.landuse === 'forest' || t.natural === 'wood') return 'forest';
	if (t.leisure === 'park' || t.leisure === 'nature_reserve') return 'park';
	return undefined;
}

function toPoints(geometry: { lat: number; lon: number }[] | undefined): Point[] {
	return (geometry ?? []).filter(Boolean).map((p) => [p.lon, p.lat]);
}

function dist(a: Point, b: Point): number {
	const rad = Math.PI / 180;
	const x = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * rad) * 111_320;
	const y = (b[1] - a[1]) * 110_540;
	return Math.hypot(x, y);
}

function lineLength(line: Point[]): number {
	let sum = 0;
	for (let i = 1; i < line.length; i++) sum += dist(line[i - 1], line[i]);
	return sum;
}

function sample(line: Point[], step: number): Point[] {
	const out: Point[] = [line[0]];
	let carried = 0;
	for (let i = 0; i + 1 < line.length; i++) {
		const len = dist(line[i], line[i + 1]);
		let pos = step - carried;
		while (pos <= len) {
			const t = pos / len;
			out.push([line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t]);
			pos += step;
		}
		carried = len - (pos - step);
	}
	return out;
}
