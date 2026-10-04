<script lang="ts">
	import { resolve } from '$app/paths';
	import Clock from '@lucide/svelte/icons/clock';
	import MapIcon from '@lucide/svelte/icons/map';
	import Mountain from '@lucide/svelte/icons/mountain';
	import Navigation from '@lucide/svelte/icons/navigation';
	import Route from '@lucide/svelte/icons/route';
	import Send from '@lucide/svelte/icons/send';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import BackLink from '$lib/components/BackLink.svelte';
	import BatteryHint from '$lib/components/BatteryHint.svelte';
	import Button from '$lib/components/Button.svelte';
	import LandscapeChip from '$lib/components/LandscapeChip.svelte';
	import Bike from '@lucide/svelte/icons/bike';
	import Car from '@lucide/svelte/icons/car';
	import { asset } from '$app/paths';
	import ElevationProfile from '$lib/components/ElevationProfile.svelte';
	import StopList from '$lib/components/StopList.svelte';
	import TourScene from '$lib/components/illustrations/TourScene.svelte';
	import RouteMap from '$lib/map/RouteMap.svelte';
	import { routeColor } from '$lib/map/colors';
	import { loadLandscape } from '$lib/scoring/landscape';
	import { stopsAlongRoute } from '$lib/stops/along';
	import { loadPois } from '$lib/stops/pois';
	import { formatDuration } from '$lib/tour/sample';
	import type { ViewStop } from '$lib/tour/view';

	let { data } = $props();
	const tour = $derived(data.tour);

	let notice = $state('');

	// Stopps: Beispieltouren haben feste, berechnete Wege werden entlang der Strecke durchsucht
	let foundStops: ViewStop[] | undefined = $state();
	let stopsStatus: 'loading' | 'done' | 'error' = $state('loading');
	let focusStopId: string | undefined = $state();
	const stops = $derived(tour.map.kind === 'route' ? (foundStops ?? []) : tour.stops);
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
				const [index, landscape] = await Promise.all([
					loadPois(asset('/data/pois.json')),
					loadLandscape(asset('/data/landscape.json'), asset('/data/landscape.png')).catch(() => undefined)
				]);
				if (cancelled) return;
				foundStops = stopsAlongRoute(map.coordinates, index, landscape);
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

<h1>{tour.title}</h1>
{#if tour.subtitle}<p class="subtitle muted">{tour.subtitle}</p>{/if}

{#if tour.tags.length}
	<ul class="tags" aria-label="Landschaft">
		{#each tour.tags as tag (tag)}
			<li><LandscapeChip {tag} /></li>
		{/each}
	</ul>
{/if}

<dl class="facts">
	<div>
		<dt><Route size={20} aria-hidden="true" /> Länge</dt>
		<dd>{tour.km.toLocaleString('de-DE')} km</dd>
	</div>
	<div>
		<dt><Clock size={20} aria-hidden="true" /> Dauer</dt>
		<dd>ca. {formatDuration(tour.minutes)}</dd>
	</div>
	<div>
		<dt><Mountain size={20} aria-hidden="true" /> Steigung</dt>
		<dd>{tour.climb}</dd>
	</div>
</dl>

{#if tour.surface || tour.traffic}
	<ul class="words">
		{#if tour.surface}
			<li><Bike size={22} aria-hidden="true" /> <span><strong>Untergrund:</strong> {tour.surface}</span></li>
		{/if}
		{#if tour.traffic}
			<li><Car size={22} aria-hidden="true" /> <span><strong>Verkehr:</strong> {tour.traffic}</span></li>
		{/if}
	</ul>
{/if}

{#if tour.highlight}<p class="highlight">{tour.highlight}</p>{/if}
{#if tour.extra}<p class="muted">{tour.extra}</p>{/if}

{#if tour.battery}<BatteryHint level={tour.battery} />{/if}

{#if tour.profile}
	<section class="profile">
		<h2>Höhenprofil</h2>
		<ElevationProfile
			profile={tour.profile}
			climb={tour.climb}
			destinationKm={tour.destinationKm}
			destinationName={tour.destinationName}
		/>
	</section>
{/if}

<section class="stops">
	<h2>Unterwegs erwartet Sie</h2>
	{#if stopsStatus === 'loading'}
		<p class="muted" role="status">Stopps entlang des Wegs werden gesucht …</p>
	{:else if stopsStatus === 'error'}
		<p class="muted">Die Stopps konnten gerade nicht geladen werden.</p>
	{:else if !stops.length}
		<p class="muted">Direkt am Weg haben wir keine Cafés, Bänke oder Toiletten gefunden.</p>
	{:else}
		<StopList
			{stops}
			focusedId={focusStopId}
			onfocus={showStop}
			destination={tour.destinationKm !== undefined
				? { km: tour.destinationKm, name: tour.destinationName ?? 'Ziel' }
				: undefined}
		/>
		{#if tour.map.kind === 'route'}
			<p class="muted hint">
				Stopp antippen, um ihn auf der Karte zu sehen. Öffnungszeiten bitte vorher prüfen.
			</p>
		{/if}
	{/if}
</section>

<div class="actions">
	<Button variant="primary" icon={Navigation} href={resolve('/navigation/[id]', { id: tour.id })}>
		Losfahren
	</Button>
	<Button icon={SlidersHorizontal} onclick={() => (notice = 'Anpassen kommt in einem späteren Schritt.')}>
		Tour anpassen
	</Button>
	<Button
		icon={Send}
		onclick={() => (notice = 'Das Senden ans E-Bike-Display kommt in einem späteren Schritt.')}
	>
		An mein E-Bike-Display senden
	</Button>
	<p class="notice" role="status">{notice}</p>
</div>

<style>
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

	.subtitle {
		margin: -0.25rem 0 0.75rem;
	}

	.highlight {
		margin: 0 0 0.25rem;
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

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0 0 1rem;
		padding: 0;
		list-style: none;
	}

	/* Kacheln rutschen bei wenig Platz (oder großer Schrift) in die nächste Zeile */
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin: 0 0 1rem;
	}

	.facts div {
		flex: 1 1 auto;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 0.625rem 0.75rem;
		box-shadow: 0 1px 2px rgb(36 53 57 / 0.05);
	}

	dt {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		color: var(--color-text-muted);
		font-size: var(--text-small);
	}

	dt :global(svg) {
		color: var(--color-olive);
	}

	dd {
		margin: 0;
		font-weight: 700;
		font-size: var(--text-large);
		white-space: nowrap;
	}

	.words {
		display: grid;
		gap: 0.5rem;
		margin: 0 0 1rem;
		padding: 0;
		list-style: none;
	}

	.words li {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.words :global(svg) {
		flex: none;
		margin-top: 0.15em;
		color: var(--color-olive);
	}

	.profile,
	.stops {
		margin: 1.75rem 0;
	}

	.hint {
		margin: 0.75rem 0 0;
		font-size: var(--text-small);
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
