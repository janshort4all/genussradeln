<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import Bike from '@lucide/svelte/icons/bike';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { onMount } from 'svelte';
	import BackLink from '$lib/components/BackLink.svelte';
	import Button from '$lib/components/Button.svelte';
	import RouteCard from '$lib/components/RouteCard.svelte';
	import RouteMap from '$lib/map/RouteMap.svelte';
	import { routeColor } from '$lib/map/colors';
	import { NoRouteError, route, RoutingUnavailableError } from '$lib/routing/graphhopper';
	import { planTours } from '$lib/routing/plan';
	import { loadNames } from '$lib/naming/names';
	import { loadLandscape } from '$lib/scoring/landscape';
	import { tourLine } from '$lib/tour/model';
	import { session } from '$lib/tour/session.svelte';

	const request = session.request;
	let tours = $state(session.currentTours);
	let status: 'loading' | 'done' | 'missing' | 'unavailable' | 'noroute' | 'error' = $state(
		!request ? 'missing' : session.currentTours.length ? 'done' : 'loading'
	);
	let selectedId: string | undefined = $state();

	const detourWord = { direct: 'direkt', nicer: 'etwas schöner', nicest: 'am schönsten' };
	const effortWord = { easy: 'gemütlich', sporty: 'sportlicher' };

	async function compute() {
		if (!request) return;
		status = 'loading';
		// Landschaftskarte und Namen (Gewässer, Wälder, Orte) – ohne sie geht es auch, nur weniger schön benannt
		const [landscape, names] = await Promise.all([
			loadLandscape(asset('/data/landscape.json'), asset('/data/landscape.png')).catch((error) => {
				console.warn('Landschaftskarte nicht verfügbar:', error);
				return undefined;
			}),
			loadNames(asset('/data/landmarks.json'), asset('/data/places.json')).catch((error) => {
				console.warn('Namensdaten nicht verfügbar:', error);
				return undefined;
			})
		]);
		try {
			const result = await planTours(request, { route, landscape, names });
			session.setTours(request, result);
			tours = result;
			status = 'done';
		} catch (error) {
			console.warn('Wegberechnung:', error);
			if (error instanceof RoutingUnavailableError) status = 'unavailable';
			else if (error instanceof NoRouteError) status = 'noroute';
			else status = 'error';
		}
	}

	onMount(() => {
		if (status === 'loading') compute();
	});
</script>

<svelte:head>
	<title>Genuss-Radeln – Ihre Wege</title>
</svelte:head>

<BackLink href={resolve('/')} label="Wunsch ändern" />

{#if status === 'missing' || !request}
	<h1>Noch kein Ziel gewählt</h1>
	<p>Bitte sagen Sie uns zuerst, wohin Sie möchten.</p>
	<Button variant="primary" href={resolve('/')}>Ziel wählen</Button>
{:else}
	<h1>Ihre Wege zu {request.destination.name}</h1>
	<p class="summary muted">
		ab {request.start.name} · {detourWord[request.detour]} · {effortWord[request.effort]} ·
		{request.returnMode === 'one-way' ? 'nur hin' : 'auf anderem Weg zurück'}
	</p>

	{#if status === 'loading'}
		<div class="message" role="status">
			<Bike size={40} aria-hidden="true" />
			<p><strong>Wir suchen die schönsten Wege …</strong><br />Das dauert nur einen Moment.</p>
		</div>
	{:else if status === 'unavailable'}
		<div class="message" role="alert">
			<p>
				<strong>Die Wegberechnung ist gerade nicht erreichbar.</strong><br />
				Im Testbetrieb läuft sie nur auf dem PC, auf dem die App entwickelt wird. Online und auf dem Handy
				ist sie noch nicht verfügbar.
			</p>
			<Button icon={RefreshCw} onclick={compute}>Noch einmal versuchen</Button>
		</div>
	{:else if status === 'noroute'}
		<div class="message" role="alert">
			<p>
				<strong>Zu diesem Ziel haben wir keinen Radweg gefunden.</strong><br />
				Liegt es vielleicht außerhalb der Testregion Niederrhein / Düsseldorf? Bitte wählen Sie ein anderes Ziel.
			</p>
			<Button variant="primary" href={resolve('/')}>Anderes Ziel wählen</Button>
		</div>
	{:else if status === 'error'}
		<div class="message" role="alert">
			<p><strong>Da ist etwas schiefgelaufen.</strong><br />Bitte versuchen Sie es noch einmal.</p>
			<Button icon={RefreshCw} onclick={compute}>Noch einmal versuchen</Button>
		</div>
	{:else}
		<div class="wide">
		<div class="map">
			<RouteMap
				label="Karte mit {tours.length} Wegen von {request.start.name} nach {request.destination.name}"
				routes={tours.map((t, i) => ({ id: t.id, coordinates: tourLine(t), color: routeColor(i) }))}
				markers={[
					{ lngLat: request.start.lngLat, kind: 'start' },
					{ lngLat: request.destination.lngLat, kind: 'destination' }
				]}
				{selectedId}
				onselect={(id) => (selectedId = id)}
			/>
		</div>

		<ol class="tours">
			{#each tours as tour, index (tour.id)}
				<!-- PC: Zeigen auf eine Karte hebt ihren Weg auf der Karte hervor -->
				<li onmouseenter={() => (selectedId = tour.id)} onfocusin={() => (selectedId = tour.id)}>
					<RouteCard {tour} color={routeColor(index)} selected={tour.id === selectedId} />
				</li>
			{/each}
		</ol>
		</div>
	{/if}
{/if}

<style>
	.summary {
		margin-bottom: 1rem;
	}

	.map {
		height: 18rem;
		margin-bottom: 1.25rem;
	}

	/* PC: Karte groß links und beim Scrollen stehend, Vorschläge rechts (Lastenheft B9) */
	@media (min-width: 64rem) {
		.wide {
			display: grid;
			grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
			gap: 2rem;
			align-items: start;
		}

		.map {
			position: sticky;
			top: 1rem;
			height: calc(100vh - var(--bottom-bar-height) - 3rem);
			margin-bottom: 0;
		}
	}

	.tours {
		display: grid;
		gap: 1rem;
		margin: 0 0 1.5rem;
		padding: 0;
		list-style: none;
	}

	.message {
		display: grid;
		gap: 1rem;
		justify-items: start;
		margin: 1.5rem 0;
		padding: 1.25rem;
		border-radius: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
	}

	.message[role='status'] {
		grid-template-columns: auto 1fr;
		align-items: center;
	}

	.message p {
		margin: 0;
	}

	.message :global(svg) {
		color: var(--color-olive);
	}
</style>
