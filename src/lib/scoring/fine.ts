/**
 * Feine Karte von Wald, Parks und Wasser (Zellen ≈ 21 m, erzeugt von scripts/data/fine.ts). Die grobe Landschaftskarte
 * (≈ 100 m) sagt nur „in der Nähe“; hier lässt sich sagen, ob ein Weg MITTEN im Wald oder Park verläuft und ob er
 * direkt am Wasser liegt (Wunsch Jan, 10.10.2026: durch Parks und Wälder fahren, am See entlang).
 */
import type { LngLat } from '$lib/geo/geo';

export interface FineMeta {
	west: number;
	north: number;
	cellLon: number;
	cellLat: number;
	width: number;
	height: number;
	layers: string[];
}

export type WoodKind = 'forest' | 'green';

/**
 * Abstände in Zellen, in denen die Umgebung ebenfalls Wald/Grün sein muss (in alle vier Richtungen):
 * je erfüllte Stufe ein Drittel Tiefe. Am Waldrand (Weg höchstens ein paar Meter drin) bleibt es bei ≤ ⅓,
 * in einem schmalen Park bei ⅔, mitten im Wald bei 1.
 */
const DEPTH_STEPS = [0, 2, 4];

export class FineMap {
	private readonly layerBytes: number;
	private readonly forest: number;
	private readonly green: number;
	private readonly water: number;

	constructor(
		readonly meta: FineMeta,
		private readonly bits: Uint8Array
	) {
		this.layerBytes = Math.ceil((meta.width * meta.height) / 8);
		this.forest = meta.layers.indexOf('forest');
		this.green = meta.layers.indexOf('green');
		this.water = meta.layers.indexOf('water');
	}

	private bit(layer: number, row: number, col: number): boolean {
		const { width, height } = this.meta;
		if (layer < 0 || row < 0 || col < 0 || row >= height || col >= width) return false;
		const i = row * width + col;
		return (this.bits[layer * this.layerBytes + (i >> 3)] & (1 << (i & 7))) !== 0;
	}

	private rowOf(lat: number) {
		return Math.floor((this.meta.north - lat) / this.meta.cellLat);
	}

	private colOf(lon: number) {
		return Math.floor((lon - this.meta.west) / this.meta.cellLon);
	}

	private woodAt(row: number, col: number): boolean {
		return this.bit(this.forest, row, col) || this.bit(this.green, row, col);
	}

	/**
	 * Wie mitten im Wald oder Grünen (Park, Wiese, Heide) liegt der Punkt? 0 … 1, siehe DEPTH_STEPS.
	 * `undefined`, wenn er selbst weder in Wald noch in Grün liegt.
	 */
	woodDepth([lon, lat]: LngLat): { kind: WoodKind; depth: number } | undefined {
		const row = this.rowOf(lat);
		const col = this.colOf(lon);
		const kind: WoodKind | undefined = this.bit(this.forest, row, col)
			? 'forest'
			: this.bit(this.green, row, col)
				? 'green'
				: undefined;
		if (!kind) return undefined;
		let steps = 1;
		for (const d of DEPTH_STEPS.slice(1)) {
			if (this.woodAt(row - d, col) && this.woodAt(row + d, col) && this.woodAt(row, col - d) && this.woodAt(row, col + d))
				steps++;
			else break;
		}
		return { kind, depth: steps / DEPTH_STEPS.length };
	}

	/** Liegt Wasser höchstens `radiusCells` Zellen (≈ 21 m je Zelle) vom Punkt entfernt? */
	nearWater([lon, lat]: LngLat, radiusCells: number): boolean {
		const row = this.rowOf(lat);
		const col = this.colOf(lon);
		for (let dr = -radiusCells; dr <= radiusCells; dr++) {
			for (let dc = -radiusCells; dc <= radiusCells; dc++) {
				if (this.bit(this.water, row + dr, col + dc)) return true;
			}
		}
		return false;
	}
}

let loading: Promise<FineMap> | undefined;

/** Feine Karte einmalig laden (ca. 1 MB gepackt, 10 MB entpackt) */
export function loadFineMap(metaUrl: string, binUrl: string): Promise<FineMap> {
	loading ??= (async () => {
		const [metaResponse, binResponse] = await Promise.all([fetch(metaUrl), fetch(binUrl)]);
		if (!metaResponse.ok || !binResponse.ok || !binResponse.body) throw new Error('Feine Karte nicht gefunden');
		const meta: FineMeta = await metaResponse.json();
		const unpacked = binResponse.body.pipeThrough(new DecompressionStream('deflate-raw'));
		return new FineMap(meta, new Uint8Array(await new Response(unpacked).arrayBuffer()));
	})();
	loading.catch(() => (loading = undefined));
	return loading;
}
