/**
 * Beispieltouren für das Grundgerüst (M0), damit die Screens echte Texte zeigen.
 * Werden ab M2 durch berechnete Vorschläge ersetzt.
 */

import type { SceneKind } from '$lib/components/illustrations/TourScene.svelte';

export type StopKind = 'cafe' | 'biergarten' | 'toilette' | 'aussicht' | 'bank' | 'laden';
export type BatteryLevel = 'locker' | 'knapp' | 'voll-laden';
export type LandscapeTag = 'wasser' | 'wald' | 'gruen' | 'aussicht';

export interface Stop {
	km: number;
	name: string;
	kind: StopKind;
}

export interface SampleTour {
	id: string;
	name: string;
	km: number;
	minutes: number;
	climb: 'flach' | 'leicht hügelig' | 'hügelig';
	highlight: string;
	battery: BatteryLevel;
	scene: SceneKind;
	tags: LandscapeTag[];
	stops: Stop[];
}

export const sampleTours: SampleTour[] = [
	{
		id: 'rheinbogen',
		name: 'Rheinbogen und Deichwiesen',
		km: 31,
		minutes: 125,
		climb: 'flach',
		highlight: 'Lange Strecken direkt am Rhein, fast ohne Autos.',
		battery: 'locker',
		scene: 'river',
		tags: ['wasser', 'aussicht'],
		stops: [
			{ km: 9, name: 'Aussicht auf den Rhein', kind: 'aussicht' },
			{ km: 16, name: 'Café am Deich', kind: 'cafe' },
			{ km: 17, name: 'Toilette am Fähranleger', kind: 'toilette' },
			{ km: 24, name: 'Bank unter Kopfweiden', kind: 'bank' }
		]
	},
	{
		id: 'seenplatte',
		name: 'Rund um die Sechs-Seen-Platte',
		km: 27,
		minutes: 110,
		climb: 'leicht hügelig',
		highlight: 'Fünf Seen am Stück und ein Biergarten am Wasser.',
		battery: 'locker',
		scene: 'lake',
		tags: ['wasser', 'gruen'],
		stops: [
			{ km: 6, name: 'Bank am Wolfssee', kind: 'bank' },
			{ km: 13, name: 'Biergarten am See', kind: 'biergarten' },
			{ km: 20, name: 'E-Bike-Ladepunkt am Parkplatz', kind: 'laden' }
		]
	},
	{
		id: 'waldrunde',
		name: 'Durch den Duisburger Stadtwald',
		km: 38,
		minutes: 160,
		climb: 'hügelig',
		highlight: 'Schattige Waldwege – angenehm an heißen Tagen.',
		battery: 'knapp',
		scene: 'forest',
		tags: ['wald', 'aussicht'],
		stops: [
			{ km: 11, name: 'Aussichtsturm', kind: 'aussicht' },
			{ km: 19, name: 'Waldcafé', kind: 'cafe' }
		]
	}
];

export function findSampleTour(id: string): SampleTour | undefined {
	return sampleTours.find((tour) => tour.id === id);
}

/** „2 Std. 5 Min.“ statt „125 min“ */
export function formatDuration(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = Math.round((minutes % 60) / 5) * 5;
	if (hours === 0) return `${rest} Min.`;
	if (rest === 0) return `${hours} Std.`;
	return `${hours} Std. ${rest} Min.`;
}

export const batteryText: Record<BatteryLevel, string> = {
	locker: 'Akku reicht locker',
	knapp: 'Akku wird knapp',
	'voll-laden': 'Akku vorher voll laden'
};

export const stopLabel: Record<StopKind, string> = {
	cafe: 'Café',
	biergarten: 'Biergarten',
	toilette: 'Toilette',
	aussicht: 'Aussicht',
	bank: 'Bank',
	laden: 'Ladepunkt'
};

export const tagLabel: Record<LandscapeTag, string> = {
	wasser: 'Am Wasser',
	wald: 'Viel Wald',
	gruen: 'Viel Grün',
	aussicht: 'Mit Aussicht'
};
