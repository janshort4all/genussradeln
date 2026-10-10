/** Wege in Worten beschreiben – keine Prozentzahlen, keine Fachbegriffe */
import { bearing, type LngLat } from '$lib/geo/geo';
import type { RouteStats } from '$lib/scoring/score';

const SIDE_WORDS = ['nördlich', 'östlich', 'südlich', 'westlich'] as const;
export type SideWord = (typeof SIDE_WORDS)[number];
const SIDE_ADJECTIVES: Record<SideWord, string> = {
	nördlich: 'Nördliche',
	östlich: 'Östliche',
	südlich: 'Südliche',
	westlich: 'Westliche'
};

/** Ab dieser mittleren Abweichung von der Luftlinie (Meter) liegt ein Weg „auf einer Seite“ */
const SIDE_MIN_OFFSET_M = 250;

/**
 * Auf welcher Seite der Luftlinie Start→Ziel verläuft ein Weg überwiegend?
 * Ergebnis als Himmelsrichtung, z. B. „nördlich“ – oder undefined, wenn er etwa mittig liegt.
 */
export function sideOf(line: LngLat[], start: LngLat, end: LngLat): SideWord | undefined {
	const kx = 111_320 * Math.cos((start[1] * Math.PI) / 180);
	const ky = 110_540;
	const ax = (end[0] - start[0]) * kx;
	const ay = (end[1] - start[1]) * ky;
	const len = Math.hypot(ax, ay);
	if (len === 0 || line.length === 0) return undefined;
	let sum = 0;
	for (const p of line) {
		const px = (p[0] - start[0]) * kx;
		const py = (p[1] - start[1]) * ky;
		sum += (ax * py - ay * px) / len; // > 0: links der Fahrtrichtung
	}
	const offset = sum / line.length;
	if (Math.abs(offset) < SIDE_MIN_OFFSET_M) return undefined;
	const sideBearing = (bearing(start, end) + (offset > 0 ? -90 : 90) + 360) % 360;
	return SIDE_WORDS[Math.round(sideBearing / 90) % 4];
}

/** „Nördliche Strecke“ bzw. bei Hin- und Rückweg „Hin nördlich, zurück südlich“ */
export function sideTitle(outbound?: SideWord, inbound?: SideWord, withReturn = false): string | undefined {
	if (!withReturn) return outbound ? `${SIDE_ADJECTIVES[outbound]} Strecke` : undefined;
	if (outbound && inbound) return `Hin ${outbound}, zurück ${inbound}`;
	if (outbound) return `Hinweg ${outbound}`;
	if (inbound) return `Rückweg ${inbound}`;
	return undefined;
}

/** Anteil in Worten */
export function amountWord(share: number): string | undefined {
	if (share >= 0.66) return 'fast nur';
	if (share >= 0.45) return 'zur Hälfte';
	if (share >= 0.25) return 'ein gutes Stück';
	if (share >= 0.1) return 'ab und zu';
	return undefined;
}

const QUIET_TITLE = 'Auf ruhigen Radwegen';

interface Feature {
	share: number;
	title: string;
	phrase: string;
}

/** Benannter Höhepunkt für den Beschreibungssatz, z. B. { feature: 'water', phrase: 'am Rhein' } */
export interface NamedPhrase {
	feature: 'water' | 'forest' | 'green';
	phrase: string;
}

function features(s: RouteStats, named?: NamedPhrase): Feature[] {
	const phrase = (feature: NamedPhrase['feature'], fallback: string) =>
		named?.feature === feature ? named.phrase : fallback;
	// „Durch den Wald“ nur für den Teil, der wirklich mitten im Wald liegt; der Rest führt daran entlang
	// (ältere gespeicherte Touren kennen die Tiefe nicht – dann zählt alles als „durch“)
	const forestThrough = Math.min(s.forest, s.forestThrough ?? s.forest);
	const greenThrough = Math.min(s.green, s.greenThrough ?? s.green);
	return [
		{ share: s.water, title: 'Am Wasser entlang', phrase: phrase('water', 'am Wasser') },
		{ share: forestThrough, title: 'Durch den Wald', phrase: phrase('forest', 'durch den Wald') },
		{ share: s.forest - forestThrough, title: 'Am Wald entlang', phrase: 'am Wald entlang' },
		{ share: greenThrough, title: 'Durchs Grüne', phrase: phrase('green', 'durchs Grüne') },
		{ share: s.green - greenThrough, title: 'Am Grünen entlang', phrase: 'am Grünen entlang' },
		{ share: s.fields, title: 'Durch die Felder', phrase: 'durch die Felder' },
		{ share: s.quiet, title: QUIET_TITLE, phrase: 'auf ruhigen Radwegen' }
	]
		.filter((f) => f.share >= 0.15)
		.sort((a, b) => b.share - a.share);
}

/** Mögliche Titel, der passendste zuerst */
export function titleOptions(s: RouteStats): string[] {
	const titles = features(s).map((f) => f.title);
	titles.push('Ruhige Nebenstrecke');
	return titles;
}

