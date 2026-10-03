<script lang="ts">
	import { resolve } from '$app/paths';
	import Clock from '@lucide/svelte/icons/clock';
	import MapIcon from '@lucide/svelte/icons/map';
	import Mountain from '@lucide/svelte/icons/mountain';
	import Navigation from '@lucide/svelte/icons/navigation';
	import Route from '@lucide/svelte/icons/route';
	import Send from '@lucide/svelte/icons/send';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import BackLink from '$lib/components/BackLink.svelte';
	import BatteryHint from '$lib/components/BatteryHint.svelte';
	import Button from '$lib/components/Button.svelte';
	import LandscapeChip from '$lib/components/LandscapeChip.svelte';
	import TourScene from '$lib/components/illustrations/TourScene.svelte';
	import { stopIcons } from '$lib/components/icons';
	import { formatDuration, stopLabel } from '$lib/tour/sample';

	let { data } = $props();
	const tour = $derived(data.tour);

	let notice = $state('');
</script>

<svelte:head>
	<title>Genuss-Radeln – {tour.name}</title>
</svelte:head>

<BackLink href={resolve('/vorschlaege')} label="Zurück zu den Vorschlägen" />

<div class="map" role="img" aria-label="Karte der Tour (folgt in einem späteren Schritt)">
	<TourScene kind={tour.scene} />
	<span class="map-note"><MapIcon size={20} aria-hidden="true" /> Karte folgt bald</span>
</div>

<h1>{tour.name}</h1>

<ul class="tags" aria-label="Landschaft">
	{#each tour.tags as tag (tag)}
		<li><LandscapeChip {tag} /></li>
	{/each}
</ul>

<dl class="facts">
	<div>
		<dt><Route size={20} aria-hidden="true" /> Länge</dt>
		<dd>{tour.km} km</dd>
	</div>
	<div>
		<dt><Clock size={20} aria-hidden="true" /> Dauer</dt>
		<dd>ca. {formatDuration(tour.minutes)}</dd>
	</div>
	<div>
		<dt><Mountain size={20} aria-hidden="true" /> Steigung</dt>
		<dd>{tour.climb}</dd>
	</div>
</dl>

<BatteryHint level={tour.battery} />

<section class="stops">
	<h2>Unterwegs erwartet Sie</h2>
	<ol>
		{#each tour.stops as stop (stop.km)}
			{@const style = stopIcons[stop.kind]}
			<li>
				<span class="km">km {stop.km}</span>
				<span class="stop-icon" style:color={style.color} style:background={style.background}>
					<style.icon size={24} strokeWidth={2.25} aria-hidden="true" />
				</span>
				<span>
					<strong>{stop.name}</strong>
					<span class="muted kind">{stopLabel[stop.kind]}</span>
				</span>
			</li>
		{/each}
	</ol>
</section>

<div class="actions">
	<Button variant="primary" icon={Navigation} href={resolve('/navigation/[id]', { id: tour.id })}>
		Losfahren
	</Button>
	<Button icon={SlidersHorizontal} onclick={() => (notice = 'Anpassen kommt in einem späteren Schritt.')}>
		Tour anpassen
	</Button>
	<Button
		icon={Send}
		onclick={() => (notice = 'Das Senden ans E-Bike-Display kommt in einem späteren Schritt.')}
	>
		An mein E-Bike-Display senden
	</Button>
	<p class="notice" role="status">{notice}</p>
</div>

<style>
	.map {
		position: relative;
		height: 11rem;
		margin: 0.25rem 0 1.25rem;
		border-radius: 1rem;
		overflow: hidden;
		border: 1px solid var(--color-border);
	}

	.map-note {
		position: absolute;
		right: 0.75rem;
		bottom: 0.75rem;
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.75rem;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.9);
		color: var(--color-text-muted);
		font-size: var(--text-small);
		font-weight: 700;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0 0 1rem;
		padding: 0;
		list-style: none;
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
		box-shadow: 0 1px 2px rgb(27 31 26 / 0.05);
	}

	dt {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		color: var(--color-text-muted);
		font-size: var(--text-small);
	}

	dt :global(svg) {
		color: var(--color-green);
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
		grid-template-columns: 4rem 2.75rem 1fr;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--color-border);
	}

	.km {
		font-weight: 700;
		color: var(--color-green);
	}

	.stop-icon {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 50%;
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
