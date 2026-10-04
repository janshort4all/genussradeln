<script lang="ts">
	import { resolve } from '$app/paths';
	import MapIcon from '@lucide/svelte/icons/map';
	import Navigation from '@lucide/svelte/icons/navigation';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import BackLink from '$lib/components/BackLink.svelte';
	import BatteryHint from '$lib/components/BatteryHint.svelte';
	import Button from '$lib/components/Button.svelte';
	import { asset } from '$app/paths';
	import ElevationProfile from '$lib/components/ElevationProfile.svelte';
	import StopChain from '$lib/components/StopChain.svelte';
	import TourScene from '$lib/components/illustrations/TourScene.svelte';
	import RouteMap from '$lib/map/RouteMap.svelte';
	import { routeColor } from '$lib/map/colors';
	import { highlightStops, stopsAlongRoute, toiletSentence } from '$lib/stops/along';
	import { loadPois } from '$lib/stops/pois';
	import { formatDuration } from '$lib/tour/sample';
	import type { ViewStop } from '$lib/tour/view';

	let { data } = $props();
	const tour = $derived(data.tour);

	let notice = $state('');

	// Stopps: Beispieltouren haben feste, berechnete Wege werden entlang der Strecke durchsucht.
	// Gezeigt werden nur wenige Orte zum Einkehren oder Schauen – Bänke usw. sieht man unterwegs selbst.
	let foundStops: ViewStop[] | undefined = $state();
	let stopsStatus: 'loading' | 'done' | 'error' = $state('loading');
	let focusStopId: string | undefined = $state();
	const allStops = $derived(tour.map.kind === 'route' ? (foundStops ?? []) : tour.stops);
	const stops = $derived(highlightStops(allStops));
	const toilets = $derived(toiletSentence(allStops));
	const destination = $derived(
		tour.map.kind === 'route'
			? {
					km: tour.destinationKm ?? tour.km,
					name: tour.destinationName ?? 'Ziel',
					returns: tour.destinationKm !== undefined
				}
			: undefined
	);
	let mapBox: HTMLDivElement | undefined = $state();

	/** Stopp auf der Karte zeigen – und zur Karte hochscrollen, damit man den Sprung sieht */
	function showStop(id: string) {
		focusStopId = id;
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		mapBox?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
	}

	$effect(() => {
		const map = tour.map;
		if (map.kind !== 'route') {
			stopsStatus = 'done';
			return;
		}
		let cancelled = false;
		stopsStatus = 'loading';
		(async () => {
			try {
				const index = await loadPois(asset('/data/pois.json'));
				if (cancelled) return;
				foundStops = stopsAlongRoute(map.coordinates, index);
				stopsStatus = 'done';
			} catch (error) {
				console.warn('Stopps nicht verfügbar:', error);
				if (!cancelled) stopsStatus = 'error';
			}
		})();
		return () => (cancelled = true);
	});
</script>

<svelte:head>
	<title>Genuss-Radeln – {tour.title}</title>
</svelte:head>

