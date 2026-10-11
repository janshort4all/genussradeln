/**
 * Die Strecke für die Navigation: alle Abschnitte (Hin- und ggf. Rückweg) aneinander, mit Kilometrierung
 * und den Abzweigungen. Beantwortet „Wo auf der Strecke bin ich?“ und „Was kommt als Nächstes?“.
 */
import { bearing, distance, type LngLat } from '$lib/geo/geo';
import type { DetailInterval, RouteInstruction } from '$lib/routing/graphhopper';

const RAD = Math.PI / 180;
const EARTH_RADIUS = 6371000;

/** Eine Abzweigung (oder das Ziel) an Meter `at` der Strecke */
export interface Maneuver {
	at: number;
	sign: number;
	street?: string;
	exit?: number;
	/** Art des Wegs, auf den man abbiegt, wenn er keinen Namen hat: „Feldweg“, „Radweg“, „schmalen Weg“ (für die Ansage) */
	way?: string;
	/** Nummer des Abschnitts (0 = Hinweg, 1 = Rückweg) */
	leg: number;
}

/**
 * Wie man einen Weg ohne Namen nennt (Straßenklasse laut OpenStreetMap). Nur Wege, bei denen das Abbiegen sonst unklar ist –
 * Straßen sind an Schildern und Häusern zu erkennen.
 */
export function wayName(roadClass: string | undefined): string | undefined {
	switch (roadClass) {
		case 'cycleway':
			return 'Radweg';
		case 'path':
			return 'schmalen Weg';
		case 'track':
			return 'Feldweg';
		case 'footway':
		case 'pedestrian':
			return 'Fußweg';
		default:
			return undefined;
	}
}

const intervalValue = <T>(intervals: DetailInterval<T>[] | undefined, index: number): T | undefined =>
	intervals?.find(([from, to]) => index >= from && index < to)?.[2];

/** Wo auf der Strecke ein Punkt liegt */
export interface Location {
	/** Meter ab Start entlang der Strecke */
	along: number;
	/** Abstand zur Strecke (Meter) */
	offset: number;
	/** nächster Punkt auf der Strecke */
	point: LngLat;
}

/** Keine echten Abzweigungen: „Straßenverlauf folgen“, Zwischenpunkt erreicht, Kreisverkehr verlassen */
const NOT_A_MANEUVER = new Set([0, 5, -6]);

export class RouteTrack {
	readonly points: LngLat[] = [];
	/** Meter ab Start bis Punkt i */
	readonly cum: number[] = [];
	readonly maneuvers: Maneuver[] = [];
	/** Meter, an denen ein Abschnitt endet (bei Hin- und Rückweg: das Ziel) */
	readonly legEnds: number[] = [];

	constructor(
		legs: {
			coordinates: [number, number, number?][] | LngLat[];
			instructions?: RouteInstruction[];
			/** Straßenklassen je Abschnitt – damit sich unbenannte Wege beschreiben lassen */
			details?: { road_class?: DetailInterval<string>[] };
		}[]
	) {
		legs.forEach((leg, legIndex) => {
			// der Rückweg beginnt dort, wo der Hinweg endet – den doppelten Punkt weglassen
			const skipFirst = this.points.length > 0 ? 1 : 0;
			const base = this.points.length - skipFirst;
			leg.coordinates.forEach(([lon, lat], i) => {
				if (i < skipFirst) return;
				const p: LngLat = [lon, lat];
				const prev = this.points[this.points.length - 1];
				this.cum.push(prev ? this.cum[this.cum.length - 1] + distance(prev, p) : 0);
				this.points.push(p);
			});
			this.legEnds.push(this.cum[this.cum.length - 1] ?? 0);
			for (const ins of leg.instructions ?? []) {
				if (NOT_A_MANEUVER.has(ins.sign)) continue;
				const index = Math.min(base + ins.index, this.cum.length - 1);
				// den Weg nach der Abzweigung benennen: der Abschnitt, der am Punkt der Abzweigung beginnt
				const way = ins.street ? undefined : wayName(intervalValue(leg.details?.road_class, Math.min(ins.index, leg.coordinates.length - 1)));
				this.maneuvers.push({ at: this.cum[index], sign: ins.sign, street: ins.street, exit: ins.exit, way, leg: legIndex });
			}
		});
		// fehlt das Ziel am Ende eines Abschnitts (ältere Touren ohne Hinweise), selbst ergänzen
		this.legEnds.forEach((end, leg) => {
			if (!this.maneuvers.some((m) => m.sign === 4 && m.leg === leg)) this.maneuvers.push({ at: end, sign: 4, leg });
		});
		this.maneuvers.sort((a, b) => a.at - b.at);
	}

	get total(): number {
		return this.cum[this.cum.length - 1] ?? 0;
	}

	get legCount(): number {
		return this.legEnds.length;
	}

