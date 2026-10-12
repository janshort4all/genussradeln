/**
 * „Durch statt vorbei“ (Wunsch Jan, 14.10.2026): Eine Tour fuhr an die Sechs-Seen-Platte heran, bog wieder ab und lief
 * westlich davon über offenes Land – obwohl zwischen den Seen schöne Radwege liegen. GraphHopper kennt Wald und Seen
 * nicht; zwischen zwei Hilfspunkten nimmt er den bequemsten Weg. Deshalb wird jeder fertige Vorschlag geprüft:
 *
 * 1. Alle THROUGH.stepM Meter: Liegt seitlich (THROUGH.minOffsetM … maxOffsetM) deutlich mehr Wald, Park oder Seeufer als
 *    auf der Strecke selbst? Solche Stellen am Stück (ab THROUGH.minStretchM) sind ein „Vorbei“-Abschnitt.
 * 2. Für jeden Abschnitt: Weg vom Anfang zum Ende neu rechnen, mit einem Korridor durch die inneren Punkte
 *    (außerhalb für GraphHopper unattraktiver – keine festen Hilfspunkte, die Zipfel erzeugen könnten).
 * 3. Übernehmen, wenn das Stück die ganze Tour schöner macht, nicht viel länger ist, keinen Stummel/Kreis/Zipfel hat und
 *    nicht auf dem Rest der Tour fährt. Die Prüfung der Gesamtlänge (z. B. ± 10 % bei Runden) macht der Aufrufer.
 */
import { band, bearing, distance, offset, resample, type LngLat } from '$lib/geo/geo';
import { cumulative, slicePath, splicePath } from '$lib/improve/slice';
import { findBacktrack, findLoop, findSpur, separatedFrom } from '$lib/scoring/backtrack';
import type { FineMap } from '$lib/scoring/fine';
import { overlapShare } from '$lib/scoring/overlap';
import { analyzeRoute, beautyScore, lineOf, type RouteStats } from '$lib/scoring/score';
import { THROUGH, VIA_SEARCH } from '$lib/scoring/weights';
import { NoRouteError, type RouteOptions, type RoutePath } from './graphhopper';
import type { PlanDeps } from './plan';

/**
 * Wie sehr liegt ein Punkt „drin“: Tiefe im Wald bzw. Grünen (0 … 1, siehe FineMap.woodDepth) plus Zuschlag direkt am
 * Wasser. Auf dem Wasser selbst −1 (dort fährt niemand).
 */
export function insideness(fine: FineMap, p: LngLat): number {
	if (fine.isWater(p)) return -1;
	return (fine.woodDepth(p)?.depth ?? 0) + (fine.nearWater(p, THROUGH.waterCells) ? THROUGH.waterBonus : 0);
}

/** Ein Abschnitt, der nur vorbeiführt: Punkte `from`…`to` des Wegs, dazu die inneren Punkte, durch die er führen könnte */
export interface PassBy {
	from: number;
	to: number;
	inside: LngLat[];
	/** Summe der Gewinne (zum Sortieren: die größten Abschnitte zuerst) */
	gain: number;
}

interface Sample {
	along: number;
	gain: number;
	side: number;
	inner: LngLat;
}

/** Index des Punkts der Linie, der `along` Meter vom Anfang am nächsten liegt */
function indexAt(cum: number[], along: number): number {
	let lo = 0;
	let hi = cum.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (cum[mid] < along) lo = mid + 1;
		else hi = mid;
	}
	return lo > 0 && along - cum[lo - 1] < cum[lo] - along ? lo - 1 : lo;
}

