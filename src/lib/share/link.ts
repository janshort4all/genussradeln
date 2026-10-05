/**
 * Tour als Link (F15): Die Tour steckt gepackt im Link hinter dem „#“. Dieser Teil wird nie an einen Server
 * geschickt; es braucht kein Konto und nichts wird gespeichert.
 *
 * Fassung 2 (kurz, ca. 300 Zeichen): nur Start, Ziel und Stützpunkte alle ca. 2 km – das Handy des Empfängers
 * rechnet den Weg mit der Wegberechnung nach (rebuild.ts). Fassung 1 (lang, ganze Strecke) wird weiter gelesen.
 */
import { distance, type LngLat } from '$lib/geo/geo';
import type { RouteInstruction } from '$lib/routing/graphhopper';
import type { PlannedTour, ReturnMode, Waypoint } from '$lib/tour/model';

/** Die Online-Adresse der App – Links vom PC (localhost) sollen am Handy funktionieren */
export const PUBLIC_APP_URL = 'https://janshort4all.github.io/genussradeln/';

interface SharedLeg {
	/** Polyline (Google-Verfahren, 5 Nachkommastellen) */
	p: string;
	/** Höhen in ganzen Metern, als Differenzen */
	e: number[];
	d: number;
	/** Abbiegehinweise: [Index, Art, Straße?, Ausfahrt?] */
	i: [number, number, string?, number?][];
}

interface SharedTour {
	v: 1;
	id: string;
	t: string;
	l?: string;
	h: string;
	s: PlannedTour['stats'];
	m: number;
	x: number;
	q: PlannedTour['request'];
	w: [number, number, Waypoint['kind'], string?][];
	g: SharedLeg[];
}

// ---------- Polyline ----------

function encodeNumber(value: number): string {
	let v = value < 0 ? ~(value << 1) : value << 1;
	let out = '';
	while (v >= 0x20) {
		out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
		v >>= 5;
	}
	return out + String.fromCharCode(v + 63);
}

export function encodePolyline(points: LngLat[]): string {
	let lat = 0;
	let lon = 0;
	let out = '';
	for (const [x, y] of points) {
		const la = Math.round(y * 1e5);
		const lo = Math.round(x * 1e5);
		out += encodeNumber(la - lat) + encodeNumber(lo - lon);
		lat = la;
		lon = lo;
	}
	return out;
}

export function decodePolyline(text: string): LngLat[] {
	const points: LngLat[] = [];
	let index = 0;
	let lat = 0;
	let lon = 0;
	const next = () => {
		let result = 0;
		let shift = 0;
		let b: number;
		do {
			b = text.charCodeAt(index++) - 63;
			result |= (b & 0x1f) << shift;
			shift += 5;
		} while (b >= 0x20);
		return result & 1 ? ~(result >> 1) : result >> 1;
	};
	while (index < text.length) {
		lat += next();
		lon += next();
		points.push([lon / 1e5, lat / 1e5]);
	}
	return points;
}

// ---------- Packen (deflate + base64url) ----------

