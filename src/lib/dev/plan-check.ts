/**
 * Prüflauf für die Tourenplanung (nur Entwicklung, wird von der App nicht geladen).
 *
 * Plant viele zufällige Strecken in der ganzen Region – kurz und lang, nur hin und als Runde, dazu Grenzfälle –
 * und prüft jede Antwort gegen feste Regeln (keine Zipfel/Kreise auf Umwegen, keine fast gleichen Vorschläge,
 * Rückweg nicht auf dem Hinweg, Namen passend zur Länge, Längengrenzen, Fahrzeit, Texte …).
 *
 * Aufruf im Browser auf http://localhost:5173 (lokales GraphHopper muss laufen), z. B. in der Konsole:
 *   const m = await import('/src/lib/dev/plan-check.ts'); await m.runPlanCheck({ pairs: 40 })
 */
import { distance, type LngLat } from '$lib/geo/geo';
import { loadNames } from '$lib/naming/names';
import { lengthLabels, planTours, TooCloseError } from '$lib/routing/plan';
import { planRound, roundShapeProblem } from '$lib/routing/round';
import { NoRouteError, route, type RoutePath } from '$lib/routing/graphhopper';
import { findBacktrack, findLoop, findSpur, separatedFrom } from '$lib/scoring/backtrack';
import { loadLandscape } from '$lib/scoring/landscape';
import { overlapShare } from '$lib/scoring/overlap';
import { loadRoadMask } from '$lib/scoring/roads';
import { beautyScore } from '$lib/scoring/score';
import { DETOUR, DIVERSITY_MAX_OVERLAP, ROUND, ROUND_MAX_OVERLAP, VIA_SEARCH } from '$lib/scoring/weights';
import type { PlannedTour, ReturnMode, TourRequest } from '$lib/tour/model';

export interface CheckProblem {
	case: string;
	rule: string;
	detail: string;
}

export interface CheckResult {
	cases: number;
	plans: number;
	problems: CheckProblem[];
	/** Anzahl Vorschläge → wie oft */
	counts: Record<number, number>;
	slowest: { case: string; ms: number }[];
	/** je Fall: Anzahl, Längen (km) und Schönheit der Vorschläge */
	perCase: { case: string; count: number; km: number[]; beauty: number[] }[];
	averageMs: number;
}

