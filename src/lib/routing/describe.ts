/** Wege in Worten beschreiben – keine Prozentzahlen, keine Fachbegriffe */
import type { RouteStats } from '$lib/scoring/score';

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

/** Ein Satz zum Besonderen, z. B. „Ein gutes Stück am Wasser und ab und zu durch den Wald.“ */
export function highlightSentence(s: RouteStats): string {
	// features() liefert nur Anteile ≥ 15 %, amountWord() hat dafür immer ein Wort
	const parts = features(s)
		.slice(0, 2)
		.map((f) => `${amountWord(f.share)} ${f.phrase}`);
	let sentence = parts.length ? parts.join(' und ') : 'Ein ruhiger Weg ohne viele Besonderheiten';
	if (s.major < 0.03) sentence += ', kaum große Straßen';
	else if (s.major > 0.15) sentence += ', aber ein Stück an größeren Straßen';
	sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
	return `${sentence}.`;
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
