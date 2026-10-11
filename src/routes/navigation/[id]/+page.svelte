<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { beforeNavigate, goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import Download from '@lucide/svelte/icons/download';
	import Flag from '@lucide/svelte/icons/flag';
	import MapIcon from '@lucide/svelte/icons/map';
	import Minus from '@lucide/svelte/icons/minus';
	import Navigation from '@lucide/svelte/icons/navigation';
	import Plus from '@lucide/svelte/icons/plus';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Repeat from '@lucide/svelte/icons/repeat';
	import Share2 from '@lucide/svelte/icons/share-2';
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
	import { RideRecorder, rideMinutesRecorded, type RideRecord } from '$lib/navigation/recorder';
	import { canShareRide, downloadRide, shareRide } from '$lib/navigation/ride-file';
	import { removeRide, saveRide } from '$lib/storage/rides';
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
	// Zoom (Jan, 13.10.2026: „keine Möglichkeit rauszuzoomen“): Plus und Minus auf der Karte; wer herauszoomt, sieht auch mehr vom Weg
	// vor sich (sonst endete die Linie mitten im Bild)
	const ZOOM_MIN = -3;
	const ZOOM_MAX = 2;
	let zoomOffset = $state(0);
	const AHEAD_BY_ZOOM = [2500, 2500, 5000, 8000];
	const AHEAD_M = $derived(AHEAD_BY_ZOOM[Math.min(3, Math.max(0, -zoomOffset))]);
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

	/**
	 * Die nächste Abzweigung als großes Zeichen auf der Karte (Jan, 13.10.2026: am schmalen, unbenannten Weg war unklar, wo es
	 * abbiegen sollte): Scheibe mit Abbiegepfeil genau dort, ausgerichtet an der Fahrtrichtung, die man dort hat. Erst ab 600 m.
	 */
	const TURN_SHOWN_M = 600;
	const turn = $derived.by(() => {
		const m = view?.maneuver;
		if (!track || !view || view.offRoute || !m || m.sign === 4 || view.distance === undefined || view.distance > TURN_SHOWN_M) return undefined;
		return { lngLat: track.pointAt(m.at), kind: arrowOf(m.sign), bearing: track.bearingAt(Math.max(0, m.at - 20), 20) };
	});

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

	// Fahrt aufzeichnen (Testbetrieb): Standortmeldungen und was die App angezeigt hat, nur auf dem Gerät; am Ende als Datei zu speichern.
	// Voreinstellung „an“, die Person kann es vor der Fahrt abschalten – und merkt es sich.
	const RECORD_KEY = 'genuss-fahrt-aufzeichnen';
	function readRecordChoice(): boolean {
		try {
			return localStorage.getItem(RECORD_KEY) !== 'aus';
		} catch {
			return true;
		}
	}
	let recordRide = $state(readRecordChoice());
	function setRecordChoice(on: boolean) {
		recordRide = on;
		try {
			localStorage.setItem(RECORD_KEY, on ? 'an' : 'aus');
		} catch {
			// Speicher gesperrt – dann gilt die Wahl nur für diese Fahrt
		}
	}
	let recorder: RideRecorder | undefined;
	let rideRecord: RideRecord | undefined = $state();
	let reachedGoal = $state(false);
	let saveNote = $state('');
	const canShare = $derived(rideRecord ? canShareRide(rideRecord) : false);

	// Meldet das GPS länger nichts, steht die Anzeige still – dann soll das sichtbar sein (und in der Aufzeichnung stehen)
	const STALE_SECONDS = 15;
	let lastFixAt = Date.now();
	let stale = $state(false);
	let wasStale = false;
	let ticker: ReturnType<typeof setInterval> | undefined;
	let tickCount = 0;
	const signalNote = $derived(
		stale
			? 'Der Standort wird gerade nicht aktualisiert – die Anzeige kann veraltet sein.'
			: view?.weak && view.state.started
				? 'Der Standort ist gerade ungenau – die Anzeige wartet auf bessere Meldungen.'
				: ''
	);

	async function persist() {
		if (recorder) await saveRide(recorder.record).catch(() => {});
	}

	function startTicker() {
		stopTicker();
		lastFixAt = Date.now();
		ticker = setInterval(() => {
			stale = phase === 'running' && !simulating && Date.now() - lastFixAt > STALE_SECONDS * 1000;
			if (stale && !wasStale) recorder?.event(`Keine Standortmeldung seit ${STALE_SECONDS} s`);
			wasStale = stale;
			// unterwegs alle ~20 s sichern, falls der Browser die Seite beendet
			if (++tickCount % 7 === 0) void persist();
		}, 3000);
	}

	function stopTicker() {
		clearInterval(ticker);
		ticker = undefined;
		stale = false;
		wasStale = false;
	}

	/** Aufzeichnung abschließen: fertige Fahrt für die Speichern-Knöpfe bereithalten */
	function endRecording(reached: boolean) {
		reachedGoal = reached;
		if (!recorder) return;
		recorder.finish();
		rideRecord = JSON.parse(JSON.stringify(recorder.record));
		void saveRide(recorder.record).catch(() => {});
		recorder = undefined;
	}

	function saveRideFile() {
		if (!rideRecord) return;
		downloadRide(rideRecord);
		saveNote = 'Die Datei liegt jetzt im Ordner „Downloads“ Ihres Handys.';
	}

	async function sendRide() {
		if (!rideRecord) return;
		saveNote = (await shareRide(rideRecord)) ? '' : 'Das Verschicken hat nicht geklappt. Bitte speichern Sie die Datei stattdessen.';
	}
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
	const zoom = $derived((view?.distance !== undefined && view.distance < 250 ? 17 : 16) + zoomOffset);

	function onFix(fix: Fix) {
		if (!track || phase !== 'running') return;
		const next = guide(track, navState, fix, tour.destinationName);
		navState = next.state;
		if (recorder) {
			if (next.state.offRoute !== !!view?.state.offRoute) recorder.event(next.state.offRoute ? 'Strecke verlassen' : 'Wieder auf der Strecke');
			if (next.weak && !view?.weak) recorder.event(`Meldung zu ungenau (${Math.round(fix.accuracy ?? 0)} m) – nicht benutzt`);
		}
		view = next;
		lastFixAt = Date.now();
		recorder?.fix(fix, next);
		// alle Ansagen dieser Meldung in einem Satz – eine neue Ansage bricht sonst die vorige ab
		if (next.speak.length) voice.say(next.speak.map((a) => a.text).join(' '), next.speak.some((a) => a.beep));
		if (next.state.finished) finish();
	}

	async function start(simulate = false) {
		if (!track) return;
		voice.unlock();
		simulating = simulate;
		rideRecord = undefined;
		saveNote = '';
		recorder = undefined;
		if (recordRide) {
			recorder = new RideRecorder({
				tourId: tour.id,
				title: tour.title,
				meters: track.total,
				planned: line.map(([lon, lat]) => [lon, lat] as [number, number]),
				device: simulate ? 'Probefahrt am PC' : navigator.userAgent
			});
			recorder.event('Start');
			void persist();
		}
		phase = 'running';
		startTicker();
		await enterFullscreen();
		releaseScreen = await keepScreenOn();
		screenWarning = !releaseScreen.active && !simulate;
		stopFollowing = simulate
			? simulateRide(track, onFix)
			: followPosition(onFix, (p) => {
					problem = p;
					recorder?.event(`Standort-Problem: ${p}`);
					if (p === 'denied' || p === 'unsupported') {
						stopAll();
						phase = 'problem';
					}
				});
	}

	function stopAll() {
		stopTicker();
		void persist();
		stopFollowing?.();
		stopFollowing = undefined;
		releaseScreen?.();
		releaseScreen = undefined;
		voice.stop();
	}

	/** „Beenden“ in der Fahrtansicht: anhalten und nachfragen – nichts geht durch einen Fehlgriff verloren */
	function askToEnd() {
		recorder?.event('„Beenden“ angetippt');
		setOverview(false);
		stopAll();
		phase = 'confirm-end';
	}

	function pause() {
		recorder?.event('Pause');
		setOverview(false);
		stopAll();
		phase = 'paused';
	}

	async function resume() {
		recorder?.event('Weiter');
		phase = 'running';
		startTicker();
		releaseScreen = await keepScreenOn();
		screenWarning = !releaseScreen.active && !simulating;
		stopFollowing = simulating && track ? simulateRide(track, onFix) : followPosition(onFix, (p) => (problem = p));
	}

	function finish() {
		recorder?.event('Ziel erreicht');
		stopAll();
		endRecording(true);
		phase = 'finished';
		void exitFullscreen();
	}

	/** „Ja, beenden“: war die Fahrt aufgezeichnet, kommt zuerst die Seite zum Speichern der Datei */
	function endRide() {
		if (recorder && recorder.fixCount >= 5) {
			recorder.event('Beendet');
			stopAll();
			endRecording(false);
			phase = 'finished';
			void exitFullscreen();
			return;
		}
		// zu kurz zum Auswerten: nichts aufheben
		if (recorder) void removeRide(recorder.record.id).catch(() => {});
		recorder = undefined;
		void leave();
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
		if (phase === 'running') {
			recorder?.event(document.visibilityState === 'hidden' ? 'Seite im Hintergrund (Bildschirm aus oder andere App)' : 'Seite wieder sichtbar');
			if (document.visibilityState === 'hidden') void persist();
		}
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
			<label class="record">
				<input type="checkbox" checked={recordRide} onchange={(e) => setRecordChoice(e.currentTarget.checked)} />
				<span>Fahrt aufzeichnen – für den Test. Die Aufzeichnung bleibt auf Ihrem Handy, bis Sie sie selbst verschicken.</span>
			</label>
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
			<h1>{reachedGoal ? 'Geschafft!' : 'Fahrt beendet'}</h1>
			<p>{reachedGoal ? 'Sie sind am Ziel. Schöne Pause!' : 'Die Navigation ist beendet.'}</p>
			{#if rideRecord}
				<p class="record-note">
					Ihre Fahrt wurde aufgezeichnet ({rideMinutesRecorded(rideRecord)} {rideMinutesRecorded(rideRecord) === 1 ? 'Minute' : 'Minuten'}). Bitte speichern Sie sie als Datei und schicken Sie
					sie uns – so sehen wir, was gefahren wurde.
				</p>
				<button type="button" class="go" onclick={saveRideFile}><Download size={26} aria-hidden="true" /> Fahrt speichern</button>
				{#if canShare}
					<button type="button" class="secondary" onclick={sendRide}><Share2 size={26} aria-hidden="true" /> Fahrt verschicken</button>
				{/if}
				{#if saveNote}<p role="status" class="record-note">{saveNote}</p>{/if}
			{/if}
			<button type="button" class={rideRecord ? 'secondary' : 'go'} onclick={leave}>Zur Tour</button>
		</div>
	{:else}
		<!-- Fahrt: oben die Anweisung, in der Mitte die Karte, unten Rest und Knöpfe -->
		<section class="instruction" aria-live="polite">
			{#if !view || (view.weak && !view.state.started)}
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
					{#if view.maneuver.street}<p class="street">{view.maneuver.street}</p>{:else if view.maneuver.way}<p class="street">auf den {view.maneuver.way}</p>{/if}
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
					{turn}
				heading={view?.heading ?? track.bearingAt(0)}
				{zoom}
				{theme}
				stops={stops.map((s) => s.lngLat)}
				{overview}
				oninteract={() => overview && setOverview(true)}
				label={overview ? 'Übersicht über die ganze Strecke' : 'Karte mit Ihrer Position auf der Strecke'}
			/>
			{#if !overview}
				<!-- Karte größer/kleiner: große Knöpfe am rechten Rand -->
				<div class="zoom-buttons">
					<button type="button" aria-label="Karte vergrößern" disabled={zoomOffset >= ZOOM_MAX} onclick={() => (zoomOffset = Math.min(ZOOM_MAX, zoomOffset + 1))}>
						<Plus size={30} strokeWidth={3} aria-hidden="true" />
					</button>
					<button type="button" aria-label="Karte verkleinern" disabled={zoomOffset <= ZOOM_MIN} onclick={() => (zoomOffset = Math.max(ZOOM_MIN, zoomOffset - 1))}>
						<Minus size={30} strokeWidth={3} aria-hidden="true" />
					</button>
				</div>
			{/if}
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
			<div class="progress">
				<p><strong>noch {remainingKm} km</strong> · an {arrival}</p>
				<!-- eindeutig beschriftet: bei „Pause“ denkt niemand an „Beenden“ (Jan, 13.10.2026) -->
				<button type="button" class="end-button" onclick={askToEnd}>
					<Flag size={22} aria-hidden="true" /> Beenden
				</button>
			</div>
			{#if nextStop && view}
				<p class="next-stop">Einkehr: {nextStop.name} in {distanceText(nextStop.along - view.state.along)}</p>
			{/if}
			{#if signalNote}
				<p class="warning" role="status">{signalNote}</p>
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
					<button type="button" class="go" onclick={endRide}>Ja, beenden</button>
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

	.record {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		min-height: var(--tap);
		padding: 0.75rem 0.875rem;
		border: 2px solid var(--nav-muted);
		border-radius: var(--radius);
		color: var(--nav-text);
	}

	.record input {
		flex: none;
		width: 1.75rem;
		height: 1.75rem;
		margin: 0.125rem 0 0;
		accent-color: var(--nav-accent);
	}

	.record-note {
		color: var(--nav-text);
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

	.zoom-buttons {
		position: absolute;
		right: 0.75rem;
		bottom: 2.75rem;
		z-index: 2;
		display: grid;
		gap: 0.5rem;
	}

	.zoom-buttons button {
		width: 3.5rem;
		min-height: 3.5rem;
		padding: 0;
		border: 2px solid var(--nav-muted);
		border-radius: 50%;
		background: var(--nav-bg);
		color: var(--nav-text);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.5);
	}

	.zoom-buttons button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
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

	.progress {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.end-button {
		flex: none;
		width: auto;
		min-height: 3rem;
		padding: 0.25rem 1rem;
		border: 2px solid var(--nav-accent);
		background: transparent;
		color: var(--nav-accent);
		font-size: var(--text-base);
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
