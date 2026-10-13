/**
 * Fortschritt der Wegplanung für das Wartebild (Jan, 13.10.2026): Die Planung meldet, in welcher Etappe sie gerade ist und wie weit sie ist;
 * die Anzahl der bisher gerechneten Wege kommt aus dem Zähler um den Routenplaner (plan-deps.ts). Alles nur Anzeige – ändert nichts am Ergebnis.
 */
export type PlanStage =
	/** Weg zum Ziel finden */
	| 'direct'
	/** schöne Stellen (Wald, Seen, Grün) suchen */
	| 'places'
	/** Bächen und Flüssen folgen */
	| 'waters'
	/** ganz andere Wege ausprobieren */
	| 'alternatives'
	/** Runde: Richtung für Richtung ausprobieren */
	| 'directions'
	/** durch Wald und Park statt daneben vorbei */
	| 'through'
	/** die schönsten auswählen, benennen */
	| 'finish';

/** Meldung der Planung selbst */
export interface StageReport {
	stage: PlanStage;
	/** 0 … 1 */
	fraction: number;
}

/** Meldung an die Seite: dazu die Zahl der bisher gerechneten Wege */
export interface PlanProgress extends StageReport {
	requests: number;
}

/** Teilbereich [von, bis] des Gesamtfortschritts: eine Meldung 0 … 1 wird in diesen Bereich abgebildet */
export function within(report: ((r: StageReport) => void) | undefined, from: number, to: number): ((r: StageReport) => void) | undefined {
	return report && ((r) => report({ stage: r.stage, fraction: from + (to - from) * r.fraction }));
}