/** Zufallszahlen mit festem Startwert – derselbe Lauf ist wiederholbar */
function random(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

const lineOf = (coords: number[][]): LngLat[] => coords.map(([lon, lat]) => [lon, lat]);

interface Case {
	name: string;
	start: LngLat;
	destination: LngLat;
	returnMode: ReturnMode;
	/** Rundtour mit dieser Länge (km) */
	roundKm?: number;
	/** Grenzfall: ein Fehler „kein Weg“ ist hier in Ordnung */
	mayFail?: boolean;
}

async function makeCases(pairs: number, seed: number): Promise<Case[]> {
	const data = await (await fetch('/data/places.json')).json();
	const places: { name: string; at: LngLat }[] = data.places.map((p: [number, number, number, string]) => ({
		name: p[3],
		at: [p[0] / 1e4, p[1] / 1e4] as LngLat
	}));
	const rnd = random(seed);
	const jitter = (p: LngLat, m: number): LngLat => {
		const a = rnd() * 2 * Math.PI;
		const r = rnd() * m;
		return [p[0] + (Math.cos(a) * r) / (111_320 * Math.cos((p[1] * Math.PI) / 180)), p[1] + (Math.sin(a) * r) / 110_540];
	};
	const buckets: [number, number][] = [
		[1500, 5000],
		[5000, 10_000],
		[10_000, 20_000],
		[20_000, 35_000]
	];
	const cases: Case[] = [];
	for (let i = 0; i < pairs; i++) {
		const [min, max] = buckets[i % buckets.length];
		const a = places[Math.floor(rnd() * places.length)];
		const fitting = places.filter((p) => {
			const d = distance(p.at, a.at);
			return d >= min && d <= max;
		});
		if (!fitting.length) continue;
		const b = fitting[Math.floor(rnd() * fitting.length)];
		const start = jitter(a.at, 800);
		const destination = jitter(b.at, 800);
		for (const returnMode of ['one-way', 'other-way'] as const)
			cases.push({ name: `${a.name} → ${b.name} (${Math.round(distance(start, destination) / 100) / 10} km Luftlinie)`, start, destination, returnMode });
	}
	// Rundtouren: zufällige Starts, verschiedene Längen
	const lengths = [10, 15, 20, 30, 40, 50];
	for (let i = 0; i < Math.round(pairs / 2); i++) {
		const a = places[Math.floor(rnd() * places.length)];
		const start = jitter(a.at, 800);
		const km = lengths[i % lengths.length];
		cases.push({ name: `Runde ab ${a.name}, ${km} km`, start, destination: start, returnMode: 'one-way', roundKm: km });
	}
	// Grenzfälle
	const moers: LngLat = [6.6284, 51.4513];
	const edge: [string, LngLat, LngLat][] = [
		['sehr kurz (300 m)', moers, [moers[0] + 0.004, moers[1]]],
		['Start = Ziel', moers, moers],
		['Ziel mitten im Rhein', moers, [6.7395, 51.4225]],
		['Ziel außerhalb der Region (Köln)', moers, [6.9603, 50.9375]]
	];
	for (const [name, start, destination] of edge)
		for (const returnMode of ['one-way', 'other-way'] as const)
			cases.push({ name: `Grenzfall: ${name}`, start, destination, returnMode, mayFail: true });
	return cases;
}

/** Prüft die Vorschläge eines Falls gegen die Regeln */
function checkTours(c: Case, tours: PlannedTour[], direct: RoutePath, problems: CheckProblem[]) {
	const add = (rule: string, detail: string) => problems.push({ case: `${c.name} [${c.returnMode}]`, rule, detail });
	const n = tours.length;
	if (n < 1 || n > 5) add('Anzahl', `${n} Vorschläge`);
	const labels = lengthLabels(n);
	tours.forEach((t, i) => {
		if (t.label !== labels[i]) add('Name passt nicht zur Position', `${i + 1}: „${t.label}“ statt „${labels[i]}“`);
		if (i > 0 && t.stats.distance > tours[i - 1].stats.distance + 1)
			add('Reihenfolge', `${i + 1}. ist länger als ${i}.: ${t.stats.distance.toFixed(0)} > ${tours[i - 1].stats.distance.toFixed(0)} m`);
	});
	const titles = new Set(tours.map((t) => t.title));
	if (titles.size !== n) add('Titel doppelt', tours.map((t) => t.title).join(' | '));

	const directLine = lineOf(direct.coordinates);
	const maxLeg = direct.distance * (1 + DETOUR.maxExtraRatio) + DETOUR.minExtraKm * 1000;
	const expectedLegs = c.returnMode === 'other-way' ? 2 : 1;
	for (const [i, t] of tours.entries()) {
		const tag = `${i + 1}. „${t.label}“ (${(t.stats.distance / 1000).toFixed(1)} km)`;
		if (!t.title?.trim()) add('Titel leer', tag);
		if (!t.highlight?.trim()) add('Beschreibung leer', tag);
		if (t.legs.length !== expectedLegs) add('Anzahl Abschnitte', `${tag}: ${t.legs.length}`);
		if (!(t.minutes > 0)) add('Fahrzeit', `${tag}: ${t.minutes} min`);
		const kmh = t.stats.distance / 1000 / (t.minutes / 60);
		if (kmh < 9 || kmh > 16) add('Fahrzeit unplausibel', `${tag}: ${kmh.toFixed(1)} km/h`);
		if (t.extraDistance < 0) add('Mehrweg negativ', tag);
		for (const key of ['water', 'forest', 'green', 'fields', 'nature', 'network', 'quiet', 'major', 'roadside', 'badSurface'] as const) {
			const v = t.stats[key] ?? 0;
			if (!(v >= 0 && v <= 1)) add('Kennzahl außerhalb 0..1', `${tag}: ${key} = ${v}`);
		}
		if (!Number.isFinite(beautyScore(t.stats))) add('Schönheit ungültig', tag);
		// Wegpunkte
		const wp = t.waypoints;
		if (wp[0]?.kind !== 'start') add('Wegpunkte', `${tag}: beginnt nicht mit Start`);
		if (!wp.some((w) => w.kind === 'destination')) add('Wegpunkte', `${tag}: kein Ziel`);
		if (c.returnMode === 'other-way' && wp.at(-1)?.kind !== 'start') add('Wegpunkte', `${tag}: Runde endet nicht am Start`);
		// Abschnitte: Anfang/Ende in der Nähe von Start/Ziel, keine Zipfel/Kreise auf Umwegen, Länge begrenzt
		t.legs.forEach((leg, li) => {
			const line = lineOf(leg.coordinates);
			const from = li === 0 ? c.start : c.destination;
			const to = li === 0 ? c.destination : c.start;
			if (distance(line[0], from) > 400) add('Abschnitt beginnt weit weg', `${tag} Abschnitt ${li + 1}: ${Math.round(distance(line[0], from))} m`);
			if (distance(line.at(-1)!, to) > 400) add('Abschnitt endet weit weg', `${tag} Abschnitt ${li + 1}: ${Math.round(distance(line.at(-1)!, to))} m`);
			const isDirect = li === 0 && Math.min(overlapShare(line, directLine), overlapShare(directLine, line)) > 0.95;
			if (leg.distance > maxLeg * 1.3 + 2000) add('Abschnitt zu lang', `${tag} Abschnitt ${li + 1}: ${(leg.distance / 1000).toFixed(1)} km`);
			if (isDirect) return;
			const bridges = separatedFrom((leg.bridges ?? []).map(([a, b]) => [a, b, 'bridge']));
			const nearEnds = line.map(
				(p) => distance(p, line[0]) < VIA_SEARCH.endpointFreeM || distance(p, line.at(-1)!) < VIA_SEARCH.endpointFreeM
			);
			const separated = (segment: number) => bridges(segment) || nearEnds[segment];
			const spur = findSpur(line, separated);
			const loop = findLoop(line, separated);
			const back = findBacktrack(line, separated).meters;
			if (spur) add('Zipfel', `${tag} Abschnitt ${li + 1}: ${spur.meters} m bei ${spur.at.map((x) => x.toFixed(5)).reverse().join(',')}`);
			if (loop) add('Kreis', `${tag} Abschnitt ${li + 1}: ${Math.round(loop.meters)} m bei ${loop.at.map((x) => x.toFixed(5)).reverse().join(',')}`);
			if (back > VIA_SEARCH.maxBacktrackM) add('Stummel', `${tag} Abschnitt ${li + 1}: ${back} m`);
		});
		if (t.legs.length === 2) {
			const out = lineOf(t.legs[0].coordinates);
			const back = lineOf(t.legs[1].coordinates);
			const shared = overlapShare(back, out);
			if (shared > ROUND_MAX_OVERLAP + 0.05 && i < n - 1)
				add('Runde fährt auf dem Hinweg zurück', `${tag}: ${Math.round(shared * 100)} %`);
		}
	}
	// fast gleiche Vorschläge
	for (let i = 0; i < n; i++)
		for (let j = i + 1; j < n; j++) {
			const a = tours[i].legs.flatMap((l) => lineOf(l.coordinates));
			const b = tours[j].legs.flatMap((l) => lineOf(l.coordinates));
			const sim = Math.min(overlapShare(a, b), overlapShare(b, a));
			if (sim > DIVERSITY_MAX_OVERLAP + 0.05) add('Fast gleiche Vorschläge', `${i + 1}. und ${j + 1}.: ${Math.round(sim * 100)} % gemeinsam`);
		}
}

/** Prüft Rundtouren: Länge ±10 %, Start = Ende, keine Zipfel, nicht derselbe Weg zurück, verschieden */
function checkRounds(c: Case, tours: PlannedTour[], problems: CheckProblem[]) {
	const add = (rule: string, detail: string) => problems.push({ case: c.name, rule, detail });
	if (tours.length < 1 || tours.length > ROUND.suggestions) add('Anzahl', `${tours.length} Runden`);
	if (new Set(tours.map((t) => t.title)).size !== tours.length) add('Titel doppelt', tours.map((t) => t.title).join(' | '));
	const target = c.roundKm! * 1000;
	for (const [i, t] of tours.entries()) {
		const tag = `${i + 1}. „${t.title}“ (${(t.stats.distance / 1000).toFixed(1)} km)`;
		if (Math.abs(t.stats.distance / target - 1) > ROUND.tolerance + 0.001) add('Länge außerhalb ±10 %', tag);
		if (t.legs.length !== 1) add('Anzahl Abschnitte', `${tag}: ${t.legs.length}`);
		const line = lineOf(t.legs[0].coordinates);
		if (distance(line[0], c.start) > 400 || distance(line.at(-1)!, c.start) > 400) add('Runde endet nicht am Start', tag);
		if (!t.highlight?.trim()) add('Beschreibung leer', tag);
		const kmh = t.stats.distance / 1000 / (t.minutes / 60);
		if (kmh < 9 || kmh > 16) add('Fahrzeit unplausibel', `${tag}: ${kmh.toFixed(1)} km/h`);
		// Stummel/Kreis/Zipfel an den Hilfspunkten – dieselbe Prüfung wie die Planung
		const leg = t.legs[0];
		const asPath = {
			coordinates: leg.coordinates,
			details: { road_environment: (leg.bridges ?? []).map(([a, b]) => [a, b, 'bridge']) }
		} as unknown as RoutePath;
		const vias = t.waypoints.filter((w) => w.kind === 'via').map((w) => w.lngLat);
		const problem = roundShapeProblem(asPath, vias);
		if (problem) add('Zipfel/Kreis an Hilfspunkt', `${tag}: Hilfspunkt ${problem.via + 1} bei ${problem.at?.map((x) => x.toFixed(5)).reverse().join(',')}`);
		const cum = [0];
		for (let k = 1; k < line.length; k++) cum.push(cum[k - 1] + distance(line[k - 1], line[k]));
		const total = cum.at(-1)!;
		const mid = cum.findIndex((d) => d >= total / 2);
		const self = overlapShare(line.slice(mid), line.slice(0, mid + 1));
		if (self > ROUND.maxSelfOverlap + 0.05) add('Zurück auf demselben Weg', `${tag}: ${Math.round(self * 100)} %`);
	}
	for (let i = 0; i < tours.length; i++)
		for (let j = i + 1; j < tours.length; j++) {
			const a = lineOf(tours[i].legs[0].coordinates);
			const b = lineOf(tours[j].legs[0].coordinates);
			const sim = Math.min(overlapShare(a, b), overlapShare(b, a));
			if (sim > ROUND.maxSimilarity + 0.05) add('Fast gleiche Runden', `${i + 1}. und ${j + 1}.: ${Math.round(sim * 100)} %`);
		}
}

export async function runPlanCheck(
	options: { pairs?: number; seed?: number; onProgress?: (done: number, total: number) => void } = {}
): Promise<CheckResult> {
	const [landscape, names, roads] = await Promise.all([
		loadLandscape('/data/landscape.json', '/data/landscape.png'),
		loadNames('/data/landmarks.json', '/data/places.json'),
		loadRoadMask('/data/roads.json', '/data/roads.bin')
	]);
	const cases = await makeCases(options.pairs ?? 30, options.seed ?? 1);
	const problems: CheckProblem[] = [];
	const counts: Record<number, number> = {};
	const times: { case: string; ms: number }[] = [];
	const perCase: CheckResult['perCase'] = [];
	let plans = 0;
	for (const [k, c] of cases.entries()) {
		options.onProgress?.(k, cases.length);
		const request: TourRequest = {
			start: { name: 'Start', lngLat: c.start },
			destination: { name: 'Ziel', lngLat: c.destination },
			effort: 'easy',
			returnMode: c.returnMode,
			...(c.roundKm ? { round: { km: c.roundKm, seed: k + 1 } } : {})
		};
		const t0 = performance.now();
		try {
			const deps = { route, landscape, names, roads };
			const tours = c.roundKm ? await planRound(request, deps) : await planTours(request, deps);
			times.push({ case: `${c.name} [${c.returnMode}]`, ms: performance.now() - t0 });
			plans++;
			counts[tours.length] = (counts[tours.length] ?? 0) + 1;
			perCase.push({
				case: `${c.name} [${c.returnMode}]`,
				count: tours.length,
				km: tours.map((t) => Math.round(t.stats.distance / 100) / 10),
				beauty: tours.map((t) => Math.round(beautyScore(t.stats) * 100) / 100)
			});
			if (c.roundKm) checkRounds(c, tours, problems);
			else {
				const [direct] = await route([c.start, c.destination], { effort: 'easy' });
				checkTours(c, tours, direct, problems);
			}
		} catch (error) {
			const expected = error instanceof NoRouteError || error instanceof TooCloseError;
			if (!expected || !c.mayFail)
				problems.push({
					case: `${c.name} [${c.returnMode}]`,
					rule: expected ? 'Kein Weg gefunden' : 'Programmfehler',
					detail: `${(error as Error).name}: ${(error as Error).message}`
				});
		}
	}
	options.onProgress?.(cases.length, cases.length);
	times.sort((a, b) => b.ms - a.ms);
	return {
		cases: cases.length,
		plans,
		problems,
		counts,
		slowest: times.slice(0, 5).map((t) => ({ ...t, ms: Math.round(t.ms) })),
		averageMs: Math.round(times.reduce((s, t) => s + t.ms, 0) / (times.length || 1)),
		perCase
	};
}
