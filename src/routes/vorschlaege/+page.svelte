<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import X from '@lucide/svelte/icons/x';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { onMount } from 'svelte';
	import BackLink from '$lib/components/BackLink.svelte';
	import MoreLink from '$lib/components/MoreLink.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import RideLoader from '$lib/components/RideLoader.svelte';
	import Button from '$lib/components/Button.svelte';
	import RouteCard from '$lib/components/RouteCard.svelte';
	import RouteMap from '$lib/map/RouteMap.svelte';
	import { routeColor } from '$lib/map/colors';
	import { NoRouteError, route, RoutingUnavailableError } from '$lib/routing/graphhopper';
	import { planTours, TooCloseError } from '$lib/routing/plan';
	import { planRound } from '$lib/routing/round';
	import { loadNames } from '$lib/naming/names';
	import { loadLandscape } from '$lib/scoring/landscape';
	import { loadStreams } from '$lib/routing/streams';
	import { loadFineMap } from '$lib/scoring/fine';
	import { loadRoadMask } from '$lib/scoring/roads';
	import { tourLine } from '$lib/tour/model';
	import { session } from '$lib/tour/session.svelte';
	import { formatDuration } from '$lib/tour/sample';

	let request = $state(session.request);
	/** Rundtour („Einfach eine schöne Runde drehen“) statt Weg zu einem Ziel */
	const isRound = $derived(!!request?.round);
	let tours = $state(session.currentTours);
	let status: 'loading' | 'done' | 'missing' | 'unavailable' | 'noroute' | 'tooclose' | 'error' = $state(
		!session.request ? 'missing' : session.currentTours.length ? 'done' : 'loading'
	);
	let selectedId: string | undefined = $state();
	let mapBox: HTMLDivElement | undefined = $state();

	/** PC: Karte und Liste stehen nebeneinander – dort wählt das Zeigen mit der Maus */
	const isWide = () => window.matchMedia('(min-width: 64rem)').matches;

	let routeMap: RouteMap | undefined = $state();
	/** der Weg, dessen Infofenster auf der Karte offen ist */
	let popupId: string | undefined = $state();

	/** Weg auf der Karte angetippt (Linie oder Nummernschild): hervorheben und Infofenster mit „Tour ansehen“ zeigen */
	function openOnMap(id: string) {
		selectedId = id;
		popupId = id;
	}

	/** „Karte ansehen“ an einer Karte: gleich die große Karte mit diesem Weg und seinem Infofenster */
	function show(id: string) {
		openOnMap(id);
		routeMap?.openLargeMap();
	}

	/** Die Wege mit ihrer festen Nummer und Farbe (Filter Kurz / Mittel / Lang entfiel auf Wunsch von Jan, 14.10.2026) */
	const shown = $derived(tours.map((tour, index) => ({ tour, index, line: tourLine(tour) })));
	const activeId = $derived(shown.some(({ tour }) => tour.id === selectedId) ? selectedId : shown[0]?.tour.id);

	// „nach Kempen“ für Orte, sonst „bis Burg Linn“ (ohne Artikel passt „bis“ immer).
	// Ältere Sitzungen kennen die Ortsart noch nicht – dann in der Ortsliste nachsehen.
	let settlement = $state(session.request?.destination.settlement ?? false);
	onMount(() => {
		if (!request || request.destination.settlement !== undefined) return;
		const { name, lngLat } = request.destination;
		loadNames(asset('/data/landmarks.json'), asset('/data/places.json'))
			.then((names) => (settlement = !!names.places.nearest(lngLat, 3000, (p) => p.name === name)))
			.catch(() => {});
	});
	const towards = $derived(request ? `${settlement ? 'nach' : 'bis'} ${request.destination.name}` : '');
	const countWords = (n: number) => (n === 1 ? 'Ein Weg' : `${n} Wege`);
	const heading = $derived(
		isRound
			? status === 'done'
				? `${tours.length === 1 ? 'Eine schöne Route' : `${tours.length} schöne Routen`} für Sie gefunden.`
				: 'Ihre Runden'
			: `${status === 'done' ? countWords(tours.length) : 'Ihre Wege'} ${towards}`
	);

	/** Rundtour: dieselbe Länge, neuer Zufallswert → andere Runden */
	function otherRounds() {
		if (!request?.round) return;
		request = { ...request, round: { ...request.round, seed: Math.floor(Math.random() * 2 ** 31) } };
		session.setRequest(request);
		window.scrollTo({ top: 0 });
		compute();
	}


	async function compute() {
		if (!request) return;
		status = 'loading';
		// Landschaftskarte und Namen (Gewässer, Wälder, Orte) – ohne sie geht es auch, nur weniger schön benannt
		const [landscape, names, roads, fine, streams] = await Promise.all([
			loadLandscape(asset('/data/landscape.json'), asset('/data/landscape.png')).catch((error) => {
				console.warn('Landschaftskarte nicht verfügbar:', error);
				return undefined;
			}),
			loadNames(asset('/data/landmarks.json'), asset('/data/places.json')).catch((error) => {
				console.warn('Namensdaten nicht verfügbar:', error);
				return undefined;
			}),
			loadRoadMask(asset('/data/roads.json'), asset('/data/roads.bin')).catch((error) => {
				console.warn('Straßenkarte nicht verfügbar:', error);
				return undefined;
			}),
			loadFineMap(asset('/data/fine.json'), asset('/data/fine.bin')).catch((error) => {
				console.warn('Feine Karte nicht verfügbar:', error);
				return undefined;
			}),
			loadStreams(asset('/data/streams.json')).catch((error) => {
				console.warn('Gewässerdaten nicht verfügbar:', error);
				return undefined;
			})
		]);
		try {
			const deps = { route, landscape, names, roads, fine, streams };
			const result = request.round ? await planRound(request, deps) : await planTours(request, deps);
			session.setTours(request, result);
			tours = result;
			status = 'done';
		} catch (error) {
			console.warn('Wegberechnung:', error);
			if (error instanceof RoutingUnavailableError) status = 'unavailable';
			else if (error instanceof TooCloseError) status = 'tooclose';
			else if (error instanceof NoRouteError) status = 'noroute';
			else status = 'error';
		}
	}

	onMount(() => {
		if (status === 'loading') compute();
	});
