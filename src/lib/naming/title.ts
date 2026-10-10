/**
 * Weg-Titel aus Höhepunkt und Orten, z. B. „Am Rhein entlang über Meerbusch“ oder „Durch den Stadtwald über Hüls“.
 * Straßennamen und Himmelsrichtungen sind nur noch Notlösung (siehe plan.ts).
 */
import { resample, type LngLat } from '$lib/geo/geo';
import type { Landscape } from '$lib/scoring/landscape';
import { BIG_WATER, NAMING } from '$lib/scoring/weights';
import type { LandmarkKind, NameData } from './names';

export interface NamedLandmark {
	name: string;
	kind: LandmarkKind;
	/** Anteil des Wegs (0..1), der an diesem Ort vorbeiführt */
	share: number;
}

export interface PassedPlace {
	name: string;
	rank: number;
	/** Meter des Wegs, die diesem Ort am nächsten liegen */
	meters: number;
	/** Position entlang des Wegs (für die Reihenfolge im Titel) */
	order: number;
}

export interface RouteNames {
	landmarks: NamedLandmark[];
	places: PassedPlace[];
	/** Orte, in denen Start und Ziel liegen (kommen nicht in den Titel) */
	endPlaces: string[];
}

const STEP_M = 100;

/** Welche benannten Orte und Orientierungspunkte liegen am Weg? */
export function routeNames(line: LngLat[], data: NameData, landscape?: Landscape): RouteNames {
	const samples = resample(line, STEP_M);
	const landmarkVotes = new Map<string, { kind: LandmarkKind; count: number }>();
	const placeVotes = new Map<string, { rank: number; count: number; first: number }>();

	samples.forEach((p, i) => {
		const around = landscape?.surroundings(p, 1, BIG_WATER);
		const vote = (kinds: LandmarkKind[], radius: number) => {
			const hit = data.landmarks.nearest(p, radius, (n) => kinds.includes(n.kind as LandmarkKind));
			if (!hit) return;
			const v = landmarkVotes.get(hit.name) ?? { kind: hit.kind as LandmarkKind, count: 0 };
			v.count++;
			landmarkVotes.set(hit.name, v);
		};
		if (!landscape || around?.water) vote(['river', 'lake'], landscape ? NAMING.waterRadiusM : NAMING.nearRadiusM);
		// „Durch den Stadtwald“ nur, wenn der Weg wirklich im Wald verläuft – nicht am Waldrand entlang
		const wood = landscape?.woodDepth(p);
		if (!landscape || (wood?.kind === 'forest' && wood.depth > NAMING.minWoodDepth)) vote(['forest'], NAMING.nearRadiusM);
		if (!landscape || (wood?.kind === 'green' && wood.depth > NAMING.minWoodDepth)) vote(['park'], NAMING.nearRadiusM);

		const place = data.places.nearest(p, NAMING.placeRadiusM);
		if (place) {
			const v = placeVotes.get(place.name) ?? { rank: place.kind as number, count: 0, first: i };
			v.count++;
			placeVotes.set(place.name, v);
		}
	});

	const endPlaces = [samples[0], samples[samples.length - 1]]
		.map((p) => data.places.nearest(p, NAMING.placeRadiusM)?.name)
		.filter((n): n is string => !!n);

	return {
		landmarks: [...landmarkVotes]
			.map(([name, v]) => ({ name, kind: v.kind, share: v.count / samples.length }))
			.sort((a, b) => b.share - a.share),
		places: [...placeVotes].map(([name, v]) => ({ name, rank: v.rank, meters: v.count * STEP_M, order: v.first })),
		endPlaces
	};
}

const KIND_WEIGHT: Record<LandmarkKind, number> = { river: 1, lake: 1, forest: 0.8, park: 0.6 };

/** Der Höhepunkt eines Wegs – ein benannter Ort, an dem ein guter Teil des Wegs vorbeiführt */
export function highlightOf(names: RouteNames): NamedLandmark | undefined {
	return names.landmarks
		.filter((l) => l.share >= NAMING.minLandmarkShare)
		.sort((a, b) => b.share * KIND_WEIGHT[b.kind] - a.share * KIND_WEIGHT[a.kind])[0];
}

/**
 * Orte, die diesen Weg von den anderen unterscheiden (höchstens zwei, in Fahrtrichtung).
 * Ohne Start- und Zielort; Orte, durch die alle Vorschläge fahren, sagen nichts aus.
 */
export function distinctPlaces(own: RouteNames, others: RouteNames[]): string[] {
	const rankWeight = (rank: number) => (rank <= 1 ? 1.2 : rank === 2 ? 1 : 0.7);
	return own.places
		.filter((p) => p.meters >= NAMING.minPlaceM && !own.endPlaces.includes(p.name))
		.filter((p) => others.every((o) => (o.places.find((q) => q.name === p.name)?.meters ?? 0) < p.meters * 0.3))
		.sort((a, b) => b.meters * rankWeight(b.rank) - a.meters * rankWeight(a.rank))
		.slice(0, 2)
		.sort((a, b) => a.order - b.order)
		.map((p) => p.name);
}

/** Artikel nach Geschlecht des Namens – einfache Regeln, die für die Region passen */
function isMasculineOrNeuter(name: string): boolean {
	const n = name.toLowerCase();
	return (
		/^(rhein|main|niederrhein|alter rhein)$/.test(n) ||
		/(see|kanal|bach|graben|teich|weiher|meer|maar|kolk|altarm|wald|forst|busch|berg|park|bruch|holz|venn|moor|hain)$/.test(n)
	);
}

/** „Am Rhein entlang“, „An der Niers entlang“, „Am Elfrather See vorbei“, „Durch den Stadtwald“ … */
export function landmarkTitle(l: { name: string; kind: LandmarkKind }): string {
	const { name, kind } = l;
	const alter = name.match(/^Alter (.+)$/);
	if (kind === 'river') {
		if (alter) return `Am Alten ${alter[1]} entlang`;
		return isMasculineOrNeuter(name) ? `Am ${name} entlang` : `An der ${name} entlang`;
	}
	if (kind === 'lake') return isMasculineOrNeuter(name) ? `Am ${name} vorbei` : `An der ${name} vorbei`;
	// Wälder und Parks: „Durch den Stadtwald“, „Durchs Hülser Bruch“, „Durch die Linner Heide“
	const n = name.toLowerCase();
	if (/(bruch|holz|venn|moor)$/.test(n)) return `Durchs ${name}`;
	if (/(heide|aue|au)$/.test(n)) return `Durch die ${name}`;
	if (/(wald|forst|busch|park|hain|berg)$/.test(n)) return `Durch den ${name}`;
	return `Durch ${name}`;
}

/** Für den Beschreibungssatz: „am Rhein“, „an der Niers“, „durch den Stadtwald“ … */
export function landmarkPhrase(l: { name: string; kind: LandmarkKind }): string {
	const title = landmarkTitle(l).replace(/ (entlang|vorbei)$/, '');
	return title.charAt(0).toLowerCase() + title.slice(1);
}

/** „über Meerbusch“ / „über Willich und Kaarst“ */
export function viaPlaces(places: string[]): string | undefined {
	if (!places.length) return undefined;
	return `über ${places.join(' und ')}`;
}