/** Punkt `along` Meter vom Anfang der Linie */
function pointAt(line: LngLat[], cum: number[], along: number): LngLat {
	// erster Punkt, der mindestens `along` Meter vom Anfang liegt
	let i = 1;
	while (i < line.length - 1 && cum[i] < along) i++;
	const [a, b] = [line[i - 1], line[i]];
	const span = cum[i] - cum[i - 1] || 1;
	const t = Math.max(0, Math.min(1, (along - cum[i - 1]) / span));
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Abschnitte der Linie, die an Wald, Park oder Seeufer vorbeiführen statt hindurch (größte zuerst) */
export function findPassBys(line: LngLat[], fine: FineMap): PassBy[] {
	if (line.length < 3) return [];
	const cum = cumulative(line);
	const total = cum[cum.length - 1];
	const samples: (Sample | undefined)[] = [];
	for (let along = THROUGH.freeEndsM; along <= total - THROUGH.freeEndsM; along += THROUGH.stepM) {
		const p = pointAt(line, cum, along);
		const dir = bearing(pointAt(line, cum, Math.max(0, along - 100)), pointAt(line, cum, Math.min(total, along + 100)));
		const here = insideness(fine, p);
		let best: Sample | undefined;
		for (const side of [-90, 90]) {
			for (let d = THROUGH.minOffsetM; d <= THROUGH.maxOffsetM; d += THROUGH.offsetStepM) {
				const q = offset(p, dir + side, d);
				const gain = insideness(fine, q) - d / THROUGH.distancePenaltyM - here;
				if (gain >= THROUGH.minGain && (!best || gain > best.gain + 0.05)) best = { along, gain, side, inner: q };
			}
		}
		samples.push(best);
	}

	// zusammenhängende Stellen (eine Lücke wird überbrückt) auf derselben Seite
	const groups: Sample[][] = [];
	let current: Sample[] = [];
	let gap = 0;
	for (const s of samples) {
		if (s && (!current.length || current[current.length - 1].side === s.side)) {
			current.push(s);
			gap = 0;
		} else if (!s && current.length && gap === 0) {
			gap = 1;
		} else {
			if (current.length) groups.push(current);
			current = s ? [s] : [];
			gap = 0;
		}
	}
	if (current.length) groups.push(current);

	const out: PassBy[] = [];
	for (const group of groups) {
		const first = group[0].along;
		const last = group[group.length - 1].along;
		if (last - first + THROUGH.stepM < THROUGH.minStretchM) continue;
		// Anfang und Ende je einen Schritt vor bzw. hinter dem Abschnitt, auf der bisherigen Strecke
		const from = indexAt(cum, Math.max(0, first - THROUGH.stepM));
		const to = indexAt(cum, Math.min(total, last + THROUGH.stepM));
		if (to - from < 2) continue;
		out.push({ from, to, inside: group.map((s) => s.inner), gain: group.reduce((sum, s) => sum + s.gain, 0) });
	}
	return out.sort((a, b) => b.gain - a.gain);
}

/** Streifen Anfang → innere Punkte → Ende (für preferAreas) */
export function corridorOf(line: LngLat[], passBy: PassBy): LngLat[][] {
	const points = [line[passBy.from], ...passBy.inside, line[passBy.to]];
	const rings: LngLat[][] = [];
	for (let i = 0; i + 1 < points.length; i++) rings.push(band(points[i], points[i + 1], THROUGH.halfWidthM));
	return rings;
}

/**
 * Schmaler Streifen um die bisherige Strecke (für avoidAreas). Liegen die inneren Punkte nah daneben, läge die bisherige
 * Strecke sonst selbst im Korridor – und GraphHopper bliebe auf ihr (gemessen). Anfang und Ende bleiben frei.
 */
export function oldStretchOf(line: LngLat[], passBy: PassBy): LngLat[][] {
	// alle 100 m ein Stück – wenige Flächen halten die Anfrage schnell
	const points = resample(line.slice(passBy.from, passBy.to + 1), 100);
	const free = Math.ceil(THROUGH.freeEndsM / 100);
	const rings: LngLat[][] = [];
	for (let i = free; i + 1 < points.length - free; i++) rings.push(band(points[i], points[i + 1], THROUGH.avoidHalfWidthM));
	return rings;
}

interface Shape {
	backtrack: number;
	loop?: LngLat;
	spur?: LngLat;
}

/** Stummel (Meter), Kreis und Zipfel eines Wegstücks */
function shapeOf(piece: RoutePath): Shape {
	const line = lineOf(piece);
	const separated = separatedFrom(piece.details.road_environment);
	return {
		backtrack: findBacktrack(line, separated).meters,
		loop: findLoop(line, separated)?.at,
		spur: findSpur(line, separated)?.at
	};
}

/** Hat das neue Stück einen Stummel, Kreis oder Zipfel? */
function badShape(piece: RoutePath): boolean {
	const shape = shapeOf(piece);
	return shape.backtrack > VIA_SEARCH.maxBacktrackM || !!shape.loop || !!shape.spur;
}

/** Kommt in `after` ein Stummel, Kreis oder Zipfel dazu, den es in `before` (gleiche Gegend vor dem Ersetzen) nicht gab? */
function newProblem(before: Shape, after: Shape): boolean {
	const same = (a?: LngLat, b?: LngLat) => !!a && !!b && distance(a, b) < 150;
	return (
		after.backtrack > before.backtrack + VIA_SEARCH.maxBacktrackM ||
		(!!after.loop && !same(after.loop, before.loop)) ||
		(!!after.spur && !same(after.spur, before.spur))
	);
}

/**
 * Nahtstellen glätten: GraphHopper setzt Anfang und Ende des neuen Stücks genau auf die alten Punkte. Liegt der Punkt kurz
 * hinter einer Abzweigung, fährt der Weg sonst bis zum Punkt und gleich wieder zurück (gemessen: 40 m hin und zurück, dazu ein
 * „Kreis“ an der Kreuzung). Dann wird an der Abzweigung abgeschnitten: Wo das Ende des Stücks auf dem weiteren Weg zurückläuft
 * (bzw. der Anfang auf dem bisherigen), beginnt bzw. endet das Stück dort.
 */
export function trimSeams(
	path: RoutePath,
	from: number,
	to: number,
	piece: RoutePath
): { from: number; to: number; piece: RoutePath } {
	const at = (c: [number, number, number]): LngLat => [c[0], c[1]];
	const coords = path.coordinates;
	const pc = piece.coordinates;
	const near = THROUGH.seamNearM;
	const reach = THROUGH.seamReachM;
	// Ende: Stück läuft rückwärts auf dem Weg dahinter → so weit wie möglich nach hinten verbinden
	let endPiece = pc.length - 1;
	let endTo = to;
	for (let q = to + 1, along = 0; q < coords.length && along <= reach; q++) {
		along += distance(at(coords[q - 1]), at(coords[q]));
		for (let k = pc.length - 2, back = 0; k > 0 && back <= reach; k--) {
			back += distance(at(pc[k + 1]), at(pc[k]));
			if (distance(at(pc[k]), at(coords[q])) < near) {
				endPiece = k;
				endTo = q;
				break;
			}
		}
	}
	// Anfang: Stück läuft rückwärts auf dem Weg davor → so weit wie möglich nach vorn verbinden
	let startPiece = 0;
	let startFrom = from;
	for (let p = from - 1, along = 0; p >= 0 && along <= reach; p--) {
		along += distance(at(coords[p + 1]), at(coords[p]));
		for (let k = 1, ahead = 0; k < endPiece && ahead <= reach; k++) {
			ahead += distance(at(pc[k - 1]), at(pc[k]));
			if (distance(at(pc[k]), at(coords[p])) < near) {
				startPiece = k;
				startFrom = p;
				break;
			}
		}
	}
	if (startPiece === 0 && endPiece === pc.length - 1) return { from, to, piece };
	const trimmed = slicePath(piece, startPiece, endPiece);
	return {
		from: startFrom,
		to: endTo,
		piece: { ...trimmed, time: piece.time, ascend: piece.ascend, descend: piece.descend, instructions: shiftInstructions(piece, startPiece, endPiece) }
	};
}

/** Abbiegehinweise eines zugeschnittenen Stücks (Punkte `from`…`to`) */
function shiftInstructions(piece: RoutePath, from: number, to: number) {
	return (piece.instructions ?? []).filter((i) => i.index >= from && i.index <= to).map((i) => ({ ...i, index: i.index - from }));
}

export interface ThroughResult {
	path: RoutePath;
	stats: RouteStats;
	beauty: number;
	/** so viele Abschnitte wurden ersetzt */
	changed: number;
}

/** Anfragen gleichzeitig, aber nicht alle auf einmal (GraphHopper schonen) */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				results[i] = await fn(items[i]);
			}
		})
	);
	return results;
}

