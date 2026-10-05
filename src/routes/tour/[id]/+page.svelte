<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import Bike from '@lucide/svelte/icons/bike';
	import Check from '@lucide/svelte/icons/check';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Clock from '@lucide/svelte/icons/clock';
	import Coffee from '@lucide/svelte/icons/coffee';
	import Download from '@lucide/svelte/icons/download';
	import Copy from '@lucide/svelte/icons/copy';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import Heart from '@lucide/svelte/icons/heart';
	import Info from '@lucide/svelte/icons/info';
	import Leaf from '@lucide/svelte/icons/leaf';
	import MapIcon from '@lucide/svelte/icons/map';
	import MountainSnow from '@lucide/svelte/icons/mountain-snow';
	import Share2 from '@lucide/svelte/icons/share-2';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import BackLink from '$lib/components/BackLink.svelte';
	import BatteryHint from '$lib/components/BatteryHint.svelte';
	import ElevationProfile from '$lib/components/ElevationProfile.svelte';
	import StopCards from '$lib/components/StopCards.svelte';
	import TourScene from '$lib/components/illustrations/TourScene.svelte';
	import RouteMap from '$lib/map/RouteMap.svelte';
	import { DETAIL_ROUTE_COLOR } from '$lib/map/colors';
	import { foodGapNote, highlightStops, stopsAlongRoute, toiletSentence } from '$lib/stops/along';
	import { loadPois } from '$lib/stops/pois';
	import { STOP_LABELS } from '$lib/stops/kinds';
	import { downloadGpx } from '$lib/gpx/gpx';
	import { shareUrl } from '$lib/share/link';
	import type { ViewStop } from '$lib/tour/view';

	let { data } = $props();
	const tour = $derived(data.tour);

	// Kurze Rückmeldung unten am Bildschirm (für Knöpfe, deren Funktion erst später kommt)
	let notice = $state('');
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	function tell(text: string) {
		notice = text;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = ''), 5000);
	}
	const SAVE_LATER = 'Touren merken kommt in einem späteren Schritt – bis dahin wird noch nichts gespeichert.';

	// Menü „Teilen“ (am PC; am Handy öffnet sich gleich das Teilen-Menü des Handys)
	let menuOpen = $state(false);
	let menuBox: HTMLDivElement | undefined = $state();
	function closeMenuOutside(event: MouseEvent) {
		if (menuOpen && menuBox && !menuBox.contains(event.target as Node)) menuOpen = false;
	}

	// Stopps: Beispieltouren haben feste, berechnete Wege werden entlang der Strecke durchsucht.
	// Gezeigt werden nur wenige Orte zum Einkehren oder Schauen – Bänke usw. sieht man unterwegs selbst.
	let foundStops: ViewStop[] | undefined = $state();
	let stopsStatus: 'loading' | 'done' | 'error' = $state('loading');
	let focusStopId: string | undefined = $state();
	const allStops = $derived(tour.map.kind === 'route' ? (foundStops ?? []) : tour.stops);
	const stops = $derived(highlightStops(allStops));
	const toilets = $derived(toiletSentence(allStops));
	/** Hinweise neben den Pluspunkten: viel Schotter, lange ohne Einkehr */
	const notes = $derived.by(() => {
		const gap = tour.map.kind === 'route' && stopsStatus === 'done' ? foodGapNote(allStops, tour.km) : undefined;
		return [tour.caveat, gap].filter((n): n is string => !!n);
	});
	let mapBox: HTMLDivElement | undefined = $state();

	/**
	 * Tour teilen: Der Link ist kurz – er enthält nur Eckpunkte, der Empfänger rechnet den Weg nach.
	 * Am Handy öffnet sich das Teilen-Menü (WhatsApp, E-Mail …), am PC ein kleines Menü.
	 */
	let shareText = $state('');
	let shareLink = $state('');

	async function prepareShare(): Promise<boolean> {
		const planned = data.planned;
		if (!planned) {
			tell('Beispieltouren lassen sich nicht teilen.');
			return false;
		}
		shareLink = await shareUrl(planned, resolve('/geteilt'));
		const km = tour.km.toLocaleString('de-DE', { maximumFractionDigits: 0 });
		shareText = `Radtour „${tour.title}“, ${km} km – hier ansehen und losfahren:`;
		return true;
	}

	async function share() {
		try {
			if (!(await prepareShare())) return;
			if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
				await navigator.share({ title: `Radtour: ${tour.title}`, text: shareText, url: shareLink });
			} else {
				menuOpen = !menuOpen;
			}
		} catch (error) {
			if ((error as Error).name !== 'AbortError') tell('Der Link konnte nicht erstellt werden.');
		}
	}

	async function copyLink() {
		menuOpen = false;
		try {
			await navigator.clipboard.writeText(`${shareText} ${shareLink}`);
			tell('Link kopiert – jetzt z. B. in WhatsApp oder eine E-Mail einfügen.');
		} catch {
			tell('Kopieren hat nicht geklappt.');
		}
	}

	/** GPX-Datei für andere Navi-Apps oder den Fahrradcomputer (F12) */
	function saveGpx() {
		if (tour.map.kind !== 'route') return;
		downloadGpx({
			name: tour.title,
			track: tour.map.track,
			waypoints: stops.flatMap((s) =>
				s.lngLat ? [{ lngLat: s.lngLat, name: s.name ?? STOP_LABELS[s.kind], type: STOP_LABELS[s.kind] }] : []
			)
		});
		tell('Die GPX-Datei ist im Ordner „Downloads“.');
	}

	/** „2:50 Std.“ bzw. „45 Min.“ (auf 5 Minuten gerundet; „ca.“ steht in der Bezeichnung) */
	function clockText(minutes: number): string {
		const rounded = Math.round(minutes / 5) * 5;
		const hours = Math.floor(rounded / 60);
		const rest = rounded % 60;
		return hours ? `${hours}:${String(rest).padStart(2, '0')} Std.` : `${rest} Min.`;
	}

	const climbText = $derived(tour.climb.charAt(0).toUpperCase() + tour.climb.slice(1));

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

