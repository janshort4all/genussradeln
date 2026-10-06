/** Einheitliche Ansicht für das Tourdetail – egal ob Beispieltour oder berechneter Weg */
import type { LngLat } from '$lib/geo/geo';
import type { SceneKind } from '$lib/components/illustrations/TourScene.svelte';
import { caveatOf, checksOf } from '$lib/routing/describe';
import type { RouteStats } from '$lib/scoring/score';
import type { StopKind } from '$lib/stops/kinds';
import { elevationProfile, type ElevationProfile } from './elevation';
import type { PlannedTour } from './model';
import type { BatteryLevel, LandscapeTag, SampleTour } from './sample';

/** Ein Stopp in der Liste „Unterwegs erwartet Sie“ */
export interface ViewStop {
	id: string;
	km: number;
	kind: StopKind;
	name?: string;
	/** Gründe in Worten, z. B. „mit Plätzen draußen, am Wasser“ */
	reasons?: string[];
	/** fehlt bei Beispieltouren */
	lngLat?: LngLat;
}

export interface TourView {
	id: string;
	title: string;
	/** nach der Länge, z. B. „Längste Tour“ (nur bei eigenen Vorschlägen, nicht bei geteilten) */
	kind?: string;
	/** z. B. „Von Ihr Standort zu Burg Linn“ */
	subtitle?: string;
	highlight?: string;
	km: number;
	minutes: number;
	climb: string;
	/** Haken, den man vorher wissen sollte, z. B. ein längeres Stück Kopfsteinpflaster (nur bei berechneten Wegen) */
	caveat?: string;
	/** Hinweis zur Tour (z. B. bei geteilten Touren) */
	note?: string;
	/** Pluspunkte zum Abhaken, z. B. „Ruhige Radwege“ (nur bei berechneten Wegen) */
	checks: string[];
	tags: LandscapeTag[];
	/** Beispieltouren: feste Stopps; berechnete Wege: werden im Tourdetail gesucht */
	stops: ViewStop[];
	/** Akku-Einschätzung kommt mit M8 – bis dahin nur bei Beispieltouren */
	battery?: BatteryLevel;
	backHref: 'vorschlaege' | 'runde' | 'start';
	map:
		| { kind: 'scene'; scene: SceneKind }
		| {
				kind: 'route';
				coordinates: LngLat[];
				/** mit Höhe (m) – für den GPX-Export */
				track: [number, number, number][];
				start: LngLat;
				destination: LngLat;
		  };
	profile?: ElevationProfile;
	/** bei „auf anderem Weg zurück“: Kilometer, an dem das Ziel erreicht ist */
	destinationKm?: number;
	destinationName?: string;
}

export function tagsFromStats(s: RouteStats): LandscapeTag[] {
	const tags: LandscapeTag[] = [];
	if (s.water >= 0.2) tags.push('wasser');
	if (s.forest >= 0.2) tags.push('wald');
	if (s.green >= 0.2) tags.push('gruen');
	if (s.fields >= 0.25) tags.push('felder');
	return tags;
}

export function fromSample(t: SampleTour): TourView {
	return {
		id: t.id,
		title: t.name,
		highlight: t.highlight,
		km: t.km,
		minutes: t.minutes,
		climb: t.climb,
		tags: t.tags,
		checks: [],
		stops: t.stops.map((s) => ({ id: `${s.km}-${s.kind}`, km: s.km, kind: s.kind, name: s.name })),
		battery: t.battery,
		backHref: 'runde',
		map: { kind: 'scene', scene: t.scene }
	};
}

export function fromPlanned(t: PlannedTour): TourView {
	const { start, destination, returnMode } = t.request;
	const coordinates = t.legs.flatMap((leg) => leg.coordinates);
	return {
		id: t.id,
		title: t.title,
		kind: t.shared ? undefined : t.label,
		subtitle:
			returnMode === 'other-way'
				? `Von ${start.name} zu ${destination.name} und als Runde zurück`
				: `Von ${start.name} zu ${destination.name}`,
		highlight: t.highlight,
		km: Math.round(t.stats.distance / 100) / 10,
		minutes: t.minutes,
		climb: t.stats.climb,
		caveat: caveatOf(t.stats),
		note: t.note,
		checks: checksOf(t.stats),
		tags: tagsFromStats(t.stats),
		stops: [],
		backHref: t.shared ? 'start' : 'vorschlaege',
		map: {
			kind: 'route',
			coordinates: coordinates.map(([lon, lat]) => [lon, lat]),
			track: coordinates,
			start: start.lngLat,
			destination: destination.lngLat
		},
		profile: elevationProfile(coordinates),
		destinationKm: t.legs.length > 1 ? Math.round(t.legs[0].distance / 100) / 10 : undefined,
		destinationName: destination.name
	};
}