async function deflate(text: string): Promise<Uint8Array> {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<string> {
	const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	return new Response(stream).text();
}

function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
	const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// ---------- Tour ↔ Text ----------

const round5 = (v: number) => Math.round(v * 1e5) / 1e5;

/** Kurze Fassung: was der Empfänger braucht, um genau diesen Weg nachzurechnen */
export interface TourSpec {
	v: 2;
	id: string;
	t: string;
	l?: string;
	r: ReturnMode;
	/** Start und Ziel: [Name, Länge, Breite] (Ziel mit 1, wenn es ein Ort ist – „nach Kempen“) */
	s: [string, number, number];
	d: [string, number, number, number?];
	/** Mehrweg gegenüber dem direkten Weg (Meter) */
	x: number;
	/** je Abschnitt die Stützpunkte als Polyline (inkl. Anfang und Ende) */
	g: string[];
}

/** Abstand der Stützpunkte: eng genug, dass die Nachrechnung genau denselben Weg findet */
export const ANCHOR_SPACING_M = 2000;

/**
 * Anfang, dann etwa alle ANCHOR_SPACING_M Meter ein Punkt, dann das Ende. Die Punkte liegen immer in der Mitte
 * eines Wegstücks, nie auf einem Knick oder einer Kreuzung – dort könnte die Wegberechnung sie sonst an eine
 * querende Straße hängen (gefunden: 350 m hinein und wieder zurück).
 */
export function anchorsOf(line: LngLat[]): LngLat[] {
	const out: LngLat[] = [line[0]];
	let since = 0;
	for (let i = 1; i < line.length; i++) {
		const step = distance(line[i - 1], line[i]);
		since += step;
		if (since >= ANCHOR_SPACING_M && i < line.length - 1 && step > 2) {
			out.push([(line[i - 1][0] + line[i][0]) / 2, (line[i - 1][1] + line[i][1]) / 2]);
			since = 0;
		}
	}
	out.push(line[line.length - 1]);
	return out;
}

export async function packShort(tour: PlannedTour): Promise<string> {
	const { start, destination, returnMode } = tour.request;
	const spec: TourSpec = {
		v: 2,
		id: tour.id,
		t: tour.title,
		...(tour.label ? { l: tour.label } : {}),
		r: returnMode,
		s: [start.name, round5(start.lngLat[0]), round5(start.lngLat[1])],
		d: destination.settlement
			? [destination.name, round5(destination.lngLat[0]), round5(destination.lngLat[1]), 1]
			: [destination.name, round5(destination.lngLat[0]), round5(destination.lngLat[1])],
		x: Math.round(tour.extraDistance),
		g: tour.legs.map((leg) => encodePolyline(anchorsOf(leg.coordinates.map(([lon, lat]) => [lon, lat] as LngLat))))
	};
	return toBase64Url(await deflate(JSON.stringify(spec)));
}

/** Link lesen: fertige Tour (Fassung 1) oder Bauplan zum Nachrechnen (Fassung 2) */
export async function unpackShared(text: string): Promise<{ tour: PlannedTour } | { spec: TourSpec }> {
	const json = JSON.parse(await inflate(fromBase64Url(text)));
	if (json.v === 2) return { spec: json as TourSpec };
	return { tour: await unpackTour(text) };
}

export async function packTour(tour: PlannedTour): Promise<string> {
	const shared: SharedTour = {
		v: 1,
		id: tour.id,
		t: tour.title,
		...(tour.label ? { l: tour.label } : {}),
		h: tour.highlight,
		s: tour.stats,
		m: tour.minutes,
		x: Math.round(tour.extraDistance),
		q: tour.request,
		w: tour.waypoints.map(
			(w) => [round5(w.lngLat[0]), round5(w.lngLat[1]), w.kind, ...(w.name ? [w.name] : [])] as SharedTour['w'][number]
		),
		g: tour.legs.map((leg) => {
			let previous = 0;
			return {
				p: encodePolyline(leg.coordinates.map(([lon, lat]) => [lon, lat])),
				e: leg.coordinates.map(([, , ele]) => {
					const rounded = Math.round(ele ?? 0);
					const delta = rounded - previous;
					previous = rounded;
					return delta;
				}),
				d: Math.round(leg.distance),
				i: (leg.instructions ?? []).map((i) => {
					const row: SharedLeg['i'][number] = [i.index, i.sign];
					if (i.street || i.exit) row.push(i.street ?? '');
					if (i.exit) row.push(i.exit);
					return row;
				})
			};
		})
	};
	return toBase64Url(await deflate(JSON.stringify(shared)));
}

export async function unpackTour(text: string): Promise<PlannedTour> {
	const shared = JSON.parse(await inflate(fromBase64Url(text))) as SharedTour;
	if (shared.v !== 1) throw new Error('Unbekannte Link-Version');
	return {
		id: shared.id,
		title: shared.t,
		label: shared.l,
		highlight: shared.h,
		stats: shared.s,
		minutes: shared.m,
		extraDistance: shared.x,
		request: shared.q,
		shared: true,
		waypoints: shared.w.map(([lon, lat, kind, name]) => ({ lngLat: [lon, lat], kind, ...(name ? { name } : {}) })),
		legs: shared.g.map((leg) => {
			let ele = 0;
			const heights = leg.e.map((delta) => (ele += delta));
			return {
				coordinates: decodePolyline(leg.p).map(([lon, lat], i) => [lon, lat, heights[i] ?? 0] as [number, number, number]),
				distance: leg.d,
				instructions: leg.i.map(
					([index, sign, street, exit]): RouteInstruction => ({
						index,
						sign,
						...(street ? { street } : {}),
						...(exit ? { exit } : {})
					})
				)
			};
		})
	};
}

/**
 * Der fertige Link: Läuft die App gerade vom PC (localhost oder im WLAN, also ohne https),
 * zeigt er auf die Online-App – nur dort funktionieren Standort und Navigation am Handy.
 */
export async function shareUrl(tour: PlannedTour, sharedPagePath: string): Promise<string> {
	const page =
		location.protocol === 'https:' ? new URL(sharedPagePath, location.origin) : new URL('geteilt', PUBLIC_APP_URL);
	return `${page.href}#${await packShort(tour)}`;
}
