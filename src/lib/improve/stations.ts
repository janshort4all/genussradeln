/**
 * Stationen (Stufe 3, Wunsch Jan, 11.10.2026): „Diese Tour führt vorbei an: Wittlaer · Kaiserswerth · Meerbusch“.
 * Eine Station ist ein benannter Ort oder Orientierungspunkt (Rhein, Stadtwald …), an dem die Tour entlangführt. Wer mit
 * einer Station nicht zufrieden ist, bekommt Alternativen in der Nähe angeboten – mit Mehrweg und Fahrzeit – und kann
 * tauschen oder die Station weglassen. Nur das Stück rund um die Station wird neu berechnet (wie bei den Umwegen).
 */
import { bearing, distance, distanceToLine, type LngLat } from '$lib/geo/geo';
import { landmarkTitle } from '$lib/naming/title';
import type { LandmarkKind, NameData, NamedPoint } from '$lib/naming/names';
import { NoRouteError } from '$lib/routing/graphhopper';
import { shapeProblem, type PlanDeps } from '$lib/routing/plan';
import { overlapShare } from '$lib/scoring/overlap';
import { NAMING, OFFERS, STATIONS } from '$lib/scoring/weights';
import { rideMinutes } from '$lib/tour/duration';
import { elevationProfile } from '$lib/tour/elevation';
import type { PlannedTour } from '$lib/tour/model';
import type { Offer } from './offers';
import { cumulative, deviation } from './slice';

export interface Station {
	id: string;
	name: string;
	/** Ort oder Art des Orientierungspunkts */
	kind: 'place' | LandmarkKind;
	lngLat: LngLat;
	/** Teilstrecke und Punkt darauf */
	legIndex: number;
	index: number;
	/** Meter ab Start der ganzen Tour (für die Reihenfolge) */
	along: number;
}

interface Run {
	name: string;
	kind: 'place' | LandmarkKind;
	rank: number;
	from: number;
	to: number;
}

/** Punkte im Abstand `step` entlang der Linie, mit Index der nächsten Koordinate */
function sampleAlong(cum: number[], line: LngLat[], step: number): { point: LngLat; index: number; meters: number }[] {
	const out: { point: LngLat; index: number; meters: number }[] = [];
	let i = 0;
	for (let m = 0; m <= cum[cum.length - 1]; m += step) {
		while (i < cum.length - 1 && cum[i + 1] <= m) i++;
		out.push({ point: line[i], index: i, meters: m });
	}
	return out;
}

/** Gewicht eines Ortes nach Rang (0 Stadt … 3 Viertel) */
const RANK_WEIGHT = [1.2, 1, 0.8, 0.5];

/**
 * Stationen einer Tour: die benannten Orientierungspunkte und Orte, an denen sie entlangführt – höchstens
 * STATIONS.max, untereinander mindestens STATIONS.minApartM auseinander, in Fahrtrichtung geordnet.
 */
