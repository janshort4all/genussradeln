<script lang="ts">
	import { resolve } from '$app/paths';
	import BackLink from '$lib/components/BackLink.svelte';
	import BatteryHint from '$lib/components/BatteryHint.svelte';
	import Button from '$lib/components/Button.svelte';
	import { formatDuration, stopLabel } from '$lib/tour/sample';

	let { data } = $props();
	const tour = $derived(data.tour);

	let notice = $state('');
</script>

<svelte:head>
	<title>Genuss-Radeln – {tour.name}</title>
</svelte:head>

<BackLink href={resolve('/vorschlaege')} label="Zurück zu den Vorschlägen" />

<div class="map-placeholder big-map" role="img" aria-label="Karte der Tour (folgt in einem späteren Schritt)">
	Hier erscheint die Karte mit der Strecke und den Stopps.
</div>

<h1>{tour.name}</h1>

<dl class="facts">
	<div>
		<dt>Länge</dt>
		<dd>{tour.km} km</dd>
	</div>
	<div>
		<dt>Dauer</dt>
		<dd>ca. {formatDuration(tour.minutes)}</dd>
	</div>
	<div>
		<dt>Steigung</dt>
		<dd>{tour.climb}</dd>
	</div>
</dl>

<BatteryHint level={tour.battery} />

<section class="stops">
	<h2>Unterwegs erwartet Sie</h2>
	<ol>
		{#each tour.stops as stop (stop.km)}
			<li>
				<span class="km">km {stop.km}</span>
				<span>
					<strong>{stop.name}</strong>
					<span class="muted kind">{stopLabel[stop.kind]}</span>
				</span>
			</li>
		{/each}
	</ol>
</section>

<div class="actions">
	<Button variant="primary" href={resolve('/navigation/[id]', { id: tour.id })}>Losfahren</Button>
	<Button onclick={() => (notice = 'Anpassen kommt in einem späteren Schritt.')}>Tour anpassen</Button>
	<Button onclick={() => (notice = 'Das Senden ans E-Bike-Display kommt in einem späteren Schritt.')}>
		An mein E-Bike-Display senden
	</Button>
	<p class="notice" role="status">{notice}</p>
</div>

<style>
	.big-map {
		height: 16rem;
		margin: 0.25rem 0 1.25rem;
	}

	/* Kacheln rutschen bei wenig Platz (oder großer Schrift) in die nächste Zeile */
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin: 0 0 1rem;
	}

	.facts div {
		flex: 1 1 auto;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 0.625rem 0.75rem;
	}

	dt {
		color: var(--color-text-muted);
		font-size: var(--text-small);
	}

	dd {
		margin: 0;
		font-weight: 700;
		font-size: var(--text-large);
		white-space: nowrap;
	}

	.stops {
		margin: 1.75rem 0;
	}

	.stops ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.stops li {
		display: grid;
		grid-template-columns: 4.5rem 1fr;
		gap: 0.75rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--color-border);
	}

	.km {
		font-weight: 700;
		color: var(--color-green);
	}

	.kind {
		display: block;
		font-size: var(--text-small);
	}

	.actions {
		display: grid;
		gap: 0.75rem;
	}

	.notice {
		min-height: 1.5em;
		margin: 0;
		color: var(--color-text-muted);
	}
</style>
