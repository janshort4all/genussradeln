/**
 * Landschaftskarte (Wasser / Wald / Grün) als Raster mit ca. 100 m Zellen.
 * Erzeugt von scripts/fetch-landscape.ts → static/data/landscape.png + landscape.json.
 */
import type { LngLat } from '$lib/geo/geo';

export const NONE = 0;
export const GREEN = 1;
export const FOREST = 2;
export const WATER = 3;

export interface LandscapeMeta {
	west: number;
	north: number;
	cellLon: number;
	cellLat: number;
	width: number;
	height: number;
}

/** Was in der Nähe eines Punkts liegt */
export interface Surroundings {
	water: boolean;
	forest: boolean;
	green: boolean;
}

export class Landscape {
	readonly meta: LandscapeMeta;
	private readonly cells: Uint8Array;
	/** Summenfelder für schnelle „Wie schön ist die Umgebung?“-Abfragen */
	private beautySum?: Float64Array;

	constructor(meta: LandscapeMeta, cells: Uint8Array) {
		if (cells.length !== meta.width * meta.height) throw new Error('Landschaftskarte: Größe passt nicht');
		this.meta = meta;
		this.cells = cells;
	}

	get south(): number {
		return this.meta.north - this.meta.height * this.meta.cellLat;
	}

	get east(): number {
		return this.meta.west + this.meta.width * this.meta.cellLon;
	}

	rowOf(lat: number): number {
		return Math.floor((this.meta.north - lat) / this.meta.cellLat);
	}

	colOf(lon: number): number {
		return Math.floor((lon - this.meta.west) / this.meta.cellLon);
	}

	/** Zellmittelpunkt */
	cellCenter(row: number, col: number): LngLat {
		return [
			this.meta.west + (col + 0.5) * this.meta.cellLon,
			this.meta.north - (row + 0.5) * this.meta.cellLat
		];
	}

	cell(row: number, col: number): number {
		if (row < 0 || row >= this.meta.height || col < 0 || col >= this.meta.width) return NONE;
		return this.cells[row * this.meta.width + col];
	}

	classAt([lon, lat]: LngLat): number {
		return this.cell(this.rowOf(lat), this.colOf(lon));
	}

	/**
	 * Landschaft im Umkreis von `radius` Zellen (1 Zelle ≈ 100 m).
	 * Ein Radweg am Ufer liegt selbst nicht im Wasser, aber daneben – daher der Umkreis.
	 */
	surroundings([lon, lat]: LngLat, radius = 1): Surroundings {
		const row = this.rowOf(lat);
		const col = this.colOf(lon);
		const out = { water: false, forest: false, green: false };
		for (let dr = -radius; dr <= radius; dr++) {
			for (let dc = -radius; dc <= radius; dc++) {
				const v = this.cell(row + dr, col + dc);
				if (v === WATER) out.water = true;
				else if (v === FOREST) out.forest = true;
				else if (v === GREEN) out.green = true;
			}
		}
		return out;
	}

	/**
	 * Schönheit der Umgebung (0..1): gewichteter Anteil schöner Zellen im Quadrat ±`radius` Zellen.
	 * Gewichte je Klasse (Grün, Wald, Wasser) siehe weights.ts.
	 */
	beautyAround(row: number, col: number, radius: number, classWeights: [number, number, number]): number {
		const sum = this.ensureBeautySum(classWeights);
		const w = this.meta.width;
		const r0 = Math.max(0, row - radius);
		const r1 = Math.min(this.meta.height - 1, row + radius);
		const c0 = Math.max(0, col - radius);
		const c1 = Math.min(w - 1, col + radius);
		if (r0 > r1 || c0 > c1) return 0;
		const at = (r: number, c: number) => (r < 0 || c < 0 ? 0 : sum[r * w + c]);
		const total = at(r1, c1) - at(r0 - 1, c1) - at(r1, c0 - 1) + at(r0 - 1, c0 - 1);
		return total / ((r1 - r0 + 1) * (c1 - c0 + 1));
	}

	private ensureBeautySum([green, forest, water]: [number, number, number]): Float64Array {
		if (this.beautySum) return this.beautySum;
		const { width, height } = this.meta;
		const weightOf = [0, green, forest, water];
		const sum = new Float64Array(width * height);
		for (let r = 0; r < height; r++) {
			let rowSum = 0;
			for (let c = 0; c < width; c++) {
				rowSum += weightOf[this.cells[r * width + c]];
				sum[r * width + c] = rowSum + (r > 0 ? sum[(r - 1) * width + c] : 0);
			}
		}
		this.beautySum = sum;
		return sum;
	}
}

let loading: Promise<Landscape> | undefined;

/** Lädt die Landschaftskarte einmalig (im Browser) */
export function loadLandscape(metaUrl: string, imageUrl: string): Promise<Landscape> {
	loading ??= (async () => {
		const [metaResponse, imageResponse] = await Promise.all([fetch(metaUrl), fetch(imageUrl)]);
		if (!metaResponse.ok || !imageResponse.ok) throw new Error('Landschaftskarte nicht gefunden');
		const meta: LandscapeMeta = await metaResponse.json();
		const bitmap = await createImageBitmap(await imageResponse.blob(), {
			colorSpaceConversion: 'none',
			premultiplyAlpha: 'none'
		});
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const context = canvas.getContext('2d', { willReadFrequently: true })!;
		context.drawImage(bitmap, 0, 0);
		const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
		const cells = new Uint8Array(bitmap.width * bitmap.height);
		// Graustufen 0 / 85 / 170 / 255 → Klassen 0..3
		for (let i = 0; i < cells.length; i++) cells[i] = Math.round(rgba[i * 4] / 85);
		return new Landscape(meta, cells);
	})();
	loading.catch(() => (loading = undefined));
	return loading;
}
