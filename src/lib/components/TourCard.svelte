<script lang="ts">
	import { resolve } from '$app/paths';
	import BatteryHint from './BatteryHint.svelte';
	import { formatDuration, type SampleTour } from '$lib/tour/sample';

	/** Tourkarte auf dem Vorschläge-Screen. Die ganze Karte ist ein Link zum Tourdetail. */
	let { tour, position }: { tour: SampleTour; position: number } = $props();
</script>

<article class="tour-card">
	<div class="map-placeholder mini-map" aria-hidden="true">Karte folgt</div>
	<div class="body">
		<p class="position muted">Vorschlag {position}</p>
		<h2>
			<a href={resolve('/tour/[id]', { id: tour.id })}>{tour.name}</a>
		</h2>
		<ul class="facts">
			<li>{tour.km} km</li>
			<li>{formatDuration(tour.minutes)}</li>
			<li>Steigung: {tour.climb}</li>
		</ul>
		<p class="highlight">{tour.highlight}</p>
		<BatteryHint level={tour.battery} />
	</div>
</article>

<style>
	.tour-card {
		position: relative;
		background: var(--color-surface);
		border: 2px solid var(--color-border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.tour-card:hover {
		border-color: var(--color-green);
	}

	/* Fokus auf dem Link umrahmt die ganze Karte */
	.tour-card:has(a:focus-visible) {
		outline: 3px solid var(--color-orange);
		outline-offset: 3px;
	}

	.mini-map {
		height: 8.5rem;
		border: 0;
		border-radius: 0;
	}

	.body {
		padding: 1rem 1.125rem 1.25rem;
	}

	.position {
		margin: 0 0 0.25rem;
		font-size: var(--text-small);
	}

	h2 {
		margin-bottom: 0.5rem;
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
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.25rem;
		margin: 0 0 0.75rem;
		padding: 0;
		list-style: none;
		font-weight: 700;
	}

	.highlight {
		margin-bottom: 0.75rem;
	}
</style>
