<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Clock from '@lucide/svelte/icons/clock';
	import Heart from '@lucide/svelte/icons/heart';
	import MountainSnow from '@lucide/svelte/icons/mountain-snow';
	import Route from '@lucide/svelte/icons/route';
	import Search from '@lucide/svelte/icons/search';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import Button from '$lib/components/Button.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { listTours, removeTour, saveTour, type SavedTour } from '$lib/storage/tours';
	import { formatDuration } from '$lib/tour/sample';

	// Gemerkte Touren (F14): nur auf diesem Gerät, kein Konto. Entfernen lässt sich sofort zurücknehmen.
	let status: 'loading' | 'done' | 'error' = $state('loading');
	let saved: SavedTour[] = $state([]);
	let removed: SavedTour | undefined = $state();

	async function load() {
		try {
			saved = await listTours();
			status = 'done';
		} catch (error) {
			console.warn('Gemerkte Touren nicht lesbar:', error);
			status = 'error';
		}
	}

	onMount(load);

	async function remove(item: SavedTour) {
		await removeTour(item.tour.id).catch(() => {});
		removed = item;
		saved = saved.filter((s) => s.tour.id !== item.tour.id);
	}

	async function undo() {
		if (!removed) return;
		const back = removed;
		removed = undefined;
		await saveTour(back.tour).catch(() => {});
		await load();
	}

	const km = (meters: number) => (Math.round(meters / 100) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 });
</script>

<svelte:head>
	<title>Genuss-Radeln – Meine Touren</title>
</svelte:head>

<PageHeader title="Meine Touren" lead="Ihre gemerkten Touren." backHref={resolve('/')} backLabel="Zur Startseite" />

{#if removed}
	<p class="done" role="status">
		<Trash2 size={22} aria-hidden="true" />
		<span>„{removed.tour.title}“ ist entfernt.</span>
		<button type="button" class="undo" onclick={undo}><Undo2 size={20} strokeWidth={2.5} aria-hidden="true" /> Rückgängig</button>
	</p>
{/if}

{#if status === 'loading'}
	<p class="muted" role="status">Ihre Touren werden geladen …</p>
{:else if status === 'error'}
	<p class="muted">Ihre gemerkten Touren lassen sich auf diesem Gerät gerade nicht lesen.</p>
{:else if !saved.length}
	<div class="empty">
		<span class="empty-icon"><Heart size={44} strokeWidth={2} aria-hidden="true" /></span>
		<p><strong>Sie haben noch keine Tour gemerkt.</strong></p>
		<p class="muted">
			Tippen Sie bei einer Tour auf das Herz oben rechts. Gemerkte Touren bleiben nur auf diesem Gerät gespeichert. Sie
			brauchen dafür kein Konto.
		</p>
	</div>
	<Button variant="brand" icon={Search} href={resolve('/ziel')}>Eine Tour finden</Button>
{:else}
	<ul class="list">
		{#each saved as item (item.tour.id)}
			<li class="sheet">
				<a class="open" href={resolve('/tour/[id]', { id: item.tour.id })}>
					<span class="title">{item.tour.title}</span>
					<span class="trip">
						{item.tour.request.round
							? `Runde ab ${item.tour.request.start.name}`
							: `Von ${item.tour.request.start.name} zu ${item.tour.request.destination.name}`}
					</span>
					<span class="facts">
						<span><Route size={22} aria-hidden="true" /> {km(item.tour.stats.distance)} km</span>
						<span><Clock size={22} aria-hidden="true" /> {formatDuration(item.tour.minutes)}</span>
						<span><MountainSnow size={22} aria-hidden="true" /> {item.tour.stats.climb}</span>
					</span>
					<span class="more" aria-hidden="true">Ansehen <ChevronRight size={22} strokeWidth={2.5} /></span>
				</a>
				<button type="button" class="remove" onclick={() => remove(item)}>
					<Trash2 size={22} strokeWidth={2.25} aria-hidden="true" /> Entfernen
				</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.list {
		display: grid;
		gap: 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.list .sheet {
		margin: 0;
		padding: 0;
		overflow: hidden;
	}

	.open {
		display: grid;
		gap: 0.375rem;
		padding: 1rem;
		color: var(--color-text);
		text-decoration: none;
	}

	.open:focus-visible {
		outline: 3px solid var(--color-orange);
		outline-offset: -3px;
	}

	.title {
		font-family: var(--font-title);
		font-size: var(--text-h2);
		font-weight: 700;
		line-height: 1.2;
		color: var(--color-green);
	}

	.trip {
		color: var(--color-text-muted);
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		font-weight: 700;
	}

	.facts span {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
	}

	.facts :global(svg) {
		color: var(--color-olive);
	}

	.more {
		display: inline-flex;
		align-items: center;
		justify-self: end;
		color: var(--color-green);
		font-weight: 700;
	}

	.remove {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		min-height: var(--tap);
		border: 0;
		border-top: 1px solid var(--color-border);
		background: none;
		color: var(--color-text-muted);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	.remove:hover {
		background: var(--color-orange-light);
		color: var(--color-orange-dark);
	}

	.done {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 1rem;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius);
		background: var(--color-green-light);
		font-weight: 700;
	}

	.done span {
		flex: 1;
		min-width: 10rem;
	}

	.undo {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		min-height: var(--tap);
		padding: 0.25rem 0.875rem;
		border: 2px solid var(--color-green);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-green);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	.empty {
		margin: 1rem 0 1.5rem;
		padding: 1.5rem 1.25rem 0.5rem;
		border-radius: 1.5rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		text-align: center;
	}

	.empty-icon {
		display: inline-grid;
		place-items: center;
		width: 5rem;
		height: 5rem;
		margin-bottom: 0.75rem;
		border-radius: 50%;
		background: var(--color-green-light);
		color: var(--color-green);
	}
</style>
