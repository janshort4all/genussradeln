<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import Button from '$lib/components/Button.svelte';
	import { unpackTour } from '$lib/share/link';
	import { session } from '$lib/tour/session.svelte';

	/**
	 * Geteilte Tour öffnen: Die Tour steckt im Link hinter dem „#“ (wird nie an einen Server geschickt).
	 * Sie wird auf dem Gerät abgelegt und gleich im Tourdetail gezeigt.
	 */
	let failed = $state(false);

	onMount(async () => {
		const packed = location.hash.slice(1);
		try {
			if (!packed) throw new Error('leer');
			const tour = await unpackTour(packed);
			session.addShared(tour);
			await goto(resolve('/tour/[id]', { id: tour.id }), { replaceState: true });
		} catch (error) {
			console.warn('Geteilte Tour:', error);
			failed = true;
		}
	});
</script>

<svelte:head>
	<title>Genuss-Radeln – Tour öffnen</title>
</svelte:head>

{#if failed}
	<h1>Diese Tour lässt sich nicht öffnen</h1>
	<p>Der Link ist vermutlich unvollständig – manchmal schneiden Nachrichten-Apps lange Links ab. Bitte lassen Sie sich die Tour noch einmal schicken.</p>
	<Button variant="primary" href={resolve('/')}>Zur Startseite</Button>
{:else}
	<h1>Tour wird geöffnet …</h1>
{/if}
