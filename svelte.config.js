import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		// Runes-Modus für eigenen Code erzwingen (nicht für Bibliotheken)
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({
			// GitHub Pages liefert 404.html für unbekannte Pfade aus → App übernimmt (z. B. /tour/abc)
			fallback: '404.html'
		}),
		paths: {
			// Auf GitHub Pages liegt die App unter /<repo-name>; lokal unter /
			base: process.argv.includes('dev') ? '' : (process.env.BASE_PATH ?? '')
		},
		// Service Worker registriert @vite-pwa/sveltekit selbst
		serviceWorker: {
			register: false
		}
	}
};

export default config;
