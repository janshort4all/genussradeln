<script lang="ts">
	import { resolve } from '$app/paths';
	import BackLink from '$lib/components/BackLink.svelte';
	import TourCard from '$lib/components/TourCard.svelte';
	import { sampleTours } from '$lib/tour/sample';
</script>

<svelte:head>
	<title>Genuss-Radeln – Beispiel-Runden</title>
</svelte:head>

<BackLink href={resolve('/runde')} label="Wunsch ändern" />

<h1>Beispiel-Runden</h1>
<p class="muted">
	So werden Rundtour-Vorschläge später aussehen. Die echte Berechnung folgt in einem späteren Schritt.
</p>

<ol class="tours">
	{#each sampleTours as tour, index (tour.id)}
		<li>
			<TourCard {tour} position={index + 1} />
		</li>
	{/each}
</ol>

<style>
	.tours {
		display: grid;
		gap: 1.25rem;
		margin: 1.25rem 0 1.5rem;
		padding: 0;
		list-style: none;
	}
</style>
