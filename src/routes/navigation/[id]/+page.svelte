<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from '$lib/components/Button.svelte';

	let { data } = $props();
	const tour = $derived(data.tour);
	const nextStop = $derived(tour.stops[0]);

	let paused = $state(false);
</script>

<svelte:head>
	<title>Genuss-Radeln – Unterwegs</title>
</svelte:head>

<div class="navigation">
	<section class="instruction" aria-live="polite">
		<svg class="turn" aria-hidden="true" viewBox="0 0 64 64" width="88" height="88">
			<path
				d="M20 58 V30 a8 8 0 0 1 8 -8 H46"
				fill="none"
				stroke="currentColor"
				stroke-width="7"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
			<path d="M38 10 L52 22 L38 34" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
		<div>
			<p class="distance">In 200 m</p>
			<p class="what">rechts auf den Rheinradweg</p>
		</div>
	</section>

	<div class="map" role="img" aria-label="Karte mit Ihrer Position (folgt in einem späteren Schritt)">
		{#if paused}
			<p class="paused">Pause – die Ansagen schweigen.</p>
		{:else}
			<p>Hier erscheint die Karte mit Ihrer Position.</p>
		{/if}
	</div>

	<dl class="status">
		<div>
			<dt>Noch</dt>
			<dd>18 km</dd>
		</div>
		<div>
			<dt>Ankunft</dt>
			<dd>ca. 15:40</dd>
		</div>
		{#if nextStop}
			<div class="wide">
				<dt>Nächster Stopp</dt>
				<dd>{nextStop.name} in 6 km</dd>
			</div>
		{/if}
	</dl>

	<div class="actions">
		<Button variant="primary" dark onclick={() => (paused = !paused)}>
			{paused ? 'Weiterfahren' : 'Pause'}
		</Button>
		<Button dark href={resolve('/tour/[id]', { id: tour.id })}>Beenden</Button>
	</div>
</div>

<style>
	.navigation {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: max(0.75rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom));
		background: var(--color-nav-bg);
		color: var(--color-nav-text);
		overflow-y: auto;
	}

	.instruction {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--color-nav-surface);
		border-radius: var(--radius);
	}

	.turn {
		flex: none;
		color: var(--color-nav-orange);
	}

	.distance {
		margin: 0;
		font-family: var(--font-title);
		font-size: 2.5rem;
		font-weight: 700;
		line-height: 1.1;
	}

	.what {
		margin: 0.25rem 0 0;
		font-size: 1.5rem;
		font-weight: 700;
		line-height: 1.25;
	}

	.map {
		flex: 1;
		min-height: 10rem;
		display: grid;
		place-items: center;
		padding: 1rem;
		border: 1px solid #333333;
		border-radius: var(--radius);
		color: var(--color-nav-muted);
		text-align: center;
	}

	.paused {
		color: var(--color-nav-orange);
		font-weight: 700;
		font-size: var(--text-large);
	}

	.status {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem 1rem;
		margin: 0;
	}

	.status .wide {
		grid-column: 1 / -1;
	}

	dt {
		color: var(--color-nav-muted);
		font-size: var(--text-small);
	}

	dd {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
		line-height: 1.25;
	}

	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
</style>
