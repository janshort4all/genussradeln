<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import Bike from '@lucide/svelte/icons/bike';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import X from '@lucide/svelte/icons/x';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { onMount } from 'svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
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
	import { tourLine, type PlannedTour } from '$lib/tour/model';
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

	// Länge der Wege (Knöpfe unter der Karte, wie im Entwurf): nur Größen, die es gibt – und nur, wenn es überhaupt eine Auswahl gibt
	type Size = 'short' | 'medium' | 'long';
	const SIZES: { id: Size; name: string; range: string }[] = [
		{ id: 'short', name: 'Kurz', range: 'bis 20 km' },
		{ id: 'medium', name: 'Mittel', range: '20–40 km' },
		{ id: 'long', name: 'Lang', range: 'ab 40 km' }
	];
	const sizeOf = (t: PlannedTour): Size => (t.stats.distance < 20_000 ? 'short' : t.stats.distance < 40_000 ? 'medium' : 'long');
	let filter: Size | 'all' = $state('all');
	const sizesPresent = $derived(SIZES.filter((size) => tours.some((t) => sizeOf(t) === size.id)));
	const showFilter = $derived(sizesPresent.length > 1);
	const chosenFilter = $derived<Size | 'all'>(showFilter && sizesPresent.some((size) => size.id === filter) ? filter : 'all');
	/** Die Wege, die gerade gezeigt werden – mit ihrer festen Nummer und Farbe (die bleiben beim Filtern gleich) */
	const shown = $derived(
		tours
			.map((tour, index) => ({ tour, index, line: tourLine(tour) }))
			.filter(({ tour }) => chosenFilter === 'all' || sizeOf(tour) === chosenFilter)
	);
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
				? `${tours.length === 1 ? 'Eine Runde' : `${tours.length} Runden`} ab ${request?.start.name}`
				: `Ihre Runden ab ${request?.start.name}`
			: `${status === 'done' ? countWords(tours.length) : 'Ihre Wege'} ${towards}`
	);

	/** Rundtour: dieselbe Länge, neuer Zufallswert → andere Runden */
	function otherRounds() {
		if (!request?.round) return;
		request = { ...request, round: { ...request.round, seed: Math.floor(Math.random() * 2 ** 31) } };
		session.setRequest(request);
		window.scrollTo({ top: 0 });
		filter = 'all';
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
	<PageHeader
		title={heading}
		lead={request.round
			? `Rundkurs · ca. ${request.round.km} km${request.round.wish ? ` · ${{ water: 'am Wasser', forest: 'durch den Wald', fields: 'durch Felder und Dörfer' }[request.round.wish]}` : ''}`
			: `ab ${request.start.name} · ${request.returnMode === 'one-way' ? 'nur hin' : 'hin und zurück als Runde'}`}
		backHref={isRound ? resolve('/runde') : resolve('/ziel')}
		backLabel="Wunsch ändern"
	/>

	{#if status === 'loading'}
		<div class="message" role="status">
			<Bike size={40} aria-hidden="true" />
			<p>
				<strong>{isRound ? 'Wir suchen schöne Runden …' : 'Wir suchen die schönsten Wege …'}</strong><br />Das dauert
				nur einen Moment.
			</p>
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
				<!-- Wie im Entwurf: Alle oder nur kurze, mittlere, lange – erscheint nur, wenn es eine Auswahl gibt -->
				{#if showFilter}
					<div class="filter" role="group" aria-label="Länge der Touren">
						<button type="button" class="chip" aria-pressed={chosenFilter === 'all'} onclick={() => (filter = 'all')}>
							<strong>{isRound ? 'Alle Runden' : 'Alle Wege'}</strong>
							<span>({tours.length})</span>
						</button>
						{#each sizesPresent as size (size.id)}
							<button type="button" class="chip" aria-pressed={chosenFilter === size.id} onclick={() => (filter = size.id)}>
								<strong>{size.name}</strong>
								<span>{size.range}</span>
							</button>
						{/each}
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
					<div class="more">
						<Button icon={RefreshCw} onclick={otherRounds}>Andere Runden vorschlagen</Button>
					</div>
				{/if}
			</div>
		</div>
	{/if}
{/if}

<style>
	.more {
		margin: 0 0 1.5rem;
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

	.map-canvas {
		height: clamp(16rem, 46vh, 26rem);
	}

	/* Knöpfe „Alle / Kurz / Mittel / Lang“ – wie im Entwurf; bei großer Schrift rutschen sie in eine zweite Zeile */
	.filter {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0 0 1rem;
	}

	.chip {
		display: grid;
		align-content: center;
		justify-items: center;
		flex: 1 1 0;
		min-width: 6.5rem;
		min-height: 3.5rem;
		padding: 0.25rem 0.5rem;
		border: 2px solid var(--color-border);
		border-radius: 1rem;
		background: var(--color-surface);
		color: var(--color-green);
		font: inherit;
		line-height: 1.25;
		text-align: center;
		cursor: pointer;
	}

	.chip span {
		font-size: var(--text-small);
		color: var(--color-text-muted);
	}

	.chip[aria-pressed='true'] {
		border-color: var(--color-green);
		background: var(--color-green);
		color: var(--color-surface);
	}

	.chip[aria-pressed='true'] span {
		color: var(--color-surface);
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
