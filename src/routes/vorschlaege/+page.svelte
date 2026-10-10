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
	import { planTours, TooCloseError } from '$lib/routing/plan';
	import { planRound } from '$lib/routing/round';
	import { loadNames } from '$lib/naming/names';
	import { loadLandscape } from '$lib/scoring/landscape';
	import { loadFineMap } from '$lib/scoring/fine';
	import { loadRoadMask } from '$lib/scoring/roads';
	import { tourLine } from '$lib/tour/model';
	import { session } from '$lib/tour/session.svelte';

	let request = $state(session.request);
	/** Rundtour („Einfach eine schöne Runde drehen“) statt Weg zu einem Ziel */
	const isRound = $derived(!!request?.round);
	let tours = $state(session.currentTours);
	let status: 'loading' | 'done' | 'missing' | 'unavailable' | 'noroute' | 'tooclose' | 'error' = $state(
		!session.request ? 'missing' : session.currentTours.length ? 'done' : 'loading'
	);
	let selectedId: string | undefined = $state();
	let mapBox: HTMLDivElement | undefined = $state();
	const cardItems: Record<string, HTMLLIElement> = {};

	/** PC: Karte und Liste stehen nebeneinander – dort wählt das Zeigen mit der Maus */
	const isWide = () => window.matchMedia('(min-width: 64rem)').matches;

	/** Ein Knopf oder die Karte hat gewählt und rollt gerade dorthin – solange nicht dem Scrollen folgen */
	let pickedAt = 0;

	/**
	 * Handy: Die Karte bleibt oben stehen. Hervorgehoben wird der Vorschlag im oberen Viertel des
	 * sichtbaren Bereichs unter der Karte – so folgt die Karte beim Scrollen der Liste.
	 */
	function followScroll() {
		if (isWide() || !mapBox || performance.now() - pickedAt < 1000) return;
		const ids = tours.map((t) => t.id);
		// ganz unten angekommen: der letzte Vorschlag (er kann nicht weiter nach oben rollen)
		if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
			selectedId = ids.at(-1);
			return;
		}
		const top = mapBox.getBoundingClientRect().bottom;
		const bottom = document.querySelector('.bottom-bar')?.getBoundingClientRect().top ?? window.innerHeight;
		const line = top + (bottom - top) / 4;
		let best: string | undefined;
		let bestDistance = Infinity;
		for (const id of ids) {
			const box = cardItems[id]?.getBoundingClientRect();
			if (!box) continue;
			const distance = line < box.top ? box.top - line : line > box.bottom ? line - box.bottom : 0;
			if (distance < bestDistance) {
				bestDistance = distance;
				best = id;
			}
		}
		if (best) selectedId = best;
	}

	let scrollQueued = false;
	function onScroll() {
		if (scrollQueued) return;
		scrollQueued = true;
		requestAnimationFrame(() => {
			scrollQueued = false;
			followScroll();
		});
	}

	/** Weg auf der Karte oder Knopf „Weg 2“ angetippt → seinen Vorschlag in der Liste zeigen */
	function pick(id: string) {
		selectedId = id;
		pickedAt = performance.now();
		if (isWide()) return;
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		cardItems[id]?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
	}

	const activeId = $derived(tours.some((t) => t.id === selectedId) ? selectedId : tours[0]?.id);

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
		compute();
	}


	async function compute() {
		if (!request) return;
		status = 'loading';
		// Landschaftskarte und Namen (Gewässer, Wälder, Orte) – ohne sie geht es auch, nur weniger schön benannt
		const [landscape, names, roads, fine] = await Promise.all([
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
			})
		]);
		try {
			const deps = { route, landscape, names, roads, fine };
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
		// nach dem Zurückkommen steht die Liste evtl. schon weiter unten – Karte gleich passend zeigen
		else requestAnimationFrame(followScroll);
	});
</script>

<svelte:window onscroll={onScroll} />

<svelte:head>
	<title>Genuss-Radeln – {isRound ? 'Ihre Runden' : 'Ihre Wege'}</title>
</svelte:head>

<BackLink href={isRound ? resolve('/runde') : resolve('/')} label="Wunsch ändern" />