	/**
	 * Nächster Punkt auf der Strecke. Gesucht wird nur im Fenster [from − back, from + ahead] (Meter) –
	 * so springt die Anzeige nicht auf den Rückweg, wenn der auf derselben Straße liegt.
	 */
	locate(p: LngLat, from = 0, ahead = Infinity, back = 0): Location | undefined {
		const kx = Math.cos(p[1] * RAD) * EARTH_RADIUS * RAD;
		const ky = EARTH_RADIUS * RAD;
		let best: Location | undefined;
		for (let i = 0; i + 1 < this.points.length; i++) {
			if (this.cum[i + 1] < from - back) continue;
			if (this.cum[i] > from + ahead) break;
			const a = this.points[i];
			const b = this.points[i + 1];
			const ax = (a[0] - p[0]) * kx;
			const ay = (a[1] - p[1]) * ky;
			const dx = (b[0] - a[0]) * kx;
			const dy = (b[1] - a[1]) * ky;
			const len2 = dx * dx + dy * dy;
			// Das Fenster gilt auch innerhalb eines langen geraden Stücks: nur der Teil davon, der im Fenster liegt
			const segLen = this.cum[i + 1] - this.cum[i];
			const lo = segLen > 0 ? Math.max(0, (from - back - this.cum[i]) / segLen) : 0;
			const hi = segLen > 0 ? Math.min(1, (from + ahead - this.cum[i]) / segLen) : 1;
			const t = len2 === 0 ? 0 : Math.max(lo, Math.min(hi, Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))));
			const offset = Math.hypot(ax + t * dx, ay + t * dy);
			if (!best || offset < best.offset) {
				best = {
					along: this.cum[i] + t * (this.cum[i + 1] - this.cum[i]),
					offset,
					point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
				};
			}
		}
		return best;
	}

	/**
	 * Die erste Stelle ab Meter `from` (höchstens `ahead` Meter weit), die höchstens `maxOffset` Meter von `p` entfernt ist –
	 * nicht die nächste überhaupt. Wer die Strecke verlassen hat und wieder auf sie trifft, schließt so an der nächsten
	 * Stelle an und nicht an einem viel späteren Stück, das zufällig auf derselben Straße liegt (Hin- und Rückweg).
	 */
	firstWithin(p: LngLat, from: number, ahead: number, maxOffset: number): Location | undefined {
		const kx = Math.cos(p[1] * RAD) * EARTH_RADIUS * RAD;
		const ky = EARTH_RADIUS * RAD;
		for (let i = 0; i + 1 < this.points.length; i++) {
			if (this.cum[i + 1] < from) continue;
			if (this.cum[i] > from + ahead) break;
			const a = this.points[i];
			const b = this.points[i + 1];
			const ax = (a[0] - p[0]) * kx;
			const ay = (a[1] - p[1]) * ky;
			const dx = (b[0] - a[0]) * kx;
			const dy = (b[1] - a[1]) * ky;
			const len2 = dx * dx + dy * dy;
			const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
			const offset = Math.hypot(ax + t * dx, ay + t * dy);
			if (offset <= maxOffset) {
				return {
					along: this.cum[i] + t * (this.cum[i + 1] - this.cum[i]),
					offset,
					point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
				};
			}
		}
		return undefined;
	}

	/** Punkt bei Meter `along` */
	pointAt(along: number): LngLat {
		const i = this.segmentAt(along);
		const a = this.points[i];
		const b = this.points[i + 1] ?? a;
		const len = (this.cum[i + 1] ?? this.cum[i]) - this.cum[i];
		const t = len > 0 ? (along - this.cum[i]) / len : 0;
		return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
	}

	/** Der Teil der Strecke von Meter `from` bis Meter `to` (mit den Eckpunkten dazwischen); leer, wenn kürzer als 1 m */
	segment(from: number, to: number): LngLat[] {
		const a = Math.max(0, Math.min(from, this.total));
		const b = Math.max(a, Math.min(to, this.total));
		if (b - a < 1) return [];
		const out: LngLat[] = [this.pointAt(a)];
		for (let i = this.segmentAt(a) + 1; i < this.points.length && this.cum[i] < b; i++) out.push(this.points[i]);
		out.push(this.pointAt(b));
		return out;
	}

	/** Fahrtrichtung bei Meter `along` (über die nächsten Meter geglättet), Grad ab Norden */
	bearingAt(along: number, lookAhead = 25): number {
		const from = this.pointAt(Math.max(0, Math.min(along, this.total - 1)));
		const to = this.pointAt(Math.min(this.total, along + lookAhead));
		return bearing(from, to);
	}

	/** Die nächste Abzweigung nach Meter `along` (das Ziel zählt mit) */
	nextManeuver(along: number): Maneuver | undefined {
		return this.maneuvers.find((m) => m.at > along + 1);
	}

	/** Die Abzweigung danach (für „… und danach rechts“) */
	maneuverAfter(m: Maneuver): Maneuver | undefined {
		return this.maneuvers.find((n) => n.at > m.at);
	}

	/** Abschnitt (0 = Hinweg, 1 = Rückweg) bei Meter `along` */
	legAt(along: number): number {
		const leg = this.legEnds.findIndex((end) => along <= end);
		return leg < 0 ? this.legEnds.length - 1 : leg;
	}

	private segmentAt(along: number): number {
		let lo = 0;
		let hi = this.cum.length - 1;
		while (lo < hi - 1) {
			const mid = (lo + hi) >> 1;
			if (this.cum[mid] <= along) lo = mid;
			else hi = mid;
		}
		return lo;
	}
}
