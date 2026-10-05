<script lang="ts">
	import { goto } from '$app/navigation';
	import { asset, resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import Bike from '@lucide/svelte/icons/bike';
	import Button from '$lib/components/Button.svelte';
	import { route, RoutingUnavailableError } from '$lib/routing/graphhopper';
	import { loadLandscape } from '$lib/scoring/landscape';
	import { unpackShared } from '$lib/share/link';
	import { rebuildTour } from '$lib/share/rebuild';
	import { session } from '$lib/tour/session.svelte';

	/**
	 * Geteilte Tour öffnen: Die Tour steckt im Link hinter dem „#“ (wird nie an einen Server geschickt).
	 * Kurze Links enthalten nur Eckpunkte – dann wird der Weg hier nachgerechnet. Danach geht es zum Tourdetail.
	 */
	let problem: 'broken' | 'offline' | undefined = $state();

	onMount(async () => {
		const packed = location.hash.slice(1);
		try {
			if (!packed) throw new Error('leer');
			const shared = await unpackShared(packed);
			let tour;
			if ('tour' in shared) tour = shared.tour;
			else {
				const landscape = await loadLandscape(asset('/data/landscape.json'), asset('/data/landscape.png')).catch(
					() => undefined
				);
				tour = await rebuildTour(shared.spec, { route, landscape });
			}
			session.addShared(tour);
			await goto(resolve('/tour/[id]', { id: tour.id }), { replaceState: true });
		} catch (error) {
			console.warn('Geteilte Tour:', error);
			problem = error instanceof RoutingUnavailableError ? 'offline' : 'broken';
		}
	});
</script>

<svelte:head>
	<title>Genuss-Radeln – Tour öffnen</title>
</svelte:head>

{#if problem === 'offline'}
	<h1>Die Tour lässt sich gerade nicht öffnen</h1>
	<p>Die Wegberechnung ist nicht erreichbar. Bitte prüfen Sie die Internetverbindung und tippen Sie den Link gleich noch einmal an.</p>
	<Button variant="primary" href={resolve('/')}>Zur Startseite</Button>
{:else if problem === 'broken'}
	<h1>Diese Tour lässt sich nicht öffnen</h1>
	<p>Der Link ist vermutlich unvollständig. Bitte lassen Sie sich die Tour noch einmal schicken.</p>
	<Button variant="primary" href={resolve('/')}>Zur Startseite</Button>
{:else}
	<div class="loading" role="status">
		<Bike size={40} aria-hidden="true" />
		<p><strong>Die Tour wird geöffnet …</strong><br />Der Weg wird gerade berechnet.</p>
	</div>
{/if}

<style>
	.loading {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 1rem;
		margin: 2rem 0;
	}

	.loading p {
		margin: 0;
	}

	.loading :global(svg) {
		color: var(--color-olive);
	}
</style>