/**
 * Landschafts-Titel, die ehrlich sind: nur Landschaften, die mindestens `minShareOfTop` der stärksten erreichen.
 * (Ein Weg mit 45 % Wasser und 30 % Wald heißt nicht „Durch den Wald“.)
 */
export function honestTitles(s: RouteStats, minShareOfTop: number): string[] {
	// Titel beschreiben, was man sieht: Landschaft vor Wegart. „Ruhige Radwege“ nur ohne nennenswerte Landschaft.
	const landscape = features(s).filter((f) => f.title !== QUIET_TITLE && f.share >= 0.25);
	const ranked = landscape.length ? landscape : features(s);
	if (!ranked.length) return [];
	return ranked.filter((f) => f.share >= ranked[0].share * minShareOfTop).map((f) => f.title);
}

/** „Am Wasser entlang – östliche Strecke“ */
export function withSide(title: string, side: SideWord): string {
	return `${title} – ${SIDE_ADJECTIVES[side].toLowerCase()} Strecke`;
}

/**
 * Ein Satz zum Besonderen, z. B. „Ein gutes Stück am Wasser und ab und zu durch den Wald.“
 * Ist `title` ein Landschafts-Titel (z. B. „Durch den Wald“), steht diese Landschaft vorne.
 */
export function highlightSentence(s: RouteStats, title?: string, named?: NamedPhrase): string {
	const ranked = features(s, named);
	// der Teil, nach dem der Weg heißt, steht vorne („Am Rhein entlang …“ → „… am Rhein …“)
	const first = ranked.findIndex((f) => (named ? f.phrase === named.phrase : title?.startsWith(f.title)));
	if (first > 0) ranked.unshift(...ranked.splice(first, 1));
	// features() liefert nur Anteile ≥ 15 %, amountWord() hat dafür immer ein Wort
	const parts = ranked.slice(0, 2).map((f) => `${amountWord(f.share)} ${f.phrase}`);
	const traffic = trafficShare(s);
	let sentence = parts.length
		? parts.join(' und ')
		: traffic > 0.15
			? 'Ein Weg ohne viele Besonderheiten'
			: 'Ein ruhiger Weg ohne viele Besonderheiten';
	if (traffic < 0.03) sentence += ', kaum große Straßen';
	else if ((s.roadside ?? 0) > 0.15) sentence += ', aber ein Stück auf dem Radweg neben einer großen Straße';
	else if (traffic > 0.15) sentence += ', aber ein Stück an größeren Straßen';
	sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
	return `${sentence}.`;
}

/** Titel nach einer Straße: „Über die Uerdinger Straße“, „Über den Rheindeich“, „Über „Am Bruch““ */
export function viaStreetTitle(street: string): string {
	const lower = street.toLowerCase();
	if (/^(am|an|auf|im|in|zum|zur|unter|hinter|vor)\b/.test(lower)) return `Über „${street}“`;
	if (/(straße|strasse|allee|gasse|promenade|chaussee)$/.test(lower)) return `Über die ${street}`;
	if (/(weg|ring|deich|damm|pfad|platz|steig|graben|wall|kanal)$/.test(lower)) return `Über den ${street}`;
	return `Über ${street}`;
}

/** „2,1 km länger als der direkte Weg“ */
export function extraDistanceText(meters: number): string {
	if (meters < 300) return 'So kurz wie der direkte Weg';
	return `${(meters / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km länger als der direkte Weg`;
}

/** „viel Grün“ / „etwas Grün“ / „wenig Grün“ */
export function natureWord(share: number): string {
	if (share >= 0.5) return 'viel Grün und Wasser';
	if (share >= 0.25) return 'etwas Grün und Wasser';
	return 'wenig Grün';
}

/**
 * Haken, den man vor der Fahrt wissen sollte (E-Bike-Fahrer wollen wissen, ob es holpert) – sonst nichts.
 * Große Straßen nennt schon der Beschreibungssatz (highlightSentence).
 */
export function caveatOf(s: RouteStats): string | undefined {
	if (s.badSurface >= 0.1) return 'Achtung: ein längeres Stück über Wiese, Sand oder Kopfsteinpflaster.';
	return undefined;
}

/** Anteil an oder direkt neben großen Straßen (Radwege daneben sind genauso laut) */
function trafficShare(s: RouteStats): number {
	return s.major + (s.roadside ?? 0);
}

/** Kurze Pluspunkte zum Abhaken (höchstens drei), z. B. „Ruhige Radwege“, „Kaum Autoverkehr“, „Überwiegend flach“ */
export function checksOf(s: RouteStats): string[] {
	const checks: string[] = [];
	if (s.quiet >= 0.5) checks.push('Ruhige Radwege');
	if (trafficShare(s) < 0.03) checks.push('Kaum Autoverkehr');
	else if (trafficShare(s) < 0.1) checks.push('Wenig Autoverkehr');
	if (s.climb === 'flach') checks.push('Überwiegend flach');
	if (s.badSurface < 0.03) checks.push('Gut befahrbare Wege');
	if (s.water >= 0.2) checks.push('Ein Stück am Wasser');
	return checks.slice(0, 3);
}
