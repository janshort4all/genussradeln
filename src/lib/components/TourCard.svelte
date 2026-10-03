<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Clock from '@lucide/svelte/icons/clock';
	import Mountain from '@lucide/svelte/icons/mountain';
	import Route from '@lucide/svelte/icons/route';
	import BatteryHint from './BatteryHint.svelte';
	import LandscapeChip from './LandscapeChip.svelte';
	import TourScene from './illustrations/TourScene.svelte';
	import { formatDuration, type SampleTour } from '$lib/tour/sample';

	/** Tourkarte auf dem Vorschläge-Screen. Die ganze Karte ist ein Link zum Tourdetail. */
	let { tour, position }: { tour: SampleTour; position: number } = $props();
</script>

<article class="tour-card">
	<div class="scene">
		<TourScene kind={tour.scene} />
		<span class="position">Vorschlag {position}</span>
	</div>
	<div class="body">
		<h2>
			<a href={resolve('/tour/[id]', { id: tour.id })}>{tour.name}</a>
		</h2>
		<ul class="tags" aria-label="Landschaft">
			{#each tour.tags as tag (tag)}
				<li><LandscapeChip {tag} /></li>
			{/each}
		</ul>
		<ul class="facts">
			<li><Route size={22} aria-hidden="true" /> {tour.km} km</li>
			<li><Clock size={22} aria-hidden="true" /> {formatDuration(tour.minutes)}</li>
			<li><Mountain size={22} aria-hidden="true" /> Steigung: {tour.climb}</li>
		</ul>
		<p class="highlight">{tour.highlight}</p>
		<div class="footer">
			<BatteryHint level={tour.battery} />
			<span class="more" aria-hidden="true">Ansehen <ChevronRight size={22} strokeWidth={2.5} /></span>
		</div>
	</div>
</article>

<style>
	.tour-card {
		position: relative;
		background: var(--color-surface);
		border: 2px solid var(--color-border);
		border-radius: 1rem;
		overflow: hidden;
		box-shadow: 0 2px 10px rgb(27 31 26 / 0.07);
		transition: border-color 0.15s;
	}

	.tour-card:hover {
		border-color: var(--color-green);
	}

	/* Fokus auf dem Link umrahmt die ganze Karte */
	.tour-card:has(a:focus-visible) {
		outline: 3px solid var(--color-orange);
		outline-offset: 3px;
	}

	.scene {
		position: relative;
		height: 8.5rem;
	}

	.position {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		padding: 0.125rem 0.75rem;
		border-radius: 999px;
		background: var(--color-surface);
		color: var(--color-text);
		font-size: var(--text-small);
		font-weight: 700;
		box-shadow: 0 1px 4px rgb(27 31 26 / 0.15);
	}

	.body {
		padding: 1rem 1.125rem 1.125rem;
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

	.tags,
	.facts {
		display: flex;
		flex-wrap: wrap;
		margin: 0 0 0.75rem;
		padding: 0;
		list-style: none;
	}

	.tags {
		gap: 0.5rem;
	}

	.facts {
		gap: 0.375rem 1.25rem;
		font-weight: 700;
	}

	.facts li {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
	}

	.facts :global(svg) {
		color: var(--color-green);
	}

	.highlight {
		margin-bottom: 0.875rem;
	}

	.footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.more {
		display: inline-flex;
		align-items: center;
		color: var(--color-green);
		font-weight: 700;
	}
</style>