/** Ein Stück durch Wald, Park oder am Seeufer, das die Punkte `from`…`to` des Wegs ersetzen kann */
export interface ThroughVariant {
	passBy: PassBy;
	from: number;
	to: number;
	piece: RoutePath;
	/** Mehrweg in Metern gegenüber dem ersetzten Stück */
	extra: number;
	/** um so viel schöner ist das neue Stück als das ersetzte (Punkte wie beautyScore) */
	gain: number;
	before: RouteStats;
	after: RouteStats;
}

/**
 * Für jeden „Vorbei“-Abschnitt (höchstens THROUGH.maxStretches) den Weg durchs Innere rechnen und prüfen: höchstens
 * `limits` länger, ohne Stummel/Kreis/Zipfel (auch nicht an den Nahtstellen) und ohne auf dem Rest des Wegs zu fahren.
 * Ob es schöner wird, entscheidet der Aufrufer.
 */
export async function throughVariants(
	path: RoutePath,
	deps: PlanDeps,
	options: RouteOptions,
	limits: { maxExtraRatio: number; maxExtraM: number } = THROUGH
): Promise<ThroughVariant[]> {
	if (!deps.fine) return [];
	const line = lineOf(path);
	const passBys = findPassBys(line, deps.fine).slice(0, THROUGH.maxStretches);
	if (!passBys.length) return [];

	const pieces = await mapLimited(passBys, THROUGH.parallel, async (passBy) => {
		try {
			const avoid = oldStretchOf(line, passBy);
			const [piece] = await deps.route([line[passBy.from], line[passBy.to]], {
				...options,
				preferAreas: { rings: corridorOf(line, passBy), outsideFactor: THROUGH.outsideFactor },
				...(avoid.length ? { avoidAreas: { rings: avoid, insideFactor: THROUGH.avoidFactor } } : {})
			});
			return piece;
		} catch (error) {
			if (error instanceof NoRouteError) return undefined;
			throw error;
		}
	});

	const variants: ThroughVariant[] = [];
	const oldCum = cumulative(line);
	for (const [k, passBy] of passBys.entries()) {
		const found = pieces[k];
		if (!found || found.coordinates.length < 2) continue;
		const length = slicePath(path, passBy.from, passBy.to).distance;
		if (found.distance > length * (1 + limits.maxExtraRatio) || found.distance - length > limits.maxExtraM) continue;
		if (badShape(found)) continue;
		const pieceLine = lineOf(found);
		const rest =
			overlapShare(pieceLine, line.slice(0, passBy.from + 1)) + overlapShare(pieceLine, line.slice(passBy.to));
		if (rest > THROUGH.maxOverlap) continue;
		// an den Nahtstellen nicht bis zum alten Punkt und zurück fahren
		const { from, to, piece } = trimSeams(path, passBy.from, passBy.to, found);
		// auch an den Nahtstellen kein neuer Stummel/Kreis/Zipfel (GraphHopper setzt Anfang und Ende des Stücks auf den nächsten
		// Weg – liegt der neben der bisherigen Strecke, entstünde dort ein Haken): Stück samt THROUGH.seamM davor und dahinter mit
		// derselben Gegend vorher vergleichen (ein Haken, den es dort schon gab, verhindert die Verbesserung nicht)
		const candidate = splicePath(path, from, to, piece);
		const newCum = cumulative(lineOf(candidate));
		const end = from + piece.coordinates.length - 1;
		const before = shapeOf(
			slicePath(path, indexAt(oldCum, oldCum[from] - THROUGH.seamM), indexAt(oldCum, oldCum[to] + THROUGH.seamM))
		);
		const after = shapeOf(
			slicePath(candidate, indexAt(newCum, newCum[from] - THROUGH.seamM), indexAt(newCum, newCum[end] + THROUGH.seamM))
		);
		if (newProblem(before, after)) continue;
		const old = slicePath(path, from, to);
		const oldStats = analyzeRoute(old, deps.landscape, deps.roads, deps.fine);
		const newStats = analyzeRoute(piece, deps.landscape, deps.roads, deps.fine);
		variants.push({
			passBy,
			from,
			to,
			piece,
			extra: piece.distance - old.distance,
			gain: beautyScore(newStats) - beautyScore(oldStats),
			before: oldStats,
			after: newStats
		});
	}
	return variants;
}

