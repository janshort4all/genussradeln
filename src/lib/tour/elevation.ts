/**
 * Höhenprofil eines Wegs. Die Höhendaten (Satellit, ca. 90 m Raster) sind verrauscht – Brücken, Dämme und
 * Gebäude erzeugen Zacken. Deshalb wird gleichmäßig abgetastet, geglättet und Höhenmeter erst ab einer
 * kleinen Schwelle gezählt.
 */
import { distance } from '$lib/geo/geo';
import { CLIMB_WORDS } from '$lib/scoring/weights';

export interface ProfilePoint {
	/** Meter ab Start */
	d: number;
	/** Höhe in Metern (geglättet) */
	ele: number;
}

export interface ElevationProfile {
	points: ProfilePoint[];
	/** Meter bergauf / bergab (geglättet) */
	ascent: number;
	descent: number;
	min: number;
	max: number;
	/** Meter ab Start, an denen der höchste Punkt liegt */
	highestAt: number;
	/** steilstes Stück in Prozent (über 200 m gemittelt) */
	maxGrade: number;
	total: number;
}

const STEP_M = 50;
const SMOOTH_WINDOW_M = 300;
const HYSTERESIS_M = 2;
const GRADE_WINDOW_M = 200;

export function elevationProfile(coordinates: [number, number, number][]): ElevationProfile {
	// 1. Entfernung je Koordinate
	const cum: number[] = [0];
	for (let i = 1; i < coordinates.length; i++) {
		cum.push(cum[i - 1] + distance([coordinates[i - 1][0], coordinates[i - 1][1]], [coordinates[i][0], coordinates[i][1]]));
	}
	const total = cum[cum.length - 1] ?? 0;
	if (coordinates.length < 2 || total === 0) {
		const ele = coordinates[0]?.[2] ?? 0;
		return { points: [{ d: 0, ele }], ascent: 0, descent: 0, min: ele, max: ele, highestAt: 0, maxGrade: 0, total: 0 };
	}

	// 2. gleichmäßig abtasten (lineare Interpolation)
	const raw: number[] = [];
	let j = 0;
	for (let d = 0; d <= total; d += STEP_M) {
		while (j < cum.length - 2 && cum[j + 1] < d) j++;
		const span = cum[j + 1] - cum[j] || 1;
		const t = Math.min(1, Math.max(0, (d - cum[j]) / span));
		raw.push(coordinates[j][2] + (coordinates[j + 1][2] - coordinates[j][2]) * t);
	}

	// 3. gleitender Mittelwert
	const half = Math.round(SMOOTH_WINDOW_M / STEP_M / 2);
	const smooth = raw.map((_, i) => {
		const from = Math.max(0, i - half);
		const to = Math.min(raw.length - 1, i + half);
		let sum = 0;
		for (let k = from; k <= to; k++) sum += raw[k];
		return sum / (to - from + 1);
	});

	// 4. Höhenmeter mit Schwelle zählen (kleines Auf und Ab zählt nicht)
	let ascent = 0;
	let descent = 0;
	let reference = smooth[0];
	for (const ele of smooth) {
		if (ele - reference >= HYSTERESIS_M) {
			ascent += ele - reference;
			reference = ele;
		} else if (reference - ele >= HYSTERESIS_M) {
			descent += reference - ele;
			reference = ele;
		}
	}

	// 5. steilstes Stück
	const gradeSpan = Math.round(GRADE_WINDOW_M / STEP_M);
	let maxGrade = 0;
	for (let i = 0; i + gradeSpan < smooth.length; i++) {
		maxGrade = Math.max(maxGrade, (Math.abs(smooth[i + gradeSpan] - smooth[i]) / GRADE_WINDOW_M) * 100);
	}

	let highest = 0;
	smooth.forEach((ele, i) => {
		if (ele > smooth[highest]) highest = i;
	});

	return {
		points: smooth.map((ele, i) => ({ d: Math.min(total, i * STEP_M), ele })),
		ascent: Math.round(ascent),
		descent: Math.round(descent),
		min: Math.min(...smooth),
		max: Math.max(...smooth),
		highestAt: highest * STEP_M,
		maxGrade: Math.round(maxGrade * 10) / 10,
		total
	};
}

export type ClimbWord = 'flach' | 'leicht hügelig' | 'hügelig';

/** „Steigung in Worten“ aus Höhenmetern je km und dem steilsten Stück */
export function climbWordOf(profile: ElevationProfile): ClimbWord {
	const km = profile.total / 1000;
	const perKm = km > 0 ? profile.ascent / km : 0;
	if (perKm >= CLIMB_WORDS.gentleBelowMPerKm) return 'hügelig';
	if (perKm >= CLIMB_WORDS.flatBelowMPerKm || profile.maxGrade >= CLIMB_WORDS.steepGradePercent) {
		return 'leicht hügelig';
	}
	return 'flach';
}
