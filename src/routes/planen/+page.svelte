<script lang="ts">
	import { resolve } from '$app/paths';
	import BackLink from '$lib/components/BackLink.svelte';
</script>

<svelte:head>
	<title>Genuss-Radeln – Selbst planen</title>
</svelte:head>

<BackLink href={resolve('/')} label="Zur Tourensuche" />

<h1>Selbst planen</h1>
<p>Tippen Sie Punkte auf der Karte an. Die App verbindet sie über schöne Wege.</p>

<div class="map-placeholder plan-map" role="img" aria-label="Karte zum Planen (folgt in einem späteren Schritt)">
	Hier erscheint die Karte zum Planen.
</div>

<style>
	.plan-map {
		height: 22rem;
	}
</style>
