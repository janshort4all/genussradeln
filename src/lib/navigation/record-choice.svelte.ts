/**
 * „Fahrt aufzeichnen“ – die Wahl der Person (Häkchen), gemerkt auf dem Gerät. Wird auf der Tour-Seite (vor „Tour starten“)
 * und auf dem Startbildschirm der Navigation gezeigt; beide teilen sich diese Wahl. Voreinstellung: an (Testbetrieb).
 */
const KEY = 'genuss-fahrt-aufzeichnen';

function read(): boolean {
	try {
		return localStorage.getItem(KEY) !== 'aus';
	} catch {
		return true;
	}
}

export const recordChoice = $state({ on: read() });

export function setRecordChoice(on: boolean) {
	recordChoice.on = on;
	try {
		localStorage.setItem(KEY, on ? 'an' : 'aus');
	} catch {
		// Speicher gesperrt – dann gilt die Wahl nur, solange die App offen ist
	}
}
