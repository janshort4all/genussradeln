<script lang="ts">
	import '@fontsource/atkinson-hyperlegible/400.css';
	import '@fontsource/atkinson-hyperlegible/700.css';
	import '@fontsource-variable/bricolage-grotesque/wght.css';
	import '../app.css';

	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { isNative, listenForLinks } from '$lib/native';
	import { pwaInfo } from 'virtual:pwa-info';
	import BottomBar from '$lib/components/BottomBar.svelte';

	let { children } = $props();

	const webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	// In der Navigation keine untere Leiste – dort zählt nur die Strecke
	const showBottomBar = $derived(!page.route.id?.startsWith('/navigation'));

	// Android-App: ein angetippter Tour-Link (z. B. aus WhatsApp) öffnet sich in der App
	onMount(() => (isNative() ? listenForLinks((path) => void goto(path)) : undefined));

	onMount(async () => {
		if (pwaInfo) {
			const { registerSW } = await import('virtual:pwa-register');
			// neue Fassung sofort laden; eine offen gebliebene App fragt stündlich und beim Zurückholen nach Updates
			registerSW({
				immediate: true,
				onRegisteredSW(_url, registration) {
					if (!registration) return;
					const check = () => void registration.update().catch(() => {});
					setInterval(check, 60 * 60 * 1000);
					document.addEventListener('visibilitychange', () => {
						if (document.visibilityState === 'visible') check();
					});
				}
			});
		}
	});
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- vom PWA-Plugin erzeugter Manifest-Link -->
	{@html webManifestLink}
</svelte:head>

{#if showBottomBar}
	<main class="page">
		{@render children()}
	</main>
	<BottomBar />
{:else}
	{@render children()}
{/if}

<style>
	/* --col: Breite der Spalte, --pad: Seitenrand, --bleed: Abstand vom Fensterrand bis zum Inhalt – damit Titelbilder bis an den
	   Fensterrand reichen (auch am PC) und Text und Zahnrad trotzdem an der Spalte ausgerichtet bleiben */
	.page {
		--col: var(--page-width);
		--pad: 1rem;
		--bleed: calc((100vw - min(100vw, var(--col))) / 2 + var(--pad));
		max-width: var(--col);
		margin: 0 auto;
		/* unten genau so viel Platz wie die Leiste hoch ist: am Seitenende liegt der Inhalt unmittelbar über der Leiste, darunter ist nichts mehr
		   zu scrollen (Jan, 14.10.2026: „leerer Bereich“) */
		padding: 0.5rem var(--pad) calc(var(--bottom-bar-height) + env(safe-area-inset-bottom));
	}

	/* der Abstand zwischen Elementen steht nur zwischen ihnen, nie nach dem letzten: sonst bleibt am Seitenende (und unten in Karten) eine Lücke.
	   Ausgenommen: Bedienelemente der Karte (MapLibre) */
	.page :global(*:last-child:not([class*='maplibre'])) {
		margin-bottom: 0 !important;
	}

	/* Startseite am PC: breitere Spalte, die beiden Felder stehen nebeneinander */
	.page:has(:global(.landing)) {
		--col: 64rem;
	}

	/* Seiten mit Karte dürfen am PC breiter sein (Karte links, Angaben rechts) */
	@media (min-width: 64rem) {
		.page:has(:global(.wide)) {
			--col: 80rem;
			--pad: 2rem;
		}
	}
</style>