{#if tour.backHref === 'vorschlaege'}
	<BackLink href={resolve('/vorschlaege')} label="Zurück zu den Wegen" />
{:else}
	<BackLink href={resolve('/runde/vorschlaege')} label="Zurück zu den Beispielen" />
{/if}

<div class="wide">
<div class="map-column">
{#if tour.map.kind === 'route'}
	<div class="map route" bind:this={mapBox}>
		<RouteMap
			label="Karte mit dem Weg: {tour.subtitle}"
			routes={[{ id: tour.id, coordinates: tour.map.coordinates, color: routeColor(0) }]}
			markers={[
				{ lngLat: tour.map.start, kind: 'start' },
				{ lngLat: tour.map.destination, kind: 'destination' }
			]}
			stops={stops.flatMap((s) => (s.lngLat ? [{ id: s.id, lngLat: s.lngLat, kind: s.kind }] : []))}
			{focusStopId}
		/>
	</div>
{:else}
	<div class="map" role="img" aria-label="Beispielbild (die echte Karte gibt es bei berechneten Wegen)">
		<TourScene kind={tour.map.scene} />
		<span class="map-note"><MapIcon size={20} aria-hidden="true" /> Beispieltour</span>
	</div>
{/if}
</div>

<div class="info-column">
<h1>{tour.title}</h1>
<p class="facts">{tour.km.toLocaleString('de-DE')} km · ca. {formatDuration(tour.minutes)} · {tour.climb}</p>
{#if tour.highlight}<p class="highlight">{tour.highlight}</p>{/if}
{#if tour.subtitle}<p class="muted">{tour.subtitle}</p>{/if}
{#if tour.caveat}<p class="caveat">{tour.caveat}</p>{/if}

{#if tour.battery}<BatteryHint level={tour.battery} />{/if}

<section class="stops">
	<h2>Einkehren unterwegs</h2>
	{#if stopsStatus === 'loading'}
		<p class="muted" role="status">Wir schauen, wo Sie unterwegs einkehren können …</p>
	{:else if stopsStatus === 'error'}
		<p class="muted">Die Orte zum Einkehren konnten gerade nicht geladen werden.</p>
	{:else}
		{#if !stops.length}
			<p class="muted">Direkt am Weg haben wir kein Café und keinen Biergarten gefunden.</p>
		{/if}
		{#if stops.length || destination}
			<StopChain {stops} focusedId={focusStopId} onfocus={showStop} {destination} />
		{/if}
		{#if toilets}<p class="muted toilets">{toilets}</p>{/if}
	{/if}
</section>

{#if tour.profile && tour.climb !== 'flach'}
	<section class="profile">
		<h2>Wo es bergauf geht</h2>
		<ElevationProfile
			profile={tour.profile}
			climb={tour.climb}
			destinationKm={tour.destinationKm}
			destinationName={tour.destinationName}
		/>
	</section>
{/if}

<div class="actions">
	<Button variant="primary" icon={Navigation} href={resolve('/navigation/[id]', { id: tour.id })}>
		Losfahren
	</Button>
	<Button icon={SlidersHorizontal} onclick={() => (notice = 'Anpassen kommt in einem späteren Schritt.')}>
		Tour anpassen
	</Button>
	<p class="notice" role="status">{notice}</p>
</div>
</div>
</div>

<style>
	/* PC: Karte groß links und beim Scrollen stehend, Angaben rechts (Lastenheft B9) */
	@media (min-width: 64rem) {
		.wide {
			display: grid;
			grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
			gap: 2rem;
			align-items: start;
		}

		.map-column {
			position: sticky;
			top: 1rem;
		}

		.map-column .map,
		.map-column .map.route {
			height: calc(100vh - var(--bottom-bar-height) - 3rem);
			margin-top: 0;
		}
	}

	.map {
		position: relative;
		height: 11rem;
		margin: 0.25rem 0 1.25rem;
		border-radius: 1rem;
		overflow: hidden;
		border: 1px solid var(--color-border);
	}

	/* echte Karte: höher, eigener Rahmen kommt von RouteMap */
	.map.route {
		height: 17rem;
		/* beim Hochscrollen zu einem Stopp etwas Luft über der Karte lassen */
		scroll-margin-top: 0.75rem;
		border: 0;
		overflow: visible;
	}

	/* das Wichtigste in einer Zeile statt in Kästchen */
	.facts {
		margin: 0 0 0.5rem;
		font-size: var(--text-large);
		font-weight: 700;
	}

	.highlight {
		margin: 0 0 0.5rem;
	}

	.caveat {
		margin: 0.75rem 0 0;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius);
		background: var(--color-sun-light);
		font-weight: 700;
	}

	.map-note {
		position: absolute;
		right: 0.75rem;
		bottom: 0.75rem;
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.75rem;
		border-radius: 999px;
		background: rgb(253 251 245 / 0.9);
		color: var(--color-text-muted);
		font-size: var(--text-small);
		font-weight: 700;
	}

	.profile,
	.stops {
		margin: 1.75rem 0;
	}

	.toilets {
		margin: 0.75rem 0 0;
	}

	.actions {
		display: grid;
		gap: 0.75rem;
	}

	.notice {
		min-height: 1.5em;
		margin: 0;
		color: var(--color-text-muted);
	}
</style>
