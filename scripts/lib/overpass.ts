/**
 * Gemeinsamer Overpass-Abruf für die Datenskripte (Landschaft, Stopps).
 * Die öffentlichen Server sind oft ausgelastet: Die Region wird in Kacheln und jede Kachel in 2 × 2 Stücke
 * geteilt, fehlgeschlagene Anfragen werden mit Pause wiederholt, fertige Kacheln zwischengespeichert.
 * Daten: © OpenStreetMap-Mitwirkende, ODbL.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export const REGION = { west: 5.9, south: 51.0, east: 7.33, north: 51.92 };

const SERVERS = [
	'https://overpass-api.de/api/interpreter',
	'https://overpass.private.coffee/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter'
];

export interface OsmElement {
	type: 'node' | 'way' | 'relation';
	id: number;
	lat?: number;
	lon?: number;
	center?: { lat: number; lon: number };
	tags?: Record<string, string>;
	geometry?: { lat: number; lon: number }[];
	members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
}

/**
 * Lädt alle Kacheln der Region nacheinander. `body(bbox)` liefert den Abfrage-Teil ohne Kopf und Ausgabe,
 * `output` die Ausgabe-Anweisung (z. B. „out geom;“). `onTile` verarbeitet jede Kachel sofort.
 */
export async function loadRegionTiles(options: {
	cacheName: string;
	tiles: [number, number];
	body: (bbox: string) => string;
	output: string;
	onTile: (elements: OsmElement[], tx: number, ty: number) => void;
}) {
	const cacheDir = new URL(`../.cache/${options.cacheName}/`, import.meta.url);
	await mkdir(cacheDir, { recursive: true });
	const [tilesX, tilesY] = options.tiles;
	const tileW = (REGION.east - REGION.west) / tilesX;
	const tileH = (REGION.north - REGION.south) / tilesY;

	for (let ty = 0; ty < tilesY; ty++) {
		for (let tx = 0; tx < tilesX; tx++) {
			const cacheFile = new URL(`tile-${tx}-${ty}.json`, cacheDir);
			let elements: OsmElement[];
			try {
				elements = JSON.parse(await readFile(cacheFile, 'utf8')).elements;
			} catch {
				elements = [];
				const s = REGION.south + ty * tileH;
				const w = REGION.west + tx * tileW;
				for (let sy = 0; sy < 2; sy++) {
					for (let sx = 0; sx < 2; sx++) {
						const south = s + (sy * tileH) / 2;
						const west = w + (sx * tileW) / 2;
						const bbox = `${south},${west},${south + tileH / 2},${west + tileW / 2}`;
						const query = `[out:json][timeout:300];\n(\n${options.body(bbox)}\n);\n${options.output}`;
						elements.push(...(await queryOverpass(query, `${tx},${ty}/${sx}${sy}`)));
					}
				}
				await writeFile(cacheFile, JSON.stringify({ elements }));
			}
			options.onTile(elements, tx, ty);
		}
	}
}

async function queryOverpass(query: string, label: string): Promise<OsmElement[]> {
	for (let attempt = 0; attempt < 15; attempt++) {
		// Hauptserver bevorzugen, Ausweichserver nur jeder dritte Versuch
		const server = attempt % 3 === 2 ? SERVERS[1 + (((attempt / 3) | 0) % 2)] : SERVERS[0];
		try {
			const response = await fetch(server, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
					'User-Agent': 'Genuss-Radeln/0.1 (Testprojekt, einmaliger Export)'
				},
				body: 'data=' + encodeURIComponent(query),
				signal: AbortSignal.timeout(200_000)
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const json = await response.json();
			if (json.remark?.includes('error')) throw new Error(json.remark);
			return json.elements;
		} catch (error) {
			console.log(`  Stück ${label}: ${server} fehlgeschlagen (${(error as Error).message}), neuer Versuch …`);
			await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
		}
	}
	throw new Error(`Stück ${label} konnte nicht geladen werden.`);
}
