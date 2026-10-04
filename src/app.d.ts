// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import 'vite-plugin-pwa/info';
import 'vite-plugin-pwa/vanillajs';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		/** Große Karte geöffnet (ID der Karte) – über den Verlauf, damit „Zurück“ sie wieder schließt */
		interface PageState {
			mapOpen?: string;
		}
		// interface Platform {}
	}
}

export {};
