<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { extraDistanceText } from '$lib/routing/describe';
	import type { PlannedTour } from '$lib/tour/model';
	import { formatDuration } from '$lib/tour/sample';

	/** Karte für einen berechneten Weg zum Ziel. Die ganze Karte ist ein Link zum Tourdetail. */
	interface Props {
		tour: PlannedTour;
		/** Farbe des Wegs auf der Karte */
		color: string;
		selected?: boolean;
	}

	let { tour, color, selected = false }: Props = $props();

	const km = $derived(
		(tour.stats.distance / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
	);
</script>

<article class="route-card" class:selected style:--route-color={color}>
	<div class="head">
		<span class="swatch" aria-hidden="true"></span>
		{#if tour.label}<span class="label">{tour.label}</span>{/if}
	</div>
	<h2>
		<a href={resolve('/tour/[id]', { id: tour.id })}>{tour.title}</a>
	</h2>
	<p class="facts">{km} km · ca. {formatDuration(tour.minutes)} · {tour.stats.climb}</p>
	<p class="highlight">{tour.highlight}</p>
	<div class="footer">
		<span class="muted">{extraDistanceText(tour.extraDistance)}</span>
		<span class="more" aria-hidden="true">Ansehen <ChevronRight size={22} strokeWidth={2.5} /></span>
	</div>
</article>

<style>
	.route-card {
		position: relative;
		padding: 1rem 1.125rem 1.125rem;
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

	.head {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		min-height: 1.75rem;
		margin-bottom: 0.25rem;
	}

	.swatch {
		width: 2rem;
		height: 0.5rem;
		border-radius: 0.25rem;
		background: var(--route-color);
	}

	.label {
		padding: 0.125rem 0.625rem;
		border-radius: 999px;
		background: var(--color-sun-light);
		color: var(--color-green);
		font-size: var(--text-small);
		font-weight: 700;
	}

	h2 {
		margin-bottom: 0.625rem;
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

	.facts {
		margin: 0 0 0.5rem;
		font-weight: 700;
	}

	.highlight {
		margin-bottom: 0.75rem;
	}

	.footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 0.75rem;
	}

	.more {
		display: inline-flex;
		align-items: center;
		color: var(--color-green);
		font-weight: 700;
	}
</style>
