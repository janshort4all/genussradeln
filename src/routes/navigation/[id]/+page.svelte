<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { beforeNavigate, goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import Flag from '@lucide/svelte/icons/flag';
	import MapIcon from '@lucide/svelte/icons/map';
	import Navigation from '@lucide/svelte/icons/navigation';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Repeat from '@lucide/svelte/icons/repeat';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import VolumeX from '@lucide/svelte/icons/volume-x';
	import BackLink from '$lib/components/BackLink.svelte';
	import NavMap from '$lib/map/NavMap.svelte';
	import type { NavTheme } from '$lib/map/nav-style';
	import {
		enterFullscreen,
		exitFullscreen,
		followPosition,
		keepScreenOn,
		simulateRide,
		type ScreenLock,
		Voice,
		type PositionProblem
	} from '$lib/navigation/device';
	import { guide, initialNavState, type Fix, type NavView } from '$lib/navigation/guidance';
	import { RouteTrack } from '$lib/navigation/track';
	import TurnArrow from '$lib/navigation/TurnArrow.svelte';
	import { actionText, arrowOf, distanceText, repeatAnnouncement } from '$lib/navigation/wording';
	import { highlightStops, stopsAlongRoute } from '$lib/stops/along';
	import { STOP_LABELS } from '$lib/stops/kinds';
	import { loadPois } from '$lib/stops/pois';
	import { distance } from '$lib/geo/geo';
	import { tourLine } from '$lib/tour/model';

	let { data } = $props();
	const tour = $derived(data.tour);
	const planned = $derived(data.planned);
	const track = $derived(planned ? new RouteTrack(planned.legs) : undefined);
	const line = $derived(planned ? tourLine(planned) : []);


	type Phase = 'ready' | 'running' | 'paused' | 'confirm-end' | 'finished' | 'problem';
	let phase: Phase = $state('ready');
	let problem: PositionProblem | undefined = $state();
	let theme: NavTheme = $state('dark');
	let view: NavView | undefined = $state();

	// Die Strecke in drei Teile: vor Ihnen (nur das sieht man in der Fahrtansicht), schon gefahren und der weitere Verlauf
	// (beides nur in der Übersicht). Am Start laufen Hin- und Rückweg sonst beide auf den Standort zu (Jan, 13.10.2026).
	const AHEAD_M = 2500;
	/** nur alle 25 m neu zeichnen – die Karte muss nicht bei jeder GPS-Meldung die Linie neu aufbauen */
	const alongSteps = $derived(Math.round((view?.state.along ?? 0) / 25) * 25);
	const behindLine = $derived(track ? track.segment(0, alongSteps) : []);
	const aheadLine = $derived(track ? track.segment(alongSteps, alongSteps + AHEAD_M) : []);
	const restLine = $derived(track ? track.segment(alongSteps + AHEAD_M, track.total) : []);

	/** Schilder für die Übersicht: Start, Ziel – bei Hin- und Rückweg dazu „Hinweg“ und „Rückweg“ */
	const signs = $derived.by(() => {
		if (!track || !line.length) return [];
		const out: { lngLat: [number, number]; text: string }[] = [];
		const roundTrip = distance(line[0], line[line.length - 1]) < 300;
		if (track.legCount > 1) {
			const turn = track.legEnds[0];
			out.push({ lngLat: line[0], text: 'Start und Ziel' });
			out.push({ lngLat: track.pointAt(turn), text: 'Wendepunkt' });
			out.push({ lngLat: track.pointAt(turn / 2), text: 'Hinweg' });
			out.push({ lngLat: track.pointAt((turn + track.total) / 2), text: 'Rückweg' });
		} else if (roundTrip) {
			out.push({ lngLat: line[0], text: 'Start und Ziel' });
		} else {
			out.push({ lngLat: line[0], text: 'Start' });
			out.push({ lngLat: line[line.length - 1], text: 'Ziel' });
		}
		return out;
	});
	let simulating = $state(false);

	// Übersicht über die ganze Strecke: Karte zeigt alles (Norden oben, verschiebbar). Nach einer Weile geht es von selbst
	// zurück zur Fahrtansicht – unterwegs soll niemand die Übersicht vergessen (Jan, 12.10.2026).
	const OVERVIEW_SECONDS = 45;
	let overview = $state(false);
	let overviewTimer: ReturnType<typeof setTimeout> | undefined;
	function setOverview(on: boolean) {
		overview = on;
		clearTimeout(overviewTimer);
		if (on) overviewTimer = setTimeout(() => (overview = false), OVERVIEW_SECONDS * 1000);
	}

	// Probefahrt nur am PC anbieten (Maus/Touchpad) – am Handy soll niemand aus Versehen darauf tippen.
	// Zum Vorführen am Handy: Adresse mit „?probefahrt“ aufrufen.
	const canSimulate =
		typeof window !== 'undefined' &&
		(window.matchMedia('(pointer: fine)').matches || new URLSearchParams(location.search).has('probefahrt'));

	const voice = new Voice();
	let navState = initialNavState();
	let stopFollowing: (() => void) | undefined;
	let releaseScreen: ScreenLock | undefined;
	// Der Browser hat das Wachhalten des Bildschirms nicht erlaubt → Hinweis in der Fahrtansicht
	let screenWarning = $state(false);
	// Ton: aus/an (Jan, 12.10.2026: „Ton aus“ und „Nochmal“ in der Fahrtansicht)
	let muted = $state(false);

	function toggleSound() {
		voice.muted = !voice.muted;
		muted = voice.muted;
		if (muted) voice.stop();
	}

	/** „Nochmal“: die aktuelle Anweisung noch einmal sprechen – auch bei ausgeschaltetem Ton */
	function repeatAnnouncementNow() {
		const final = !!view?.maneuver && !!track && view.maneuver.sign === 4 && view.maneuver.leg === track.legCount - 1;
		voice.say(repeatAnnouncement(view, final, tour.destinationName), false, true);
	}

	// Stopps zum Einkehren (für „Nächster Stopp“ und die Karte)
	let stops: { along: number; name: string; lngLat: [number, number] }[] = $state([]);
	$effect(() => {
		const t = track;
		if (!t || !line.length) return;
		loadPois(asset('/data/pois.json'))
			.then((index) => {
				stops = highlightStops(stopsAlongRoute(line, index)).map((s) => ({
					along: s.km * 1000,
					name: s.name ?? STOP_LABELS[s.kind],
					lngLat: s.lngLat
				}));
			})
			.catch(() => {});
	});

	const nextStop = $derived(view && !view.offRoute ? stops.find((s) => s.along > view!.state.along + 50) : undefined);
	const remainingKm = $derived(((view?.remaining ?? track?.total ?? 0) / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }));
	const arrival = $derived.by(() => {
		if (!track) return '';
		const share = (view?.remaining ?? track.total) / (track.total || 1);
		return new Date(Date.now() + share * tour.minutes * 60_000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
	});
	/** näher heran vor einer Abzweigung, sonst mehr Überblick */
	const zoom = $derived(view?.distance !== undefined && view.distance < 250 ? 17 : 16);

	function onFix(fix: Fix) {
		if (!track || phase !== 'running') return;
		const next = guide(track, navState, fix, tour.destinationName);
		navState = next.state;
		view = next;
		// alle Ansagen dieser Meldung in einem Satz – eine neue Ansage bricht sonst die vorige ab
		if (next.speak.length) voice.say(next.speak.map((a) => a.text).join(' '), next.speak.some((a) => a.beep));
		if (next.state.finished) finish();
	}

	async function start(simulate = false) {
		if (!track) return;
		voice.unlock();
		simulating = simulate;
		phase = 'running';
		await enterFullscreen();
		releaseScreen = await keepScreenOn();
		screenWarning = !releaseScreen.active && !simulate;
		stopFollowing = simulate
			? simulateRide(track, onFix)
			: followPosition(onFix, (p) => {
					problem = p;
					if (p === 'denied' || p === 'unsupported') {
						stopAll();
						phase = 'problem';
					}
				});
	}

	function stopAll() {
		stopFollowing?.();
		stopFollowing = undefined;
		releaseScreen?.();
		releaseScreen = undefined;
		voice.stop();
	}

	function pause() {
		setOverview(false);
		stopAll();
		phase = 'paused';
	}

	async function resume() {
		phase = 'running';
		releaseScreen = await keepScreenOn();
		screenWarning = !releaseScreen.active && !simulating;
		stopFollowing = simulating && track ? simulateRide(track, onFix) : followPosition(onFix, (p) => (problem = p));
	}

	function finish() {
		stopAll();
		phase = 'finished';
		void exitFullscreen();
	}

	let leaving = false;
	async function leave() {
		leaving = true;
		stopAll();
		await exitFullscreen();
		await goto(resolve('/tour/[id]', { id: tour.id }));
	}

	// Zurück-Taste während der Fahrt: nicht aus Versehen beenden, sondern erst anhalten und nachfragen
	beforeNavigate((navigation) => {
		if (leaving || (phase !== 'running' && phase !== 'paused')) return;
		navigation.cancel();
		if (phase === 'running') stopAll();
		phase = 'confirm-end';
	});

	// Bildschirm war kurz aus (Wachhalten wird dann vom Browser beendet) → wieder anfordern
	async function onVisibility() {
		if (document.visibilityState === 'visible' && phase === 'running' && !releaseScreen) {
			releaseScreen = await keepScreenOn();
			screenWarning = !releaseScreen.active && !simulating;
		}
		if (document.visibilityState === 'hidden') {
			releaseScreen?.();
			releaseScreen = undefined;
		}
	}

	onDestroy(() => {
		clearTimeout(overviewTimer);
		stopAll();
		if (typeof document !== 'undefined') void exitFullscreen();
	});
</script>

<svelte:head>
	<title>Genuss-Radeln – Unterwegs</title>
</svelte:head>

<svelte:document onvisibilitychange={onVisibility} />

<div class="nav" class:light={theme === 'light'}>
	{#if !track}
		<div class="screen">
			<BackLink href={resolve('/tour/[id]', { id: tour.id })} label="Zurück zur Tour" dark />
			<h1>Navigation</h1>
			<p>Für Beispieltouren gibt es keine Navigation. Bitte planen Sie einen echten Weg über die Startseite.</p>
		</div>
	{:else if phase === 'ready'}
		<div class="screen">
			<BackLink href={resolve('/tour/[id]', { id: tour.id })} label="Zurück zur Tour" dark />
			<h1>{tour.title}</h1>
			<p class="facts">{tour.km.toLocaleString('de-DE')} km · Ankunft ca. {arrival}</p>
			<ul class="hints">
				<li><Volume2 size={28} aria-hidden="true" /> Bitte stellen Sie den Ton laut – die App sagt jede Abzweigung an.</li>
				<li>Der Bildschirm bleibt während der Fahrt an. Mit „Pause“ darf er wieder ausgehen.</li>
				<li>Gleich fragt das Handy, ob die App Ihren Standort nutzen darf – bitte mit „Erlauben“ antworten.</li>
			</ul>
			<button type="button" class="go" onclick={() => start(false)}>Navigation starten</button>
			{#if canSimulate}
				<button type="button" class="secondary" onclick={() => start(true)}>Probefahrt am PC (ohne GPS)</button>
			{/if}
		</div>
	{:else if phase === 'problem'}
		<div class="screen">
			<h1>Standort nicht verfügbar</h1>
			{#if problem === 'denied'}
				<p>
					Die App darf Ihren Standort noch nicht nutzen. Tippen Sie oben in der Adresszeile auf das Schloss-Symbol,
					dann auf „Berechtigungen“ und erlauben Sie „Standort“. Danach hier noch einmal versuchen.
				</p>
			{:else}
				<p>Dieses Gerät kann den Standort nicht bestimmen.</p>
			{/if}
			<button type="button" class="go" onclick={() => start(false)}>Noch einmal versuchen</button>
			<button type="button" class="secondary" onclick={leave}>Zurück zur Tour</button>
		</div>
	{:else if phase === 'finished'}
		<div class="screen center">
			<TurnArrow kind="finish" size={120} />
			<h1>Geschafft!</h1>
			<p>Sie sind am Ziel. Schöne Pause!</p>
			<button type="button" class="go" onclick={leave}>Zur Tour</button>
		</div>
	{:else}
		<!-- Fahrt: oben die Anweisung, in der Mitte die Karte, unten Rest und Knöpfe -->
		<section class="instruction" aria-live="polite">
			{#if !view}
				<p class="action">Standort wird gesucht …</p>
			{:else if view.offRoute}
				<TurnArrow kind="straight" rotate={view.offRoute.bearing - view.heading} />
				<div>
					<p class="distance">{distanceText(view.offRoute.meters)}</p>
					<p class="action">zurück zur Strecke</p>
				</div>
			{:else if view.maneuver && view.distance !== undefined}
				<TurnArrow kind={arrowOf(view.maneuver.sign)} />
				<div>
					<p class="distance">{distanceText(view.distance)}</p>
					<p class="action">{view.maneuver.sign === 4 ? 'Ziel' : actionText(view.maneuver)}</p>
					{#if view.maneuver.street}<p class="street">{view.maneuver.street}</p>{/if}
					{#if view.then}
						<p class="then">
							<span>dann</span>
							<TurnArrow kind={arrowOf(view.then.sign)} size={30} />
							<span>{actionText(view.then)}</span>
						</p>
					{/if}
				</div>
			{/if}
		</section>

		<div class="map">
			<NavMap
				behind={behindLine}
				ahead={aheadLine}
				rest={restLine}
				whole={line}
				labels={signs}
				position={view?.position}
				heading={view?.heading ?? track.bearingAt(0)}
				{zoom}
				{theme}
				stops={stops.map((s) => s.lngLat)}
				{overview}
				oninteract={() => overview && setOverview(true)}
				label={overview ? 'Übersicht über die ganze Strecke' : 'Karte mit Ihrer Position auf der Strecke'}
			/>
			<!-- hell/dunkel: schwebend oben links auf der Karte (seltener gebraucht als Ton und Pause) -->
			<button type="button" class="theme-button" onclick={() => (theme = theme === 'dark' ? 'light' : 'dark')}>
				{#if theme === 'dark'}<Sun size={24} aria-hidden="true" /> Heller{:else}<Moon size={24} aria-hidden="true" /> Dunkler{/if}
			</button>
			{#if simulating}<p class="sim">Probefahrt</p>{/if}
			{#if overview}
				<button type="button" class="back-to-ride go" onclick={() => setOverview(false)}>
					<Navigation size={26} aria-hidden="true" /> Zurück zur Fahrt
				</button>
			{:else}
				<button type="button" class="overview-button" onclick={() => setOverview(true)}>
					<MapIcon size={24} aria-hidden="true" /> Ganze Strecke
				</button>
			{/if}
		</div>

		<section class="status">
			<p><strong>noch {remainingKm} km</strong> · an {arrival}</p>
			{#if nextStop && view}
				<p class="next-stop">Einkehr: {nextStop.name} in {distanceText(nextStop.along - view.state.along)}</p>
			{/if}
			{#if screenWarning}
				<p class="warning" role="status">
					Ihr Handy hält den Bildschirm nicht von selbst an. Bitte stellen Sie in den Einstellungen die Bildschirmzeit auf „nie“
					oder möglichst lang.
				</p>
			{/if}
			<div class="buttons">
				<button type="button" class="secondary" onclick={repeatAnnouncementNow}>
					<Repeat size={26} aria-hidden="true" /> Nochmal
				</button>
				<button type="button" class="secondary" aria-pressed={muted} onclick={toggleSound}>
					{#if muted}<VolumeX size={26} aria-hidden="true" /> Ton an{:else}<Volume2 size={26} aria-hidden="true" /> Ton aus{/if}
				</button>
				<button type="button" class="secondary" onclick={pause}><Pause size={26} aria-hidden="true" /> Pause</button>
			</div>
		</section>

		{#if phase === 'paused' || phase === 'confirm-end'}
			<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
				{#if phase === 'paused'}
					<h2 id="pause-title">Pause</h2>
					<p>Die Ansagen schweigen, der Bildschirm darf ausgehen.</p>
					<button type="button" class="go" onclick={resume}><Play size={26} aria-hidden="true" /> Weiterfahren</button>
					<button type="button" class="secondary" onclick={() => (phase = 'confirm-end')}>
						<Flag size={24} aria-hidden="true" /> Navigation beenden
					</button>
				{:else}
					<h2 id="pause-title">Navigation wirklich beenden?</h2>
					<button type="button" class="go" onclick={leave}>Ja, beenden</button>
					<button type="button" class="secondary" onclick={resume}>Nein, weiterfahren</button>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	/* dunkel (Standard): schwarz spart auf OLED-Bildschirmen Strom; hell: für pralle Sonne */
	.nav {
		--nav-bg: var(--color-nav-bg);
		--nav-text: var(--color-nav-text);
		--nav-muted: var(--color-nav-muted);
		--nav-accent: var(--color-nav-orange);
		--nav-line: var(--color-nav-surface);
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: var(--nav-bg);
		color: var(--nav-text);
	}

	.nav.light {
		--nav-bg: var(--color-bg);
		--nav-text: var(--color-text);
		--nav-muted: var(--color-text-muted);
		--nav-accent: var(--color-orange);
		--nav-line: var(--color-border);
	}

	.screen {
		display: grid;
		align-content: start;
		gap: 1rem;
		width: 100%;
		max-width: var(--page-width);
		margin: 0 auto;
		padding: max(0.75rem, env(safe-area-inset-top)) 1rem 2rem;
		overflow-y: auto;
	}

	.screen.center {
		justify-items: center;
		text-align: center;
		color: var(--nav-accent);
		padding-top: 4rem;
	}

	.screen h1,
	.screen p {
		margin: 0;
		color: var(--nav-text);
	}

	.facts {
		font-size: var(--text-large);
		font-weight: 700;
	}

	.hints {
		display: grid;
		gap: 0.75rem;
		margin: 0.5rem 0;
		padding: 0;
		list-style: none;
		color: var(--nav-muted);
	}

	.hints li {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.hints :global(svg) {
		flex: none;
		color: var(--nav-accent);
	}

	button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 3.5rem;
		padding: 0.75rem 1rem;
		border-radius: 1rem;
		font: inherit;
		font-size: var(--text-large);
		font-weight: 700;
		cursor: pointer;
	}

	.go {
		border: 0;
		background: var(--nav-accent);
		color: var(--nav-bg);
	}

	.light .go {
		color: var(--color-surface);
	}

	.secondary {
		border: 2px solid var(--nav-muted);
		background: transparent;
		color: var(--nav-text);
	}

	/* Anweisung: groß genug, um sie am Lenker aus 60–70 cm zu lesen */
	.instruction {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: max(0.75rem, env(safe-area-inset-top)) 1rem 0.75rem;
		color: var(--nav-accent);
		min-height: 7.5rem;
	}

	.instruction p {
		margin: 0;
	}

	.distance {
		font-size: 3.25rem;
		font-weight: 700;
		line-height: 1;
		color: var(--nav-text);
	}

	.action {
		font-size: 1.625rem;
		font-weight: 700;
		line-height: 1.15;
		color: var(--nav-accent);
	}

	.street {
		font-size: 1.25rem;
		color: var(--nav-muted);
		overflow-wrap: anywhere;
	}

	/* gleich danach die nächste Abzweigung („dann ↱ rechts abbiegen“) */
	.then {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
		margin-top: 0.25rem !important;
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--nav-text);
	}

	.then :global(svg) {
		color: var(--nav-accent);
	}

	.map {
		position: relative;
		flex: 1;
		min-height: 10rem;
		border-block: 2px solid var(--nav-line);
	}

	/* Knöpfe auf der Karte: schwebend, mit Rand, damit sie auf jedem Kartenhintergrund zu sehen sind */
	.overview-button,
	.theme-button,
	.back-to-ride {
		position: absolute;
		z-index: 2;
		width: auto;
		min-height: 3.5rem;
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.5);
	}

	.theme-button {
		top: 0.75rem;
		left: 0.75rem;
		padding: 0.5rem 1rem;
		border: 2px solid var(--nav-muted);
		background: var(--nav-bg);
		color: var(--nav-text);
		font-size: var(--text-base);
	}

	.overview-button {
		top: 0.75rem;
		right: 0.75rem;
		padding: 0.5rem 1rem;
		border: 2px solid var(--nav-muted);
		background: var(--nav-bg);
		color: var(--nav-text);
		font-size: var(--text-base);
	}

	.back-to-ride {
		bottom: 0.75rem;
		left: 1rem;
		right: 1rem;
	}

	.sim {
		position: absolute;
		top: 5rem;
		left: 0.75rem;
		margin: 0;
		padding: 0.125rem 0.625rem;
		border-radius: 999px;
		background: var(--nav-accent);
		color: var(--nav-bg);
		font-weight: 700;
	}

	.status {
		display: grid;
		gap: 0.5rem;
		padding: 0.75rem 1rem max(0.75rem, env(safe-area-inset-bottom));
		font-size: var(--text-large);
	}

	.status p {
		margin: 0;
	}

	.next-stop {
		color: var(--nav-muted);
		font-size: var(--text-base);
	}

	/* drei Knöpfe nebeneinander: Symbol über dem Text, damit auch große Systemschrift hineinpasst */
	.buttons {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}

	.buttons button {
		flex-direction: column;
		gap: 0.125rem;
		min-height: 4.25rem;
		padding: 0.5rem 0.25rem;
		font-size: var(--text-base);
		line-height: 1.2;
	}

	.buttons button[aria-pressed='true'] {
		background: var(--nav-accent);
		border-color: var(--nav-accent);
		color: var(--nav-bg);
	}

	.warning {
		padding: 0.5rem 0.75rem;
		border: 2px solid var(--nav-accent);
		border-radius: 0.75rem;
		font-size: var(--text-base);
	}

	.overlay {
		position: absolute;
		inset: 0;
		z-index: 10;
		display: grid;
		align-content: center;
		gap: 1rem;
		padding: 1.5rem;
		background: var(--nav-bg);
		text-align: center;
	}

	.overlay h2,
	.overlay p {
		margin: 0;
		color: var(--nav-text);
	}
</style>
