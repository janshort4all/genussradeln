<script lang="ts">
	import { resolve } from '$app/paths';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import BackLink from '$lib/components/BackLink.svelte';
	import Button from '$lib/components/Button.svelte';
	import TourCard from '$lib/components/TourCard.svelte';
	import { sampleTours } from '$lib/tour/sample';
</script>

<svelte:head>
	<title>Genuss-Radeln – Ihre Vorschläge</title>
</svelte:head>

<BackLink href={resolve('/')} label="Wunsch ändern" />

<h1>Drei Touren für Sie</h1>
<p class="muted">Rundtour ab Ihrem Standort · etwa 2 Stunden · gemütlich</p>

<ol class="tours">
	{#each sampleTours as tour, index (tour.id)}
		<li>
			<TourCard {tour} position={index + 1} />
		</li>
	{/each}
</ol>

<Button variant="secondary" icon={RefreshCw}>Andere Vorschläge zeigen</Button>

<style>
	.tours {
		display: grid;
		gap: 1.25rem;
		margin: 1.25rem 0 1.5rem;
		padding: 0;
		list-style: none;
	}
</style>
