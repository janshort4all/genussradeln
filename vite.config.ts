import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vitest/config';

// Gleiche Logik wie paths.base in svelte.config.js (GitHub Pages: /<repo-name>)
const basePath = process.argv.includes('dev') ? '' : (process.env.BASE_PATH ?? '');

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			base: `${basePath}/`,
			scope: `${basePath}/`,
			registerType: 'autoUpdate',
			manifest: {
				name: 'Genuss-Radeln',
				short_name: 'Genuss-Radeln',
				description: 'Schöne Radtouren am Niederrhein – einfach vorschlagen lassen.',
				lang: 'de',
				start_url: '.',
				scope: '.',
				display: 'standalone',
				orientation: 'portrait',
				background_color: '#F7F2E5',
				theme_color: '#F7F2E5',
				icons: [
					{ src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
					{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{
						src: 'maskable-icon-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				globPatterns: [
					'client/**/*.{js,css,ico,png,svg,webp,jpg,woff,woff2,webmanifest}',
					'client/data/*.{json,bin}',
					'prerendered/**/*.{html,json}'
				],
				// Kartenkacheln, Kartenbeschreibung und Schriften von OpenFreeMap bleiben auf dem Handy, sobald sie einmal geladen sind
				// (auch die vorgeladenen, siehe src/lib/map/prefetch.ts): dieselbe Stelle noch einmal und die Karte ohne Netz gehen so.
				// Begrenzt auf ca. 600 Kacheln (rund 60 MB) und 30 Tage; ist der Speicher des Handys voll, werden sie zuerst geräumt.
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/tiles\.openfreemap\.org\/planet\/[^/]+\/\d+\/\d+\/\d+\.pbf$/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'karte-kacheln',
							expiration: { maxEntries: 600, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true },
							cacheableResponse: { statuses: [200] }
						}
					},
					{
						urlPattern: /^https:\/\/tiles\.openfreemap\.org\/(planet|styles\/[^/]+)$/,
						handler: 'StaleWhileRevalidate',
						options: {
							cacheName: 'karte-beschreibung',
							expiration: { maxEntries: 10, maxAgeSeconds: 30 * 24 * 3600 },
							cacheableResponse: { statuses: [200] }
						}
					},
					{
						urlPattern: /^https:\/\/tiles\.openfreemap\.org\/fonts\/.+\.pbf$/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'karte-schriften',
							expiration: { maxEntries: 80, maxAgeSeconds: 90 * 24 * 3600, purgeOnQuotaError: true },
							cacheableResponse: { statuses: [200] }
						}
					}
				]
			},
			kit: {
				base: `${basePath}/`,
				adapterFallback: '404.html',
				// 404.html in den Offline-Speicher aufnehmen (Ersatzseite für Touren-Links wie /tour/<id>)
				spa: true
			}
		})
	],
	// Wegberechnung über den Entwicklungsserver durchreichen: So kann auch das Handy im selben WLAN planen
	// (npm run dev:handy), während GraphHopper selbst nur auf dem PC erreichbar bleibt.
	server: {
		proxy: {
			'/routing': { target: 'http://localhost:8989', rewrite: (path) => path.replace(/^\/routing/, '') }
		}
	},
	// MapLibre startet seinen Worker als Modul ({ type: 'module' })
	worker: {
		format: 'es'
	},
	test: {
		include: ['src/**/*.test.ts']
	}
});
