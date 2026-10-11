<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Clock from '@lucide/svelte/icons/clock';
	import Mountain from '@lucide/svelte/icons/mountain';
	import Route from '@lucide/svelte/icons/route';
	import type { LngLat } from '$lib/geo/geo';
	import { extraDistanceText } from '$lib/routing/describe';
	import type { PlannedTour } from '$lib/tour/model';
	import { formatDuration } from '$lib/tour/sample';
	import RouteThumb from './RouteThumb.svelte';

	/** Karte für einen berechneten Weg. Die ganze Karte ist ein Link zum Tourdetail, nur „Karte ansehen“ ist ein eigener Knopf. */
	interface Props {
		tour: PlannedTour;
		/** der Weg als Linie (für die kleine Zeichnung) */
		line: LngLat[];
		/** Farbe des Wegs auf der Karte */
		color: string;
		/** „Weg 2“ – dieselbe Nummer wie im Schild auf der Karte */
		number: number;
		selected?: boolean;
		/** „Karte ansehen“: den Weg oben auf der Karte hervorheben */
		onshow?: () => void;
	}

	let { tour, line, color, number, selected = false, onshow }: Props = $props();

	const km = $derived(
		(tour.stats.distance / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
	);
</script>

<article class="route-card" class:selected style:--route-color={color}>
	<span class="badge" aria-hidden="true">{number}</span>
	<div class="titles">
		<!-- Überschrift nach der Länge („Längste Tour“), darunter der Weg in Worten -->
		<h2>
			<a href={resolve('/tour/[id]', { id: tour.id })}><span class="visually-hidden">Weg {number}: </span>{tour.label ?? tour.title}</a>
		</h2>
		{#if tour.label}<p class="name">{tour.title}</p>{/if}
	</div>
	<ChevronRight class="chevron" size={28} strokeWidth={2.5} aria-hidden="true" />
	<!-- Zahlen links, daneben die kleine Zeichnung; der Satz zum Weg darunter über die ganze Breite -->
	<div class="row">
		<p class="facts">
			<span><Route size={20} aria-hidden="true" />{km} km</span>
			<span><Clock size={20} aria-hidden="true" />ca. {formatDuration(tour.minutes)}</span>
			<span><Mountain size={20} aria-hidden="true" />{tour.stats.climb}</span>
		</p>
		<button type="button" class="thumb" onclick={onshow}>
			<span class="drawing"><RouteThumb {line} {color} /></span>
			<span class="caption">Karte ansehen<span class="visually-hidden"> von Weg {number}</span></span>
		</button>
	</div>
	<p class="highlight">{tour.highlight}</p>
	<!-- nur wenn der Weg wirklich länger ist als der direkte (bei Runden gibt es keinen direkten Weg; „so kurz wie …“ sagt nichts – Jan, 14.10.2026) -->
	{#if !tour.request.round && tour.extraDistance >= 300}
		<p class="muted extra">{extraDistanceText(tour.extraDistance)}</p>
	{/if}
</article>

<style>
	.route-card {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		column-gap: 0.75rem;
		row-gap: 0.5rem;
		padding: 1rem 0.875rem 1rem 1rem;
		background: var(--color-surface);
		border: 2px solid transparent;
		border-radius: 1rem;
	}

	.route-card:hover,
	.route-card.selected {
		border-color: var(--route-color);
	}

	.route-card:has(a:focus-visible) {
		outline: 3px solid var(--color-orange);
		outline-offset: 3px;
	}

	/* Nummer in der Farbe des Wegs – dieselbe wie auf der Karte */
	.badge {
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		background: var(--route-color);
		color: #fff;
		font-size: var(--text-large);
		font-weight: 700;
	}

	.titles {
		min-width: 0;
		align-self: center;
	}

	h2 {
		margin: 0;
	}

	h2 a {
		color: var(--color-text);
		text-decoration: none;
	}

	/* Link über die ganze Karte strecken → große Tap-Fläche */
	h2 a::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	h2 a:focus-visible {
		outline: none;
	}

	.name {
		margin: 0.125rem 0 0;
		font-weight: 700;
		color: var(--color-green);
	}

	.route-card :global(.chevron) {
		align-self: center;
		color: var(--color-green);
	}

	.row {
		grid-column: 2 / 4;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.highlight,
	.extra {
		grid-column: 1 / 4;
		margin: 0;
	}

	.facts {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		min-width: 0;
		font-weight: 700;
	}

	.facts span {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
	}

	.facts :global(svg) {
		flex: none;
		color: var(--color-olive);
	}

	/* kleine Zeichnung des Wegs mit „Karte ansehen“ – ein eigener Knopf über dem Karten-Link */
	.thumb {
		position: relative;
		z-index: 1;
		flex: none;
		display: grid;
		justify-items: center;
		gap: 0.125rem;
		width: 5.75rem;
		padding: 0.375rem 0.25rem;
		border: 2px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-green-light);
		color: var(--color-green);
		font: inherit;
		cursor: pointer;
	}

	.thumb:hover {
		border-color: var(--route-color);
	}

	.drawing {
		display: block;
		width: 3.5rem;
		height: 3.5rem;
	}

	.caption {
		font-size: var(--text-small);
		line-height: 1.2;
		text-align: center;
	}
</style>
