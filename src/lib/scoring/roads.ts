/**
 * Karte der großen Straßen (aus scripts/data/roads.ts): für jede ca. 20-m-Zelle, ob eine große Straße
 * (Autobahn bis „secondary“) höchstens ca. 25 m entfernt ist. Damit erkennt die App Radwege, die als eigener Weg
 * eingetragen sind, aber direkt neben der Straße verlaufen – dort ist es laut, auch wenn „Radweg“ dransteht.
 */
import type { LngLat } from '$lib/geo/geo';

export interface RoadMaskMeta {
	west: number;
	north: number;
	cellLon: number;
	cellLat: number;
	width: number;
	height: number;
	/** 2: zweite Ebene mit Autobahnen/Kraftfahrstraßen (ältere Dateien haben nur eine) */
	layers?: number;
}

export class RoadMask {
	constructor(
		readonly meta: RoadMaskMeta,
		private readonly bits: Uint8Array
	) {}

	/** Liegt der Punkt direkt an einer großen Straße? */
	near(point: LngLat): boolean {
		return this.bit(point, 0);
	}

	/** Liegt der Punkt direkt an einer Autobahn oder Kraftfahrstraße? */
	nearMotorway(point: LngLat): boolean {
		return (this.meta.layers ?? 1) > 1 && this.bit(point, 1);
	}

	private bit([lon, lat]: LngLat, layer: number): boolean {
		const { west, north, cellLon, cellLat, width, height } = this.meta;
		const c = Math.floor((lon - west) / cellLon);
		const r = Math.floor((north - lat) / cellLat);
		if (c < 0 || r < 0 || c >= width || r >= height) return false;
		const i = r * width + c;
		const offset = layer * Math.ceil((width * height) / 8);
		return (this.bits[offset + (i >> 3)] & (1 << (i & 7))) !== 0;
	}
}

let loading: Promise<RoadMask> | undefined;

/** Lädt die Straßenkarte einmalig (im Browser; ca. 230 KB, gepackt) */
export function loadRoadMask(metaUrl: string, binUrl: string): Promise<RoadMask> {
	loading ??= (async () => {
		const [metaResponse, binResponse] = await Promise.all([fetch(metaUrl), fetch(binUrl)]);
		if (!metaResponse.ok || !binResponse.ok || !binResponse.body) throw new Error('Straßenkarte nicht gefunden');
		const meta: RoadMaskMeta = await metaResponse.json();
		const unpacked = binResponse.body.pipeThrough(new DecompressionStream('deflate-raw'));
		const bits = new Uint8Array(await new Response(unpacked).arrayBuffer());
		return new RoadMask(meta, bits);
	})();
	loading.catch(() => (loading = undefined));
	return loading;
}