export function stationsOf(tour: PlannedTour, names: NameData): Station[] {
	const found: (Station & { score: number })[] = [];
	let offsetM = 0;
	const lines = tour.legs.map((leg) => leg.coordinates.map(([lon, lat]): LngLat => [lon, lat]));
	const first = lines[0]?.[0];
	const last = lines[lines.length - 1]?.[lines[lines.length - 1].length - 1];
	const endPlaces = new Set(
		[first, last]
			.map((p) => p && names.places.nearest(p, NAMING.placeRadiusM)?.name)
			.filter((n): n is string => !!n)
	);

	lines.forEach((line, legIndex) => {
		const cum = cumulative(line);
		const samples = sampleAlong(cum, line, STATIONS.stepM);
		const total = cum[cum.length - 1];
		// Orte und Orientierungspunkte je Probe, zu Abschnitten gleichen Namens zusammengefasst
		const runs: Run[] = [];
		const open = new Map<string, Run>();
		samples.forEach((s, k) => {
			const here = new Map<string, { kind: 'place' | LandmarkKind; rank: number }>();
			const place = names.places.nearest(s.point, NAMING.placeRadiusM);
			if (place) here.set(place.name, { kind: 'place', rank: place.kind as number });
			const water = names.landmarks.nearest(s.point, NAMING.waterRadiusM, (n) => n.kind === 'river' || n.kind === 'lake');
			if (water) here.set(water.name, { kind: water.kind as LandmarkKind, rank: 0 });
			const wood = names.landmarks.nearest(s.point, NAMING.nearRadiusM, (n) => n.kind === 'forest' || n.kind === 'park');
			if (wood) here.set(wood.name, { kind: wood.kind as LandmarkKind, rank: 0 });
			for (const [name, info] of here) {
				const run = open.get(name);
				if (run) run.to = k;
				else {
					const created = { name, ...info, from: k, to: k };
					open.set(name, created);
					runs.push(created);
				}
			}
			for (const name of [...open.keys()]) if (!here.has(name)) open.delete(name);
		});
		// je Name der längste Abschnitt (Position) und alle Meter zusammen (Rang)
		const byName = new Map<string, { best: Run; meters: number }>();
		for (const run of runs) {
			const meters = (run.to - run.from + 1) * STATIONS.stepM;
			const known = byName.get(run.name);
			if (!known) byName.set(run.name, { best: run, meters });
			else {
				known.meters += meters;
				if (run.to - run.from > known.best.to - known.best.from) known.best = run;
			}
		}
		for (const [name, { best, meters }] of byName) {
			if (endPlaces.has(name)) continue;
			const isPlace = best.kind === 'place';
			if (meters < (isPlace ? NAMING.minPlaceM : Math.max(STATIONS.minLandmarkM, total * 0.1))) continue;
			const mid = samples[Math.round((best.from + best.to) / 2)];
			const score = isPlace ? (meters / 1000) * RANK_WEIGHT[best.rank] : (meters / 1000) * 1.5 + 1;
			found.push({
				id: `${legIndex}-${name}`,
				name,
				kind: best.kind,
				lngLat: mid.point,
				legIndex,
				index: mid.index,
				along: offsetM + mid.meters,
				score
			});
		}
		offsetM += total;
	});

	// die wichtigsten, nicht zu dicht beieinander, in Fahrtrichtung
	const chosen: (Station & { score: number })[] = [];
	for (const s of found.sort((a, b) => b.score - a.score)) {
		if (chosen.length >= STATIONS.max) break;
		if (chosen.some((c) => c.name === s.name || Math.abs(c.along - s.along) < STATIONS.minApartM)) continue;
		chosen.push(s);
	}
	return chosen
		.sort((a, b) => a.along - b.along)
		.map((s) => ({ id: s.id, name: s.name, kind: s.kind, lngLat: s.lngLat, legIndex: s.legIndex, index: s.index, along: s.along }));
}

/** Eine Möglichkeit für eine Station: anderer Ort in der Nähe – oder die Station weglassen */
export interface StationOption {
	id: string;
	/** z. B. „Über Meerbusch“, „Am Elfrather See vorbei“, „Direkt weiterfahren“ */
	title: string;
	/** ein Satz, z. B. „Statt über Wittlaer“ */
	why: string;
	/** der Austausch (Karte, Mehrweg, Übernehmen) – derselbe Baustein wie bei den Umwegen */
	offer: Offer;
}

const minutesOf = (meters: number, climb: number, effort: PlannedTour['request']['effort']) => rideMinutes(meters, climb, effort);

/**
 * Alternativen zu einer Station: bis zu STATIONS.options andere Orte oder Orientierungspunkte in der Nähe (nicht schon
 * am Weg, in verschiedenen Richtungen) – dazu „Station weglassen“, wenn das spürbar kürzer ist. Je Alternative wird das
 * Stück rund um die Station von der Stelle davor über den Ort zur Stelle danach neu gerechnet.
 */
