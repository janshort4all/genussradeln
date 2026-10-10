/**
 * Was gerade auf den Eingabeseiten steht („Von A nach B“ und „Eine Runde drehen“). Beide Seiten teilen sich den Start;
 * beim Hin- und Herschalten geht nichts verloren. Startwerte kommen aus dem letzten Wunsch der Sitzung.
 */
import type { Place, ReturnMode } from './model';
import { session } from './session.svelte';

const last = session.request;
const ownStart = !!last && last.start.name !== 'Ihr Standort';

export const draft: {
	startMode: 'here' | 'address';
	startPlace: Place | undefined;
	destination: Place | undefined;
	returnMode: ReturnMode;
	/** gewünschte Länge der Runde in km (als Text für die Auswahl) */
	km: string;
} = $state({
	startMode: ownStart ? 'address' : 'here',
	startPlace: ownStart ? last.start : undefined,
	destination: last && !last.round ? last.destination : undefined,
	returnMode: last && !last.round ? last.returnMode : 'one-way',
	km: String(last?.round?.km ?? 20)
});