/**
 * Einen Weg durch Wald, Park und an Seeufern entlang statt daran vorbei führen (siehe oben). `accept` prüft die ganze
 * Tour nach jedem Ersetzen (z. B. Länge einer Runde) – sagt sie nein, bleibt der Abschnitt, wie er war.
 */
export async function goThrough(
	path: RoutePath,
	deps: PlanDeps,
	options: RouteOptions,
	accept: (candidate: RoutePath) => boolean = () => true
): Promise<ThroughResult> {
	const stats = analyzeRoute(path, deps.landscape, deps.roads, deps.fine);
	const original: ThroughResult = { path, stats, beauty: beautyScore(stats), changed: 0 };
	const variants = await throughVariants(path, deps, options);

	// von hinten nach vorn einsetzen (die Punkte davor bleiben, wo sie sind), jeweils nur, wenn es schöner wird
	let result = original;
	// alles ab hier ist schon ersetzt – ein Abschnitt, der hineinreicht, bleibt, wie er war
	let limit = Infinity;
	for (const { from, to, piece, gain } of variants.sort((a, b) => b.from - a.from)) {
		if (to > limit) continue;
		// das neue Stück muss deutlich schöner sein als das alte (auf die ganze Tour gerechnet wäre ein schönes Stück von 2 km
		// in einer 30-km-Runde kaum zu sehen) – und die ganze Tour darf dadurch nicht weniger schön werden
		if (gain < THROUGH.minPieceGain) continue;
		const candidate = splicePath(result.path, from, to, piece);
		if (!accept(candidate)) continue;
		const candidateStats = analyzeRoute(candidate, deps.landscape, deps.roads, deps.fine);
		const beauty = beautyScore(candidateStats);
		if (beauty < result.beauty) continue;
		result = { path: candidate, stats: candidateStats, beauty, changed: result.changed + 1 };
		limit = from;
	}
	return result;
}