<svelte:window onclick={closeMenuOutside} onkeydown={(e) => e.key === 'Escape' && (menuOpen = false)} />

<div class="topbar">
	{#if tour.backHref === 'vorschlaege'}
		<BackLink href={resolve('/vorschlaege')} label="Zurück zu den Wegen" />
	{:else if tour.backHref === 'start'}
		<BackLink href={resolve('/')} label="Zur Startseite" />
	{:else}
		<BackLink href={resolve('/runde/vorschlaege')} label="Zurück zu den Beispielen" />
	{/if}
	<div class="tools">
		<button type="button" class="icon-button" aria-label="Tour merken" onclick={() => tell(SAVE_LATER)}>
			<Heart size={26} strokeWidth={2.25} aria-hidden="true" />
		</button>
		<div class="more" bind:this={menuBox}>
			<button
				type="button"
				class="icon-button"
				aria-label="Tour teilen"
				aria-expanded={menuOpen}
				aria-controls="tour-menu"
				onclick={share}
			>
				<Share2 size={26} strokeWidth={2.25} aria-hidden="true" />
			</button>
			{#if menuOpen}
				<ul class="menu" id="tour-menu">
					<li>
						<a
							href="https://wa.me/?text={encodeURIComponent(`${shareText} ${shareLink}`)}"
							target="_blank"
							rel="noopener noreferrer"
							onclick={() => (menuOpen = false)}
						>
							<MessageCircle size={22} aria-hidden="true" /> Per WhatsApp schicken
						</a>
					</li>
					<li>
						<button type="button" onclick={copyLink}>
							<Copy size={22} aria-hidden="true" /> Link kopieren
						</button>
					</li>
				</ul>
			{/if}
		</div>
	</div>
</div>

<div class="wide">
	<div class="map-column">
		{#if tour.map.kind === 'route'}
			<div class="map route" bind:this={mapBox}>
				<RouteMap
					label="Karte mit dem Weg „{tour.title}“"
					routes={[{ id: tour.id, coordinates: tour.map.coordinates, color: DETAIL_ROUTE_COLOR }]}
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
		<div class="title-row">
			<span class="round-icon big" aria-hidden="true"><Bike size={30} strokeWidth={2} /></span>
			<h1>{tour.title}</h1>
		</div>
		{#if tour.highlight}<p class="highlight">{tour.highlight}</p>{/if}

		<!-- Das Wichtigste auf einen Blick: Zahl groß, Bedeutung darunter -->
		<dl class="facts">
			<div>
				<dt>Strecke</dt>
				<dd><span class="fact-icon" aria-hidden="true"><Bike size={30} strokeWidth={2} /></span>{tour.km.toLocaleString('de-DE', { maximumFractionDigits: 0 })} km</dd>
			</div>
			<div>
				<dt>Fahrzeit, ca.</dt>
				<dd><span class="fact-icon" aria-hidden="true"><Clock size={30} strokeWidth={2} /></span>{clockText(tour.minutes)}</dd>
			</div>
			<div>
				<dt>Steigungen</dt>
				<dd><span class="fact-icon" aria-hidden="true"><MountainSnow size={30} strokeWidth={2} /></span>{climbText}</dd>
			</div>
		</dl>

		{#if tour.checks.length || notes.length}
			<div class="summary-box">
				<span class="leaf" aria-hidden="true"><Leaf size={34} strokeWidth={1.75} /></span>
				<div class="summary-content">
					{#if tour.checks.length}
						<ul class="checks">
							{#each tour.checks as check (check)}
								<li><Check size={22} strokeWidth={3} aria-hidden="true" /> {check}</li>
							{/each}
						</ul>
					{/if}
					{#if notes.length}
						<div class="notes">
							{#each notes as note (note)}
								<p><Info size={22} strokeWidth={2.25} aria-hidden="true" /> <span>{note}</span></p>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if tour.battery}<BatteryHint level={tour.battery} />{/if}

		<div class="actions">
			<a class="start-button" href={resolve('/navigation/[id]', { id: tour.id })}>
				<Bike size={28} strokeWidth={2.25} aria-hidden="true" />
				<span>Tour starten</span>
				<ChevronRight size={26} strokeWidth={2.5} aria-hidden="true" />
			</a>
			<button type="button" class="adjust-button" onclick={() => tell('Anpassen kommt in einem späteren Schritt.')}>
				<SlidersHorizontal size={22} strokeWidth={2.25} aria-hidden="true" /> Tour anpassen
			</button>
			{#if tour.map.kind === 'route'}
				<button type="button" class="adjust-button" onclick={saveGpx}>
					<Download size={22} strokeWidth={2.25} aria-hidden="true" /> Als GPX-Datei speichern
				</button>
			{/if}
		</div>

		<section class="stops">
			<h2 class="section-title">
				<span class="round-icon" aria-hidden="true"><Coffee size={22} strokeWidth={2.25} /></span>
				Einkehren unterwegs
			</h2>
			{#if stopsStatus === 'loading'}
				<p class="muted" role="status">Wir schauen, wo Sie unterwegs einkehren können …</p>
			{:else if stopsStatus === 'error'}
				<p class="muted">Die Orte zum Einkehren konnten gerade nicht geladen werden.</p>
			{:else}
				{#if stops.length}
					<StopCards {stops} focusedId={focusStopId} onfocus={showStop} />
				{:else}
					<p class="muted">Direkt am Weg haben wir kein Café und keinen Biergarten gefunden.</p>
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
	</div>
</div>

<p class="toast" class:visible={notice} role="status">{notice}</p>

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
			height: calc(100vh - var(--bottom-bar-height) - 6rem);
			margin-top: 0;
		}
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.tools {
		display: flex;
		gap: 0.25rem;
	}

	.icon-button {
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

	.icon-button:hover {
		background: var(--color-green-light);
	}

	.more {
		position: relative;
	}

	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 0.25rem);
		z-index: 10;
		min-width: 15rem;
		margin: 0;
		padding: 0.375rem;
		list-style: none;
		background: var(--color-surface);
		border: 2px solid var(--color-border);
		border-radius: var(--radius);
		box-shadow: 0 6px 20px rgb(36 53 57 / 0.18);
	}

	.menu button,
	.menu a {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		min-height: var(--tap);
		padding: 0.5rem 0.75rem;
		border: 0;
		border-radius: 0.5rem;
		background: none;
		color: var(--color-green);
		font: inherit;
		font-weight: 700;
		text-align: left;
		cursor: pointer;
	}

	.menu a {
		text-decoration: none;
	}

	.menu button:hover,
	.menu a:hover {
		background: var(--color-green-light);
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

	.title-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.title-row h1 {
		margin: 0;
	}

	.round-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		background: var(--color-green-light);
		color: var(--color-green);
	}

	.round-icon.big {
		width: 3.5rem;
		height: 3.5rem;
	}

	.highlight {
		margin: 0 0 1rem;
		color: var(--color-text-muted);
	}

	/* drei Kacheln; bei wenig Platz oder großer Schrift rutschen sie in die nächste Zeile */
	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
		gap: 0.5rem;
		margin: 0 0 1rem;
	}

	.facts div {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.125rem;
		padding: 0.75rem 0.375rem;
		background: var(--color-surface);
		border: 2px solid var(--color-border);
		border-radius: 1rem;
		text-align: center;
	}

	/* Reihenfolge auf dem Bildschirm: Symbol und Wert, darunter die Bezeichnung */
	.fact-icon {
		color: var(--color-green);
	}

	dd {
		order: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		margin: 0;
		font-size: var(--text-large);
		font-weight: 700;
		line-height: 1.2;
	}

	dt {
		order: 2;
		color: var(--color-text-muted);
		font-size: var(--text-small);
	}

	.summary-box {
		display: flex;
		gap: 0.75rem;
		margin: 0 0 1.25rem;
		padding: 0.875rem 1rem;
		border-radius: 1rem;
		background: var(--color-green-light);
		container-type: inline-size;
	}

	.leaf {
		flex: none;
		color: var(--color-olive);
	}

	.summary-content {
		display: grid;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
	}

	/* genug Platz: Pluspunkte links, Hinweise rechts mit Trennstrich */
	@container (min-width: 30rem) {
		.summary-content {
			grid-template-columns: 1fr 1fr;
		}

		.notes {
			padding-left: 1rem;
			border-left: 2px solid rgb(40 60 48 / 0.15);
		}
	}

	.checks {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.checks li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.checks :global(svg) {
		flex: none;
		color: var(--color-green);
	}

	.notes p {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin: 0;
		color: var(--color-text-muted);
	}

	.notes p + p {
		margin-top: 0.375rem;
	}

	.notes :global(svg) {
		flex: none;
		margin-top: 0.1em;
	}

	.actions {
		display: grid;
		gap: 0.75rem;
		margin-bottom: 1.75rem;
	}

	/* Hauptaktion: dunkelgrün wie im Entwurf (weiße Schrift 11 : 1) */
	.start-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		min-height: 4rem;
		padding: 0.75rem 1.25rem;
		border-radius: 1rem;
		background: var(--color-green);
		color: var(--color-surface);
		font-size: var(--text-large);
		font-weight: 700;
		text-decoration: none;
		box-shadow: 0 3px 0 #18241d;
	}

	.start-button:hover {
		background: #1d2c23;
	}

	.adjust-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-height: var(--tap);
		padding: 0.5rem 1rem;
		border: 2px solid var(--color-border);
		border-radius: 1rem;
		background: var(--color-surface);
		color: var(--color-green);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	.adjust-button:hover {
		border-color: var(--color-green);
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.profile,
	.stops {
		margin: 0 0 1.75rem;
	}

	.toilets {
		margin: 0.75rem 0 0;
	}

	/* Rückmeldung über der unteren Leiste */
	.toast {
		position: fixed;
		left: 1rem;
		right: 1rem;
		bottom: calc(var(--bottom-bar-height) + 0.75rem);
		z-index: 20;
		max-width: 36rem;
		margin: 0 auto;
		padding: 0.75rem 1rem;
		border-radius: var(--radius);
		background: var(--color-green);
		color: var(--color-surface);
		font-weight: 700;
		box-shadow: 0 4px 16px rgb(36 53 57 / 0.3);
		visibility: hidden;
	}

	.toast.visible {
		visibility: visible;
	}
</style>