export async function stationOptions(
	tour: PlannedTour,
	station: Station,
	names: NameData,
	deps: PlanDeps
): Promise<StationOption[]> {
	const { effort } = tour.request;
	const leg = tour.legs[station.legIndex];
	const line = leg.coordinates.map(([lon, lat]): LngLat => [lon, lat]);
	const cum = cumulative(line);
	const last = line.length - 1;
	// das Stück: ein Stück vor bis ein Stück nach der Station
	let from = station.index;
	while (from > 0 && cum[station.index] - cum[from] < STATIONS.windowM) from--;
	let to = station.index;
	while (to < last && cum[to] - cum[station.index] < STATIONS.windowM) to++;
	if (to - from < 2) return [];
	const oldLine = line.slice(from, to + 1);
	const baseLength = cum[to] - cum[from];
	const climbOf = (coords: [number, number, number][]) => elevationProfile(coords).ascent;
	const baseMinutes = minutesOf(baseLength, climbOf(leg.coordinates.slice(from, to + 1)), effort);
	const rest = [line.slice(0, from + 1), line.slice(to), ...tour.legs.filter((_, i) => i !== station.legIndex).map((l) => l.coordinates.map(([lon, lat]): LngLat => [lon, lat]))].filter(
		(l) => l.length > 1
	);

	// Kandidaten: andere Orte und Orientierungspunkte in der Nähe, nicht schon am Weg
	type Candidate = { point: LngLat; name: string; kind: 'place' | LandmarkKind; score: number; angle: number };
	const onRoute = (p: LngLat) => line.length > 1 && distanceToLine(p, line) < STATIONS.offRouteM;
	const candidates = new Map<string, Candidate>();
	const consider = (p: NamedPoint, kind: 'place' | LandmarkKind, weight: number) => {
		if (p.name === station.name || onRoute(p.lngLat)) return;
		const d = distance(station.lngLat, p.lngLat);
		const score = weight - (d / STATIONS.reachM) * 0.6;
		const known = candidates.get(p.name);
		if (!known || score > known.score) candidates.set(p.name, { point: p.lngLat, name: p.name, kind, score, angle: bearing(station.lngLat, p.lngLat) });
	};
	for (const p of names.places.within(station.lngLat, STATIONS.reachM, (n) => (n.kind as number) <= 2))
		consider(p, 'place', RANK_WEIGHT[p.kind as number] * 0.7);
	for (const p of names.landmarks.within(station.lngLat, STATIONS.reachM)) consider(p, p.kind as LandmarkKind, 1.3);
	const picked: Candidate[] = [];
	for (const c of [...candidates.values()].sort((a, b) => b.score - a.score)) {
		if (picked.length >= STATIONS.options) break;
		// verschiedene Richtungen, sonst sind es dieselben Alternativen
		if (picked.some((p) => Math.abs(((c.angle - p.angle + 540) % 360) - 180) < STATIONS.minAngleDeg)) continue;
		picked.push(c);
	}

	const routeThrough = async (points: LngLat[]) => {
		try {
			const [path] = await deps.route(points, { effort, signal: deps.signal });
			return path;
		} catch (error) {
			if (error instanceof NoRouteError) return undefined;
			throw error;
		}
	};

	/** Weg prüfen und als Austausch verpacken; `undefined`, wenn er nicht taugt */
	const asOffer = (path: NonNullable<Awaited<ReturnType<typeof routeThrough>>>, id: string): Offer | undefined => {
		const newLine = path.coordinates.map(([lon, lat]): LngLat => [lon, lat]);
		const extra = path.distance - baseLength;
		if (extra > STATIONS.maxExtraM) return undefined;
		const away = deviation(newLine, oldLine, OFFERS.apartM);
		if (away.max < OFFERS.minDeviationM || away.different < OFFERS.minDifferentM) return undefined;
		if (rest.some((r) => overlapShare(newLine, r) > OFFERS.maxOverlapWithRest)) return undefined;
		// das neue Stück selbst darf keinen Zipfel, Kreis oder Stummel haben (am Rest der Tour wird nicht mehr geprüft: Das
		// Stück liegt nah an der alten Strecke, dort schlägt die Zipfel-Prüfung für die ganze Teilstrecke zu oft an)
		if (shapeProblem(path)) return undefined;
		return {
			id,
			legIndex: station.legIndex,
			from,
			to,
			oldLine,
			newLine,
			newPath: path,
			extraMeters: extra,
			extraMinutes: minutesOf(path.distance, climbOf(path.coordinates), effort) - baseMinutes,
			title: '',
			why: ''
		};
	};

	const A = line[from];
	const B = line[to];
	const options = await Promise.all(
		picked.map(async (c): Promise<StationOption | undefined> => {
			let path = await routeThrough([A, c.point, B]);
			if (!path) return undefined;
			// Stummel oder Zipfel um den Ort? Dann den Punkt an den Anfang des Abstechers verlegen, neu rechnen
			const problem = shapeProblem(path);
			if (problem?.at) path = await routeThrough([A, problem.at, B]);
			if (!path) return undefined;
			const offer = asOffer(path, `station-${station.id}-${c.name}`);
			if (!offer) return undefined;
			const title =
				c.kind === 'place'
					? `Über ${c.name}`
					: landmarkTitle({ name: c.name, kind: c.kind });
			offer.title = title;
			offer.why = `Statt „${station.name}“`;
			return { id: offer.id, title, why: offer.why, offer };
		})
	);
	const result = options.filter((o): o is StationOption => !!o);

	// Station weglassen: nur, wenn der direkte Weg spürbar kürzer ist
	const direct = await routeThrough([A, B]);
	if (direct) {
		const offer = asOffer(direct, `station-${station.id}-direkt`);
		if (offer && offer.extraMeters <= -STATIONS.minSavingM) {
			offer.title = 'Direkt weiterfahren';
			offer.why = `Ohne „${station.name}“`;
			result.push({ id: offer.id, title: offer.title, why: offer.why, offer });
		}
	}
	return result;
}
