import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android-Hülle (Jan, 14.10.2026): Die App ist nur ein Rahmen und lädt die Online-App von GitHub Pages –
 * jedes Update kommt ohne neue Installation bei den Testpersonen an. Neu installieren muss man nur,
 * wenn sich etwas an den nativen Teilen (android/) ändert.
 */
const config: CapacitorConfig = {
	appId: 'de.genussradeln.app',
	appName: 'Genuss-Radeln',
	// Platzhalterseite für den Fall ohne Netz beim allerersten Start; die eigentliche App kommt von server.url
	webDir: 'android-shell',
	server: {
		url: 'https://janshort4all.github.io/genussradeln/',
		androidScheme: 'https',
		// nur die eigene App darf die nativen Funktionen nutzen
		allowNavigation: ['janshort4all.github.io', '130-61-177-54.sslip.io', 'tiles.openfreemap.org']
	},
	plugins: {
		// Abstände zu den Systemleisten setzt die Hülle selbst (MainActivity); Symbole dunkel auf hellem Grund, unabhängig vom Dunkelmodus des Handys
		SystemBars: { insetsHandling: 'disable', style: 'LIGHT' }
	},
	android: {
		allowMixedContent: false
	}
};

export default config;