{#if status === 'missing' || !request}
	<h1>Noch kein Ziel gewählt</h1>
	<p>Bitte sagen Sie uns zuerst, wohin Sie möchten.</p>
	<Button variant="primary" href={resolve('/')}>Ziel wählen</Button>
{:else}
	<h1>{heading}</h1>
	<p class="summary muted">
		{#if request.round}
			Rundkurs · ca. {request.round.km} km
		{:else}
			ab {request.start.name} ·
			{request.returnMode === 'one-way' ? 'nur hin' : 'hin und zurück als Runde'}
		{/if}
	</p>

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
				<strong>Mit dieser Länge haben wir hier keine schöne Runde gefunden.</strong><br />
				Bitte versuchen Sie eine andere Länge oder einen anderen Startpunkt.
			</p>
			<Button variant="primary" href={resolve('/runde')}>Wunsch ändern</Button>
		</div>
	{:else if status === 'noroute'}
		<div class="message" role="alert">
			<p>
				<strong>Zu diesem Ziel haben wir keinen Radweg gefunden.</strong><br />
				Liegt es vielleicht außerhalb der Testregion Niederrhein / Düsseldorf? Bitte wählen Sie ein anderes Ziel.
			</p>
			<Button variant="primary" href={resolve('/')}>Anderes Ziel wählen</Button>
		</div>
	{:else if status === 'tooclose'}
		<div class="message" role="alert">
			<p>
				<strong>Start und Ziel liegen fast am selben Ort.</strong><br />
				Bitte wählen Sie ein anderes Ziel – oder drehen Sie einfach eine schöne Runde ab hier.
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
			<div class="map" bind:this={mapBox}>
				<div class="map-canvas">
					<RouteMap
						label="Karte mit dem Weg „{(tours.find((t) => t.id === activeId) ?? tours[0])?.title}“ von {request.start.name} {towards}"
						routes={tours.map((t, i) => ({ id: t.id, coordinates: tourLine(t), color: routeColor(i) }))}
						markers={[
							{ lngLat: request.start.lngLat, kind: 'start' },
							{ lngLat: request.destination.lngLat, kind: 'destination' }
						]}
						{selectedId}
						onselect={pick}
					/>
				</div>
				<!-- Wie viele Wege es gibt und welcher gerade auf der Karte ist – bleibt mit der Karte stehen -->
				{#if tours.length > 1}
					<div class="picker" role="group" aria-labelledby="picker-label">
						<span class="picker-label" id="picker-label">Weg:</span>
						{#each tours as tour, index (tour.id)}
							<button
								type="button"
								class="pick"
								class:active={tour.id === activeId}
								aria-pressed={tour.id === activeId}
								aria-label="Weg {index + 1} auf der Karte zeigen"
								style:--route-color={routeColor(index)}
								onclick={() => pick(tour.id)}
							>
								<span class="swatch" aria-hidden="true"></span>{index + 1}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<ol class="tours">
				{#each tours as tour, index (tour.id)}
					<!-- PC: Zeigen auf eine Karte hebt ihren Weg auf der Karte hervor -->
					<li
						bind:this={cardItems[tour.id]}
						onmouseenter={() => isWide() && (selectedId = tour.id)}
						onfocusin={() => (selectedId = tour.id)}
					>
						<RouteCard {tour} number={index + 1} color={routeColor(index)} selected={tour.id === activeId} />
					</li>
				{/each}
			</ol>
			{#if isRound}
				<div class="more">
					<Button icon={RefreshCw} onclick={otherRounds}>Andere Runden vorschlagen</Button>
				</div>
			{/if}
		</div>
	{/if}
{/if}

<style>
	.more {
		margin: 0 0 1.5rem;
	}

	.summary {
		margin-bottom: 1rem;
	}

	/* Handy: Karte bleibt beim Scrollen oben stehen, die Vorschläge laufen darunter durch */
	.map {
		position: sticky;
		top: 0;
		z-index: 3;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0 -0.25rem 0.5rem;
		padding: 0.5rem 0.25rem 0.75rem;
		background: var(--color-bg);
	}

	.map-canvas {
		height: clamp(12rem, 32vh, 20rem);
	}

	/* „Weg: 1 2 3 4 5“ unter der Karte – gleich breite Knöpfe; bei großer Schrift rutschen sie in eine zweite Zeile */
	.picker {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
	}

	.picker-label {
		font-weight: 700;
		color: var(--color-green);
		margin-right: 0.125rem;
	}

	.pick {
		display: inline-flex;
		flex: 1 1 0;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		min-width: 3.5rem;
		min-height: var(--tap);
		padding: 0.25rem 0.5rem;
		white-space: nowrap;
		border: 2px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-surface);
		color: var(--color-green);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	.pick:hover {
		border-color: var(--route-color);
	}

	.pick.active {
		border-color: var(--color-green);
		background: var(--color-green);
		color: var(--color-surface);
	}

	.swatch {
		flex: none;
		width: 1rem;
		height: 0.5rem;
		border-radius: 0.25rem;
		background: var(--route-color);
		box-shadow: 0 0 0 1.5px var(--color-surface);
	}

	/* angetippter Weg: Vorschlag direkt unter Karte und Knöpfen zeigen */
	.tours > li {
		scroll-margin-top: calc(clamp(12rem, 32vh, 20rem) + 6rem);
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
			margin: 0;
			padding: 0;
		}

		.map-canvas {
			flex: 1;
			height: auto;
			min-height: 0;
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
