<script lang="ts">
	import '@fontsource/atkinson-hyperlegible/400.css';
	import '@fontsource/atkinson-hyperlegible/700.css';
	import '@fontsource-variable/bricolage-grotesque/wght.css';
	import '../app.css';

	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { pwaInfo } from 'virtual:pwa-info';
	import BottomBar from '$lib/components/BottomBar.svelte';

	let { children } = $props();

	const webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	// In der Navigation keine untere Leiste – dort zählt nur die Strecke
	const showBottomBar = $derived(!page.route.id?.startsWith('/navigation'));

	onMount(async () => {
		if (pwaInfo) {
			const { registerSW } = await import('virtual:pwa-register');
			registerSW({ immediate: true });
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
	.page {
		max-width: var(--page-width);
		margin: 0 auto;
		padding: 0.5rem 1rem calc(var(--bottom-bar-height) + 2.5rem + env(safe-area-inset-bottom));
	}

	/* Seiten mit Karte dürfen am PC breiter sein (Karte links, Angaben rechts) */
	@media (min-width: 64rem) {
		.page:has(:global(.wide)) {
			max-width: 80rem;
			padding-inline: 2rem;
		}
	}
</style>