</script>

<svelte:head>
	<title>Genuss-Radeln – {isRound ? 'Ihre Runden' : 'Ihre Wege'}</title>
</svelte:head>

{#if status === 'missing' || !request}
	<PageHeader title="Noch kein Ziel gewählt" backHref={resolve('/ziel')} backLabel="Wunsch ändern" />
	<p>Bitte sagen Sie uns zuerst, wohin Sie möchten.</p>
	<Button variant="primary" href={resolve('/ziel')}>Ziel wählen</Button>
{:else}
	<!-- Beim Warten kein Titelbild: nur das Fahrrad und der Text darunter (Jan, 14.10.2026) – oben bleiben Zurück-Weg und Zahnrad -->
	{#if status === 'loading'}
		<div class="slim">
			<BackLink href={isRound ? resolve('/runde') : resolve('/ziel')} label="Wunsch ändern" />
			<MoreLink />
		</div>
	{:else}
	<PageHeader
		image="/vorschlaege.jpg"
		calm
		title={heading}
		lead={request.round
				? undefined
				: `ab ${request.start.name} · ${request.returnMode === 'one-way' ? 'nur hin' : 'hin und zurück'}`}
		backHref={isRound ? resolve('/runde') : resolve('/ziel')}
		backLabel="Wunsch ändern"
	/>
	{/if}

	{#if status === 'loading'}
		<!-- Wartebild: ein orangefarbenes E-Bike fährt durch die Landschaft, der Text steht darunter -->
		<div class="waiting" role="status">
			<div class="stage"><RideLoader /></div>
			<p class="first">
				<strong>{isRound ? 'Wir suchen schöne Runden' : 'Wir suchen die schönsten Wege'}<span class="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></strong>
			</p>
			<p class="second">Das dauert nur einen Moment.</p>
		</div>
	{:else if status === 'unavailable'}
		<div class="message" role="alert">
			<p>
				<strong>Die Wegberechnung ist gerade nicht erreichbar.</strong><br />
				Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es in ein paar Minuten noch einmal.
			</p>
			<Button icon={RefreshCw} onclick={compute}>Noch einmal versuchen</Button>
		</div>
	{:else if status === 'noroute' && isRound}
		<div class="message" role="alert">
			<p>
				{#if request.round?.wish}
					<strong>Dazu haben wir hier keine passende Runde gefunden.</strong><br />
					Bitte wählen Sie „Überrasche mich“, eine andere Länge oder einen anderen Startpunkt.
				{:else}
					<strong>Mit dieser Länge haben wir hier keine schöne Runde gefunden.</strong><br />
					Bitte versuchen Sie eine andere Länge oder einen anderen Startpunkt.
				{/if}
			</p>
			<Button variant="primary" href={resolve('/runde')}>Wunsch ändern</Button>
		</div>
	{:else if status === 'noroute'}
		<div class="message" role="alert">
			<p>
				<strong>Zu diesem Ziel haben wir keinen Radweg gefunden.</strong><br />
				Liegt es vielleicht außerhalb der Testregion Niederrhein / Düsseldorf? Bitte wählen Sie ein anderes Ziel.
			</p>
			<Button variant="primary" href={resolve('/ziel')}>Anderes Ziel wählen</Button>
		</div>
	{:else if status === 'tooclose'}
		<div class="message" role="alert">
			<p>
				<strong>Start und Ziel liegen fast am selben Ort.</strong><br />
				Bitte wählen Sie ein anderes Ziel – oder drehen Sie einfach eine schöne Runde ab hier.
			</p>
			<Button variant="primary" href={resolve('/ziel')}>Anderes Ziel wählen</Button>
		</div>
	{:else if status === 'error'}
		<div class="message" role="alert">
			<p><strong>Da ist etwas schiefgelaufen.</strong><br />Bitte versuchen Sie es noch einmal.</p>
			<Button icon={RefreshCw} onclick={compute}>Noch einmal versuchen</Button>
		</div>
	{:else}
		{#snippet routePopup()}
			{@const item = shown.find(({ tour }) => tour.id === popupId)}
			{#if item}
				<div class="popup" style:--route-color={routeColor(item.index)}>
					<button type="button" class="close" aria-label="Fenster schließen" onclick={() => (popupId = undefined)}>
						<X size={24} strokeWidth={2.5} aria-hidden="true" />
					</button>
					<div class="head">
						<span class="num" aria-hidden="true">{item.index + 1}</span>
						<div>
							<strong>{item.tour.label ?? item.tour.title}</strong>
							<span class="pfacts">
								{(item.tour.stats.distance / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km ·
								{formatDuration(item.tour.minutes)} · {item.tour.stats.climb}
							</span>
						</div>
					</div>
					<a class="open" href={resolve('/tour/[id]', { id: item.tour.id })}>Tour ansehen <ChevronRight size={24} strokeWidth={2.5} aria-hidden="true" /></a>
				</div>
			{/if}
		{/snippet}

		<div class="wide">
			<div class="map" bind:this={mapBox}>
				<div class="map-canvas">
					<RouteMap
						label="Karte mit {shown.length === 1 ? 'dem Weg' : 'den Wegen'} von {request.start.name} {towards}"
						routes={shown.map(({ tour, index, line }) => ({ id: tour.id, coordinates: line, color: routeColor(index), number: index + 1 }))}
						markers={[
							{ lngLat: request.start.lngLat, kind: 'start' },
							{ lngLat: request.destination.lngLat, kind: 'destination' }
						]}
						selectedId={activeId}
						onselect={openOnMap}
						popup={popupId && shown.some(({ tour }) => tour.id === popupId) ? routePopup : undefined}
						bind:this={routeMap}
					/>
				</div>
			</div>

			<div class="list">
				<!-- „Andere Runden zeigen“: gleich unter der Karte, wo man die fünf Wege sieht und sich fragt, ob es noch mehr gibt – kein Hauptknopf, daher mit Rand -->
				{#if isRound}
					<div class="again top">
						<Button icon={RefreshCw} onclick={otherRounds}>Andere Runden zeigen</Button>
					</div>
				{/if}

				<ol class="tours">
					{#each shown as { tour, index, line } (tour.id)}
						<!-- PC: Zeigen auf eine Karte hebt ihren Weg auf der Karte hervor -->
						<li onmouseenter={() => isWide() && (selectedId = tour.id)} onfocusin={() => (selectedId = tour.id)}>
							<RouteCard
								{tour}
								{line}
								number={index + 1}
								color={routeColor(index)}
								selected={tour.id === activeId}
								onshow={() => show(tour.id)}
							/>
						</li>
					{/each}
				</ol>
				{#if isRound}
					<div class="again">
						<Button icon={RefreshCw} onclick={otherRounds}>Andere Runden zeigen</Button>
					</div>
				{/if}
			</div>
		</div>
	{/if}
{/if}

<style>
	.again {
		margin: 0 0 1.5rem;
	}

	.again.top {
		margin-bottom: 1rem;
	}

	/* schmale Zeile oben beim Warten: Zurück-Weg links, Zahnrad rechts */
	.slim {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	/* Wartebild */
	.waiting {
		display: grid;
		gap: 0.25rem;
		justify-items: center;
		margin: 0.5rem 0 1rem;
		text-align: center;
	}

	.stage {
		width: 100%;
		height: clamp(13rem, 38vh, 20rem);
		margin-bottom: 1rem;
		overflow: hidden;
		border-radius: 1.5rem;
		background: var(--color-blue-light);
		box-shadow: 0 4px 14px rgb(36 53 57 / 0.12);
	}

	.waiting p {
		margin: 0;
	}

	.first {
		color: var(--color-green);
		font-family: var(--font-title);
		font-size: var(--text-h2);
		line-height: 1.2;
	}

	.second {
		color: var(--color-text-muted);
		font-size: var(--text-large);
	}

	/* drei Punkte, die nacheinander aufleuchten */
	.dots i {
		font-style: normal;
		animation: blink 1.2s infinite;
	}

	.dots i:nth-child(2) {
		animation-delay: 0.2s;
	}

	.dots i:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes blink {
		0%,
		60%,
		100% {
			opacity: 0.25;
		}
		30% {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dots i {
			animation: none;
		}
	}

	/* Infofenster über der Karte: Nummer in der Wegfarbe, Name, drei Zahlen, ein großer Knopf */
	.popup {
		position: relative;
		display: grid;
		gap: 0.5rem;
		padding: 0.625rem 3.5rem 0.625rem 0.75rem;
		border: 2px solid var(--route-color);
		border-radius: 1rem;
		background: var(--color-surface);
		box-shadow: 0 4px 16px rgb(36 53 57 / 0.3);
	}

	.popup .close {
		position: absolute;
		top: 0.25rem;
		right: 0.25rem;
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--color-green);
		cursor: pointer;
	}

	.popup .head {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.popup .head > div {
		display: grid;
		min-width: 0;
		line-height: 1.2;
	}

	.popup .num {
		flex: none;
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 50%;
		background: var(--route-color);
		color: #fff;
		font-weight: 700;
	}

	.popup .pfacts {
		color: var(--color-text);
		font-size: var(--text-small);
	}

	.popup .open {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		min-height: var(--tap);
		border-radius: var(--radius);
		background: var(--color-green);
		color: var(--color-surface);
		font-weight: 700;
		text-decoration: none;
	}

	.popup .open:focus-visible {
		outline: 3px solid var(--color-orange);
		outline-offset: 2px;
	}

	/* Handy: Karte steht über der Liste und scrollt mit (die kleinen Zeichnungen an den Karten zeigen, welcher Weg welcher ist) */
	.map {
		margin: 0 0 1rem;
		scroll-margin-top: 0.5rem;
	}

	/* die Karte steht vor dem Bild: heller Rand und Schatten, damit sie im Mittelpunkt steht (Jan, 14.10.2026) */
	.map :global(.route-map) {
		border: 3px solid var(--color-surface);
		box-shadow: 0 8px 24px rgb(36 53 57 / 0.32);
	}

	.map-canvas {
		height: clamp(16rem, 46vh, 26rem);
	}

	/* PC: Karte groß links und beim Scrollen stehend, Knöpfe und Vorschläge rechts (Lastenheft B9) */
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
			margin: 0;
		}

		.map-canvas {
			height: 100%;
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

	.message p {
		margin: 0;
	}

	.message :global(svg) {
		color: var(--color-olive);
	}
</style>
