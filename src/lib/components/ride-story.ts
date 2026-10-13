/**
 * Die „Geschichte“ des Wartebilds (RideLoader.svelte, Jan, 13.10.2026): Was Opi sagt, wie die Etappen der Planung heißen und welche
 * Landschaft gerade vorbeizieht. Alles aus der echten Planung abgeleitet (Etappe und Fortschritt kommen von der Planung) –
 * nur Anzeige. Anrede „Sie“, kurz, mit einem Augenzwinkern; nie über Opis Alter.
 */
import type { PlanStage } from '$lib/routing/progress';

/** Ein Wort in { em } wird hervorgehoben */
export type Part = string | { em: string };

export const textOf = (parts: Part[]): string => parts.map((p) => (typeof p === 'string' ? p : p.em)).join('');

/** Landschaft, die vorbeizieht – wechselt mit dem Fortschritt der Planung */
export type SceneKind = 'fields' | 'forest' | 'lake' | 'village' | 'finish';
export const SCENES: SceneKind[] = ['fields', 'forest', 'lake', 'village', 'finish'];

/** Grenzen der Stationen (Anteil der Planung): Felder, Wald, See, Dorf, wieder Wald („durch statt vorbei“), Ziel */
export const STATIONS = [0.15, 0.38, 0.6, 0.78, 0.94] as const;

export function sceneFor(fraction: number): SceneKind {
	if (fraction < STATIONS[0]) return 'fields';
	if (fraction < STATIONS[1]) return 'forest';
	if (fraction < STATIONS[2]) return 'lake';
	if (fraction < STATIONS[3]) return 'village';
	if (fraction < STATIONS[4]) return 'forest';
	return 'finish';
}

const LABELS: Record<PlanStage, string> = {
	direct: 'Den Weg zum Ziel finden',
	places: 'Schöne Stellen suchen',
	waters: 'Bächen und Flüssen folgen',
	alternatives: 'Andere Wege ausprobieren',
	directions: 'Richtungen ausprobieren',
	through: 'Durch Wald und Park führen',
	finish: 'Die schönsten auswählen'
};

export const stageLabel = (stage: PlanStage): string => LABELS[stage];

export const EXPLAIN: Part[] = [
	'Ja, das dauert. Andere Apps schicken Sie auf dem kürzesten Weg durchs Gewerbegebiet – ich suche Ihnen die ',
	{ em: 'schönsten' },
	'. Gleich mehrere!'
];

export const COFFEE: Part[] = ['Kurze ', { em: 'Kaffeepause' }, '! Der Akku lädt nebenbei.'];
export const BACK: Part[] = ['So, ', { em: 'weiter geht’s' }, '!'];

/** Was Opi zu den Etappen sagt, je zwei bis drei Sätze – jeder höchstens einmal je Wartezeit */
const QUIPS: Record<PlanStage, Part[][]> = {
	direct: [['Erst mal sehen, wie man ', { em: 'überhaupt hinkommt' }, ' …'], ['Der direkte Weg ist selten der schönste. Aber den kenne ich jetzt.']],
	places: [['Ich halte Ausschau nach ', { em: 'Wald, Wiesen und Wasser' }, '.'], ['Da hinten glitzert was. Ein See? Ich schau mal.']],
	waters: [
		['Ich folge jetzt dem Wasser. Ein Bach fließt nie geradeaus – ganz mein ', { em: 'Geschmack' }, '.'],
		['Flüsse kennen die schönsten Wege. Man muss nur fragen.']
	],
	alternatives: [['Und jetzt ganz anders: Gibt es noch ', { em: 'schönere Wege' }, '?'], ['Ich lasse keine Abzweigung aus.']],
	directions: [
		['Ich probiere ', { em: 'Richtung für Richtung' }, ' aus – einmal rund um Ihren Start.'],
		['Mal nach Norden, mal nach Süden. Die Runde muss ja irgendwo hin.'],
		['Der Kompass und ich verstehen uns bestens.']
	],
	through: [['Mitten ', { em: 'durch den Wald' }, ' statt daran vorbei – das ist doch viel schöner.'], ['Ich nehme die Abkürzung durchs Grüne.']],
	finish: [
		['Fast geschafft! Ich sortiere die ', { em: 'schönsten Wege' }, ' für Sie.'],
		['Gleich geschafft! Der Akku ist voll, und ich trete schon, ', { em: 'so schnell ich kann' }, '.']
	]
};

/** Der nächste noch nicht gesagte Satz zu dieser Etappe (`said` merkt sich die schon gesagten); `undefined`, wenn es nichts Neues gibt */
export function nextQuip(stage: PlanStage, said: Set<string>): Part[] | undefined {
	const next = QUIPS[stage].find((q) => !said.has(textOf(q)));
	if (next) said.add(textOf(next));
	return next;
}

/** Wann Opi eine Kaffeepause macht (Sekunden seit Beginn) und wie lange sie dauert */
export const COFFEE_AT = [30, 80] as const;
export const COFFEE_SECONDS = 7;
