/** Einheitliche Ansicht für das Tourdetail – egal ob Beispieltour oder berechneter Weg */
import type { LngLat } from '$lib/geo/geo';
import type { SceneKind } from '$lib/components/illustrations/TourScene.svelte';
import { extraDistanceText } from '$lib/routing/describe';
import type { RouteStats } from '$lib/scoring/score';
import { tourLine, type PlannedTour } from './model';
import type { BatteryLevel, LandscapeTag, SampleTour, Stop } from './sample';

export interface TourView {
	id: string;
	title: string;
	/** z. B. „Von Ihr Standort nach Burg Linn“ */
	subtitle?: string;
	highlight?: string;
	/** z. B. „2,1 km länger als der direkte Weg“ */
	extra?: string;
	km: number;
	minutes: number;
	climb: string;
	tags: LandscapeTag[];
	stops: Stop[];
	/** Akku-Einschätzung kommt mit M8 – bis dahin nur bei Beispieltouren */
	battery?: BatteryLevel;
	backHref: 'vorschlaege' | 'runde';
	map:
		| { kind: 'scene'; scene: SceneKind }
		| { kind: 'route'; coordinates: LngLat[]; start: LngLat; destination: LngLat };
}

export function tagsFromStats(s: RouteStats): LandscapeTag[] {
	const tags: LandscapeTag[] = [];
	if (s.water >= 0.2) tags.push('wasser');
	if (s.forest >= 0.2) tags.push('wald');
	if (s.green >= 0.2) tags.push('gruen');
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
		stops: t.stops,
		battery: t.battery,
		backHref: 'runde',
		map: { kind: 'scene', scene: t.scene }
	};
}

export function fromPlanned(t: PlannedTour): TourView {
	const { start, destination, returnMode } = t.request;
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
		tags: tagsFromStats(t.stats),
		stops: [],
		backHref: 'vorschlaege',
		map: { kind: 'route', coordinates: tourLine(t), start: start.lngLat, destination: destination.lngLat }
	};
}
