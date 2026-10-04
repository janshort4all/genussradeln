<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import StopPicture from './illustrations/StopPicture.svelte';
	import { STOP_LABELS } from '$lib/stops/kinds';
	import type { ViewStop } from '$lib/tour/view';

	/**
	 * „Einkehren unterwegs“: wenige Stopps als Karten mit Zeichnung, Kilometer, Name und Art.
	 * Stopps mit Ort sind Knöpfe – Antippen zeigt sie auf der Karte.
	 */
	interface Props {
		stops: ViewStop[];
		focusedId?: string;
		onfocus?: (id: string) => void;
	}

	let { stops, focusedId, onfocus }: Props = $props();

	const km = (value: number) => value.toLocaleString('de-DE', { maximumFractionDigits: 1 });

	/** „Am Wald · Biergarten“ – Lage (falls bekannt) und Art */
	function detail(stop: ViewStop): string {
		const where = stop.reasons?.[0];
		const parts = [where ? where.charAt(0).toUpperCase() + where.slice(1) : '', STOP_LABELS[stop.kind]];
		return parts.filter(Boolean).join(' · ');
	}
</script>

<ul class="cards">
	{#each stops as stop (stop.id)}
		{#snippet content()}
			<span class="picture"><StopPicture kind={stop.kind} /></span>
			<span class="text">
				<span class="km">{km(stop.km)} km</span>
				<span class="name">{stop.name ?? STOP_LABELS[stop.kind]}</span>
				<span class="detail">{detail(stop)}</span>
			</span>
		{/snippet}
		<li>
			{#if stop.lngLat && onfocus}
				<button
					type="button"
					class="card"
					class:focused={stop.id === focusedId}
					aria-pressed={stop.id === focusedId}
					onclick={() => onfocus(stop.id)}
				>
					{@render content()}
					<ChevronRight class="chevron" size={24} strokeWidth={2.5} aria-hidden="true" />
					<span class="visually-hidden">– auf der Karte zeigen</span>
				</button>
			{:else}
				<div class="card">{@render content()}</div>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.cards {
		display: grid;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		display: grid;
		grid-template-columns: 6.5rem 1fr auto;
		align-items: center;
		gap: 0.875rem;
		width: 100%;
		min-height: 5.5rem;
		padding: 0.5rem 0.75rem 0.5rem 0.5rem;
		border: 2px solid var(--color-border);
		border-radius: 1rem;
		background: var(--color-surface);
		color: inherit;
		font: inherit;
		text-align: left;
		line-height: 1.3;
	}

	button.card {
		cursor: pointer;
	}

	button.card:hover,
	button.card.focused {
		border-color: var(--color-green);
	}

	.picture {
		align-self: stretch;
		min-height: 4.5rem;
		border-radius: 0.625rem;
		overflow: hidden;
	}

	.text {
		display: grid;
		justify-items: start;
		gap: 0.125rem;
		min-width: 0;
	}

	.km {
		padding: 0 0.5rem;
		border-radius: 999px;
		background: var(--color-green-light);
		color: var(--color-green);
		font-size: var(--text-small);
		font-weight: 700;
	}

	.name {
		font-weight: 700;
	}

	.detail {
		color: var(--color-text-muted);
		font-size: var(--text-small);
	}

	.card :global(.chevron) {
		color: var(--color-green);
	}
</style>
