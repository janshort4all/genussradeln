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

interface Feature {
	share: number;
	title: string;
	phrase: string;
}

function features(s: RouteStats): Feature[] {
	return [
		{ share: s.water, title: 'Am Wasser entlang', phrase: 'am Wasser' },
		{ share: s.forest, title: 'Durch den Wald', phrase: 'durch den Wald' },
		{ share: s.green, title: 'Durchs Grüne', phrase: 'durchs Grüne' },
		{ share: s.fields, title: 'Durch die Felder', phrase: 'durch die Felder' },
		{ share: s.quiet, title: 'Auf ruhigen Radwegen', phrase: 'auf ruhigen Radwegen' }
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
 * Ein Satz zum Besonderen, z. B. „Ein gutes Stück am Wasser und ab und zu durch den Wald.“
 * Ist `title` ein Landschafts-Titel (z. B. „Durch den Wald“), steht diese Landschaft vorne.
 */
export function highlightSentence(s: RouteStats, title?: string): string {
	const ranked = features(s);
	const named = ranked.findIndex((f) => f.title === title);
	if (named > 0) ranked.unshift(...ranked.splice(named, 1));
	// features() liefert nur Anteile ≥ 15 %, amountWord() hat dafür immer ein Wort
	const parts = ranked.slice(0, 2).map((f) => `${amountWord(f.share)} ${f.phrase}`);
	let sentence = parts.length ? parts.join(' und ') : 'Ein ruhiger Weg ohne viele Besonderheiten';
	if (s.major < 0.03) sentence += ', kaum große Straßen';
	else if (s.major > 0.15) sentence += ', aber ein Stück an größeren Straßen';
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

/** Untergrund in Worten (E-Bike-Fahrer wollen wissen, ob es holpert) */
export function surfaceWord(s: RouteStats): string {
	if (s.badSurface < 0.03) return 'fast überall glatt';
	if (s.badSurface < 0.1) return 'überwiegend glatt, kurze Stücke Schotter oder Pflaster';
	return 'ein längeres Stück Schotter, Sand oder Pflaster';
}

/** Verkehr in Worten */
export function trafficWord(s: RouteStats): string {
	if (s.major < 0.03 && s.quiet >= 0.5) return 'fast nur Radwege, kaum Autos';
	if (s.major < 0.03) return 'ruhige Wege, kaum große Straßen';
	if (s.major < 0.1) return 'überwiegend ruhig, kurz an größeren Straßen';
	return 'ein Stück an größeren Straßen';
}
