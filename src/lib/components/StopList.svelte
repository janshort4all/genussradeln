<script lang="ts">
	import Flag from '@lucide/svelte/icons/flag';
	import { stopIcons } from './icons';
	import { STOP_LABELS } from '$lib/stops/kinds';
	import type { ViewStop } from '$lib/tour/view';

	/**
	 * „Unterwegs erwartet Sie“: Stopps nach Kilometer. Stopps mit Ort sind Knöpfe – Antippen zeigt sie auf der Karte.
	 */
	interface Props {
		stops: ViewStop[];
		focusedId?: string;
		onfocus?: (id: string) => void;
		/** bei Hin- und Rückweg: Ziel als eigener Eintrag in der Liste */
		destination?: { km: number; name: string };
	}

	let { stops, focusedId, onfocus, destination }: Props = $props();

	type Entry = { type: 'stop'; stop: ViewStop } | { type: 'destination'; km: number; name: string };

	const entries = $derived.by((): Entry[] => {
		const list: Entry[] = stops.map((stop) => ({ type: 'stop', stop }));
		if (destination) list.push({ type: 'destination', ...destination });
		return list.sort((a, b) => (a.type === 'stop' ? a.stop.km : a.km) - (b.type === 'stop' ? b.stop.km : b.km));
	});

	const km = (value: number) => value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
</script>

<ol class="stop-list">
	{#each entries as entry (entry.type === 'stop' ? entry.stop.id : 'ziel')}
		{#if entry.type === 'destination'}
			<li class="row destination">
				<span class="km">km {km(entry.km)}</span>
				<span class="icon"><Flag size={24} strokeWidth={2.25} aria-hidden="true" /></span>
				<span><strong>{entry.name}</strong><span class="muted detail">Ihr Ziel – danach geht es zurück</span></span>
			</li>
		{:else}
			{@const stop = entry.stop}
			{@const style = stopIcons[stop.kind]}
			{#snippet content()}
				<span class="km">km {km(stop.km)}</span>
				<span class="icon" style:color={style.color} style:background={style.background}>
					<style.icon size={24} strokeWidth={2.25} aria-hidden="true" />
				</span>
				<span>
					<strong>{stop.name ?? STOP_LABELS[stop.kind]}</strong>
					<span class="muted detail">
						{stop.name ? STOP_LABELS[stop.kind] : ''}{stop.name && stop.reasons?.length ? ' · ' : ''}{stop.reasons?.join(', ') ?? ''}
					</span>
				</span>
			{/snippet}
			<li>
				{#if stop.lngLat && onfocus}
					<button
						type="button"
						class="row"
						class:focused={stop.id === focusedId}
						aria-pressed={stop.id === focusedId}
						onclick={() => onfocus(stop.id)}
					>
						{@render content()}
						<span class="visually-hidden">– auf der Karte zeigen</span>
					</button>
				{:else}
					<div class="row">{@render content()}</div>
				{/if}
			</li>
		{/if}
	{/each}
</ol>

<style>
	.stop-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.stop-list > li {
		border-bottom: 1px solid var(--color-border);
	}

	.row {
		display: grid;
		grid-template-columns: 4.25rem 2.75rem 1fr;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		min-height: var(--tap);
		padding: 0.75rem 0.25rem;
		border: 0;
		background: none;
		text-align: left;
		line-height: 1.35;
	}

	button.row {
		cursor: pointer;
		border-radius: var(--radius);
	}

	button.row:hover,
	button.row.focused {
		background: var(--color-green-light);
	}

	.km {
		font-weight: 700;
		color: var(--color-green);
	}

	.icon {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 50%;
	}

	.destination .icon {
		background: var(--color-orange-light);
		color: var(--color-orange-dark);
	}

	.detail {
		display: block;
		font-size: var(--text-small);
	}

	.detail:empty {
		display: none;
	}
</style>
