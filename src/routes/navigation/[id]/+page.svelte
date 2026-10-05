<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { beforeNavigate, goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import Flag from '@lucide/svelte/icons/flag';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import BackLink from '$lib/components/BackLink.svelte';
	import NavMap from '$lib/map/NavMap.svelte';
	import type { NavTheme } from '$lib/map/nav-style';
	import {
		enterFullscreen,
		exitFullscreen,
		followPosition,
		keepScreenOn,
		simulateRide,
		Voice,
		type PositionProblem
	} from '$lib/navigation/device';
	import { guide, initialNavState, type Fix, type NavView } from '$lib/navigation/guidance';
	import { RouteTrack } from '$lib/navigation/track';
	import TurnArrow from '$lib/navigation/TurnArrow.svelte';
	import { actionText, arrowOf, distanceText } from '$lib/navigation/wording';
	import { highlightStops, stopsAlongRoute } from '$lib/stops/along';
	import { STOP_LABELS } from '$lib/stops/kinds';
	import { loadPois } from '$lib/stops/pois';
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
	let simulating = $state(false);

	// Probefahrt nur am PC anbieten (Maus/Touchpad) – am Handy soll niemand aus Versehen darauf tippen.
	// Zum Vorführen am Handy: Adresse mit „?probefahrt“ aufrufen.
	const canSimulate =
		typeof window !== 'undefined' &&
		(window.matchMedia('(pointer: fine)').matches || new URLSearchParams(location.search).has('probefahrt'));

	const voice = new Voice();
	let navState = initialNavState();
	let stopFollowing: (() => void) | undefined;
	let releaseScreen: (() => void) | undefined;

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
		for (const a of next.speak) voice.say(a.text, a.beep);
		if (next.state.finished) finish();
	}

	async function start(simulate = false) {
		if (!track) return;
		voice.unlock();
		simulating = simulate;
		phase = 'running';
		await enterFullscreen();
		releaseScreen = await keepScreenOn();
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
		stopAll();
		phase = 'paused';
	}

	async function resume() {
		phase = 'running';
		releaseScreen = await keepScreenOn();
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
		if (document.visibilityState === 'visible' && phase === 'running' && !releaseScreen) releaseScreen = await keepScreenOn();
		if (document.visibilityState === 'hidden') {
			releaseScreen?.();
			releaseScreen = undefined;
		}
	}

	onDestroy(() => {
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
			<p>Für Beispieltouren gibt es keine Navigation. Bitte planen Sie einen echten Weg über „Tour finden“.</p>
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
				</div>
			{/if}
		</section>

		<div class="map">
			<NavMap
				{line}
				position={view?.position}
				heading={view?.heading ?? track.bearingAt(0)}
				{zoom}
				{theme}
				stops={stops.map((s) => s.lngLat)}
				label="Karte mit Ihrer Position auf der Strecke"
			/>
			{#if simulating}<p class="sim">Probefahrt</p>{/if}
		</div>

		<section class="status">
			<p><strong>noch {remainingKm} km</strong> · an {arrival}</p>
			{#if nextStop && view}
				<p class="next-stop">Einkehr: {nextStop.name} in {distanceText(nextStop.along - view.state.along)}</p>
			{/if}
			<div class="buttons">
				<button type="button" class="secondary" onclick={() => (theme = theme === 'dark' ? 'light' : 'dark')}>
					{#if theme === 'dark'}<Sun size={24} aria-hidden="true" /> Heller{:else}<Moon size={24} aria-hidden="true" /> Dunkler{/if}
				</button>
				<button type="button" class="secondary" onclick={pause}><Pause size={24} aria-hidden="true" /> Pause</button>
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

	.map {
		position: relative;
		flex: 1;
		min-height: 10rem;
		border-block: 2px solid var(--nav-line);
	}

	.sim {
		position: absolute;
		top: 0.5rem;
		left: 0.5rem;
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

	.buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
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
