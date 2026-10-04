<script lang="ts">
	import { STOP_LABELS } from '$lib/stops/kinds';
	import type { ViewStop } from '$lib/tour/view';

	/**
	 * „Einkehren unterwegs“: wenige Stopps wie Perlen an einer Linie, am Ende das Ziel.
	 * Stopps mit Ort sind Knöpfe – Antippen zeigt sie auf der Karte.
	 */
	interface Props {
		stops: ViewStop[];
		focusedId?: string;
		onfocus?: (id: string) => void;
		/** Ziel als letzte Perle; bei Hin- und Rückweg mit dem Hinweis „dann zurück“ */
		destination?: { km: number; name: string; returns: boolean };
	}

	let { stops, focusedId, onfocus, destination }: Props = $props();

	const km = (value: number) =>
		value < 10
			? value.toLocaleString('de-DE', { maximumFractionDigits: 1 })
			: Math.round(value).toLocaleString('de-DE');

	/** „Biergarten, am Wald“ – Art (falls der Name sie nicht schon sagt) und höchstens ein Grund */
	function detail(stop: ViewStop): string {
		const label = STOP_LABELS[stop.kind];
		const parts = [stop.name && !stop.name.toLowerCase().includes(label.toLowerCase()) ? label : '', stop.reasons?.[0] ?? ''];
		return parts.filter(Boolean).join(', ');
	}
</script>

<ol class="chain">
	{#each stops as stop (stop.id)}
		{@const text = detail(stop)}
		<li>
			{#if stop.lngLat && onfocus}
				<button
					type="button"
					class="bead-row"
					class:focused={stop.id === focusedId}
					aria-pressed={stop.id === focusedId}
					onclick={() => onfocus(stop.id)}
				>
					<span class="name">{stop.name ?? STOP_LABELS[stop.kind]}</span>
					<span class="detail">nach {km(stop.km)} km{text ? ` · ${text}` : ''}</span>
					<span class="visually-hidden">– auf der Karte zeigen</span>
				</button>
			{:else}
				<div class="bead-row">
					<span class="name">{stop.name ?? STOP_LABELS[stop.kind]}</span>
					<span class="detail">nach {km(stop.km)} km{text ? ` · ${text}` : ''}</span>
				</div>
			{/if}
		</li>
	{/each}
	{#if destination}
		<li class="end">
			<div class="bead-row">
				<span class="name">{destination.name}</span>
				<span class="detail">
					nach {km(destination.km)} km · {destination.returns ? 'Ihr Ziel, dann auf anderem Weg zurück' : 'Ihr Ziel'}
				</span>
			</div>
		</li>
	{/if}
</ol>

<style>
	.chain {
		position: relative;
		margin: 0;
		padding: 0 0 0 2.25rem;
		list-style: none;
	}

	li {
		position: relative;
	}

	/* Perle: Sonnengelb für Einkehr, Dunkelgrün fürs Ziel */
	li::before {
		content: '';
		position: absolute;
		left: -2.25rem;
		top: 0.875rem;
		width: 1.125rem;
		height: 1.125rem;
		border-radius: 50%;
		background: var(--color-sun);
		border: 2px solid var(--color-green);
	}

	/* gepunktete Linie von jeder Perle zur nächsten */
	li:not(:last-child)::after {
		content: '';
		position: absolute;
		left: calc(-1.6875rem - 1.5px);
		top: 2rem;
		bottom: -0.875rem;
		border-left: 3px dotted var(--color-orange);
	}

	li.end::before {
		background: var(--color-green);
	}

	.bead-row {
		display: grid;
		width: 100%;
		min-height: var(--tap);
		padding: 0.625rem 0.5rem;
		border: 0;
		border-radius: var(--radius);
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		line-height: 1.35;
	}

	button.bead-row {
		cursor: pointer;
	}

	button.bead-row:hover,
	button.bead-row.focused {
		background: var(--color-green-light);
	}

	.name {
		font-weight: 700;
	}

	.detail {
		color: var(--color-text-muted);
	}
</style>
