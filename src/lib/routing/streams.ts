/**
 * Einem Bach oder Fluss folgen (Wunsch Jan, 10.10.2026): Statt an der Straße geradeaus zu fahren, links dem Moersbach
 * folgen. Aus den Gewässerverläufen (static/data/streams.json) werden Abschnitte gesucht, die in Reichweite der
 * Strecke liegen; für jeden berechnet die Planung einen Weg hinein, am Gewässer entlang und wieder hinaus.
 */
import { band, distance, distanceToLine, resample, type LngLat } from '$lib/geo/geo';
import { STREAMS } from '$lib/scoring/weights';
import { decodePolyline } from '$lib/share/link';

export interface Watercourse {
	name: string;
	line: LngLat[];
}

/** Ein Stück eines Gewässers, dem man folgen kann – in Fahrtrichtung (Start → Ziel) geordnet */
export interface Stretch {
	name: string;
	/** Linie des Abschnitts, in Fahrtrichtung */
	line: LngLat[];
	length: number;
	/** geschätzte Länge des Wegs Start → Abschnitt → Ziel (Luftlinie × Straßenfaktor) */
	estimate: number;
}

export function parseStreams(json: { lines: [string, string][] }): Watercourse[] {
	return json.lines.map(([name, encoded]) => ({ name, line: decodePolyline(encoded) }));
}

/** Lage eines Punkts entlang der Luftlinie Start → Ziel (0 = Start, 1 = Ziel) */
function alongAxis(point: LngLat, from: LngLat, to: LngLat): number {
	const kx = Math.cos((from[1] * Math.PI) / 180);
	const ax = (to[0] - from[0]) * kx;
	const ay = to[1] - from[1];
	return ((point[0] - from[0]) * kx * ax + (point[1] - from[1]) * ay) / (ax * ax + ay * ay) || 0;
}

/**
 * Gewässerabschnitte, die zusammenhängend im erlaubten Umweg-Bereich (Ellipse um Start und Ziel) liegen, mindestens
 * STREAMS.minStretchM lang sind und nicht ohnehin schon an der direkten Strecke verlaufen. Die längsten zuerst,
 * höchstens `count`, untereinander nicht an derselben Stelle.
 */
export function findStretches(
	courses: Watercourse[],
	from: LngLat,
	to: LngLat,
	maxLength: number,
	directLine: LngLat[],
	count: number
): Stretch[] {
	const maxSum = maxLength / STREAMS.roadFactor;
	if (maxSum <= distance(from, to) || count <= 0) return [];
	const direct = resample(directLine, 200);
	// grobe Vorauswahl: Rechteck um die Ellipse
	const margin = Math.sqrt(Math.max(0, (maxSum / 2) ** 2 - (distance(from, to) / 2) ** 2)) + distance(from, to) / 2;
	const centre: LngLat = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
	const dLat = (margin + 500) / 110_540;
	const dLon = (margin + 500) / (111_320 * Math.cos((centre[1] * Math.PI) / 180));

	const found: Stretch[] = [];
	for (const course of courses) {
		if (!course.line.some(([lon, lat]) => Math.abs(lon - centre[0]) <= dLon && Math.abs(lat - centre[1]) <= dLat)) continue;
		const points = resample(course.line, STREAMS.stepM);
		let run: LngLat[] = [];
		const flush = () => {
			if (run.length >= 2) {
				let length = 0;
				for (let i = 1; i < run.length; i++) length += distance(run[i - 1], run[i]);
				if (length > STREAMS.maxStretchM) {
					// zu lang: das Stück nehmen, das am wenigsten Umweg kostet
					const window = Math.round(STREAMS.maxStretchM / STREAMS.stepM);
					let best = 0;
					let bestEstimate = Infinity;
					for (let i = 0; i + window < run.length; i += 5) {
						const e = distance(from, run[i]) + STREAMS.maxStretchM + distance(run[i + window], to);
						const r = distance(from, run[i + window]) + STREAMS.maxStretchM + distance(run[i], to);
						if (Math.min(e, r) < bestEstimate) {
							bestEstimate = Math.min(e, r);
							best = i;
						}
					}
					run = run.slice(best, best + window + 1);
					length = STREAMS.maxStretchM;
				}
				if (length >= STREAMS.minStretchM) {
					// folgt die direkte Strecke dem Gewässer schon? Dann bringt der Abschnitt nichts Neues
					const away = run.filter((p) => distanceToLine(p, direct) > STREAMS.minFromDirectM).length / run.length;
					if (away >= STREAMS.minAwayShare) {
						const ordered = alongAxis(run[0], from, to) <= alongAxis(run[run.length - 1], from, to) ? run : [...run].reverse();
						const estimate =
							(distance(from, ordered[0]) + length + distance(ordered[ordered.length - 1], to)) * STREAMS.roadFactor;
						found.push({ name: course.name, line: ordered, length, estimate });
					}
				}
			}
			run = [];
		};
		for (const p of points) {
			const inside = distance(from, p) + distance(p, to) <= maxSum && distance(from, p) > STREAMS.minFromEndsM && distance(p, to) > STREAMS.minFromEndsM;
			if (inside) run.push(p);
			else flush();
		}
		flush();
	}
	// erst die langen, bei (fast) gleicher Länge die mit dem kleineren Umweg
	found.sort((a, b) => Math.round(b.length / 500) - Math.round(a.length / 500) || a.estimate - b.estimate);
	const chosen: Stretch[] = [];
	for (const s of found) {
		if (chosen.length >= count) break;
		const mid = s.line[Math.floor(s.line.length / 2)];
		if (chosen.some((c) => distance(c.line[Math.floor(c.line.length / 2)], mid) < STREAMS.minSpacingM)) continue;
		chosen.push(s);
	}
	return chosen;
}

/** Streifen (Rechtecke) entlang des Abschnitts – dort soll der Weg bleiben */
export function stretchCorridor(stretch: Stretch): LngLat[][] {
	const pts = resample(stretch.line, STREAMS.corridorStepM);
	const rings: LngLat[][] = [];
	for (let i = 0; i + 1 < pts.length; i++) rings.push(band(pts[i], pts[i + 1], STREAMS.halfWidthM));
	return rings;
}
