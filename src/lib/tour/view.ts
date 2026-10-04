/** Einheitliche Ansicht für das Tourdetail – egal ob Beispieltour oder berechneter Weg */
import type { LngLat } from '$lib/geo/geo';
import type { SceneKind } from '$lib/components/illustrations/TourScene.svelte';
import { extraDistanceText, surfaceWord, trafficWord } from '$lib/routing/describe';
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
	/** z. B. „Von Ihr Standort zu Burg Linn“ */
	subtitle?: string;
	highlight?: string;
	/** z. B. „2,1 km länger als der direkte Weg“ */
	extra?: string;
	km: number;
	minutes: number;
	climb: string;
	/** „fast überall glatt“ … (nur bei berechneten Wegen) */
	surface?: string;
	/** „fast nur Radwege, kaum Autos“ … (nur bei berechneten Wegen) */
	traffic?: string;
	tags: LandscapeTag[];
	/** Beispieltouren: feste Stopps; berechnete Wege: werden im Tourdetail gesucht */
	stops: ViewStop[];
	/** Akku-Einschätzung kommt mit M8 – bis dahin nur bei Beispieltouren */
	battery?: BatteryLevel;
	backHref: 'vorschlaege' | 'runde';
	map:
		| { kind: 'scene'; scene: SceneKind }
		| { kind: 'route'; coordinates: LngLat[]; start: LngLat; destination: LngLat };
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
		subtitle:
			returnMode === 'other-way'
				? `Von ${start.name} zu ${destination.name} und auf anderem Weg zurück`
				: `Von ${start.name} zu ${destination.name}`,
		highlight: t.highlight,
		extra: extraDistanceText(t.extraDistance),
		km: Math.round(t.stats.distance / 100) / 10,
		minutes: t.minutes,
		climb: t.stats.climb,
		surface: surfaceWord(t.stats),
		traffic: trafficWord(t.stats),
		tags: tagsFromStats(t.stats),
		stops: [],
		backHref: 'vorschlaege',
		map: {
			kind: 'route',
			coordinates: coordinates.map(([lon, lat]) => [lon, lat]),
			start: start.lngLat,
			destination: destination.lngLat
		},
		profile: elevationProfile(coordinates),
		destinationKm: t.legs.length > 1 ? Math.round(t.legs[0].distance / 100) / 10 : undefined,
		destinationName: destination.name
	};
}
