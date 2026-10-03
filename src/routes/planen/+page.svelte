<script lang="ts">
	import { resolve } from '$app/paths';
	import MapPinPlus from '@lucide/svelte/icons/map-pin-plus';
	import BackLink from '$lib/components/BackLink.svelte';
	import TourScene from '$lib/components/illustrations/TourScene.svelte';
</script>

<svelte:head>
	<title>Genuss-Radeln – Selbst planen</title>
</svelte:head>

<BackLink href={resolve('/')} label="Zur Tourensuche" />

<h1>Selbst planen</h1>
<p>Tippen Sie Punkte auf der Karte an. Die App verbindet sie über schöne Wege.</p>

<div class="plan-map" role="img" aria-label="Karte zum Planen (folgt in einem späteren Schritt)">
	<TourScene kind="fields" />
	<span class="note"><MapPinPlus size={22} aria-hidden="true" /> Die Karte zum Planen folgt bald.</span>
</div>

<style>
	.plan-map {
		position: relative;
		height: 14rem;
		border-radius: 1rem;
		overflow: hidden;
		border: 1px solid var(--color-border);
	}

	.note {
		position: absolute;
		left: 50%;
		top: 50%;
		translate: -50% -50%;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		width: max-content;
		max-width: calc(100% - 2rem);
		padding: 0.5rem 1rem;
		border-radius: var(--radius);
		background: rgb(253 251 245 / 0.92);
		color: var(--color-green);
		font-weight: 700;
	}

	.note :global(svg) {
		flex: none;
	}
</style>
