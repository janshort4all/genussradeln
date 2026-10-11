<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import Clock from '@lucide/svelte/icons/clock';
	import Download from '@lucide/svelte/icons/download';
	import Route from '@lucide/svelte/icons/route';
	import Share2 from '@lucide/svelte/icons/share-2';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { rideMinutesRecorded, type RideRecord } from '$lib/navigation/recorder';
	import { canShareRide, downloadRide, shareRide } from '$lib/navigation/ride-file';
	import { listRides, removeRide } from '$lib/storage/rides';

	// Aufgezeichnete Fahrten (Testbetrieb): nur auf diesem Gerät. Hier lassen sie sich als Datei speichern oder verschicken –
	// auch wenn die Fahrt unterwegs abgebrochen wurde. Löschen fragt nach, damit nichts aus Versehen verloren geht.
	let status: 'loading' | 'done' | 'error' = $state('loading');
	let rides: RideRecord[] = $state([]);
	let confirming: string | undefined = $state();
	let note = $state('');

	async function load() {
		try {
			rides = (await listRides()).filter((r) => r.samples.length > 0);
			status = 'done';
		} catch (error) {
			console.warn('Fahrten nicht lesbar:', error);
			status = 'error';
		}
	}

	onMount(load);

	async function remove(ride: RideRecord) {
		await removeRide(ride.id).catch(() => {});
		confirming = undefined;
		rides = rides.filter((r) => r.id !== ride.id);
	}

	async function send(ride: RideRecord) {
		note = (await shareRide(ride)) ? '' : 'Das Verschicken hat nicht geklappt. Bitte speichern Sie die Datei stattdessen.';
	}

	const when = (t: number) =>
		new Date(t).toLocaleString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
	const km = (meters: number) => (Math.round(meters / 100) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 });
</script>

<svelte:head>
	<title>Genuss-Radeln – Aufgezeichnete Fahrten</title>
</svelte:head>

<PageHeader
	title="Aufgezeichnete Fahrten"
	lead="Ihre Fahrten aus dem Test, nur auf diesem Handy."
	backHref={resolve('/mehr')}
	backLabel="Zurück zu „Mehr“"
/>

{#if note}<p class="note" role="status">{note}</p>{/if}

{#if status === 'loading'}
	<p class="muted" role="status">Ihre Fahrten werden geladen …</p>
{:else if status === 'error'}
	<p class="muted">Die aufgezeichneten Fahrten lassen sich auf diesem Gerät gerade nicht lesen.</p>
{:else if !rides.length}
	<div class="sheet">
		<p><strong>Noch keine Fahrt aufgezeichnet.</strong></p>
		<p class="muted">
			Vor jeder Navigation steht ein Häkchen „Fahrt aufzeichnen“. Danach erscheint die Fahrt hier und lässt sich als Datei
			speichern.
		</p>
	</div>
{:else}
	<ul class="list">
		{#each rides as ride (ride.id)}
			<li class="sheet">
				<h2>{ride.title}</h2>
				<p class="when">{when(ride.startedAt)}</p>
				<p class="facts">
					<span><Route size={22} aria-hidden="true" /> {km(ride.meters)} km geplant</span>
					<span><Clock size={22} aria-hidden="true" /> {rideMinutesRecorded(ride)} Min. aufgezeichnet</span>
				</p>
				<div class="actions">
					<button type="button" class="primary" onclick={() => downloadRide(ride)}>
						<Download size={22} aria-hidden="true" /> Speichern
					</button>
					{#if canShareRide(ride)}
						<button type="button" onclick={() => send(ride)}><Share2 size={22} aria-hidden="true" /> Verschicken</button>
					{/if}
					{#if confirming === ride.id}
						<button type="button" class="danger" onclick={() => remove(ride)}>Ja, löschen</button>
						<button type="button" onclick={() => (confirming = undefined)}>Nein, behalten</button>
					{:else}
						<button type="button" onclick={() => (confirming = ride.id)}><Trash2 size={22} aria-hidden="true" /> Löschen</button>
					{/if}
				</div>
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
	}

	h2 {
		margin-bottom: 0.25rem;
	}

	.when {
		margin: 0 0 0.5rem;
		color: var(--color-text-muted);
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin: 0 0 0.875rem;
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

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.actions button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		min-height: var(--tap);
		padding: 0.25rem 1rem;
		border: 2px solid var(--color-green);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-green);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	.actions .primary {
		background: var(--color-green);
		color: var(--color-surface);
	}

	.actions .danger {
		border-color: var(--color-orange);
		background: var(--color-orange);
		color: #fff;
	}

	.note {
		margin: 0 0 1rem;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius);
		background: var(--color-green-light);
		font-weight: 700;
	}
</style>
