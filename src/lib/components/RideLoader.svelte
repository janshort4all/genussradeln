<script lang="ts">
	import { onMount, tick as afterRender, untrack } from 'svelte';
	import type { PlanProgress } from '$lib/routing/progress';
	import { BACK, COFFEE, COFFEE_AT, COFFEE_SECONDS, EXPLAIN, nextQuip, sceneFor, SCENES, stageLabel, STATIONS, textOf, type Part } from './ride-story';

	/**
	 * Wartebild (Jan, 14.10.2026; Neufassung 13.10.2026): füllt die ganze Fläche zwischen der Zeile oben und der unteren Leiste. Ein E-Bike in
	 * unserem Orange fährt eine Landstraße entlang, Opi tritt in die Pedale (Beine über SMIL-Pfade, die zur Kurbel passen), Schal und Haarbüschel
	 * wehen. Die Szene wird je nach Fenstergröße neu aufgespannt (viewBox = Fläche in Einheiten), damit sie am Handy hoch und am PC breit
	 * ausgefüllt ist; das Rad bleibt dabei immer ganz im Bild.
	 *
	 * Echter Fortschritt (`progress` von der Planung): eine Wegstrecke mit Stationen und Fähnchen zeigt, in welcher Etappe die Suche ist, dazu der
	 * Zähler gerechneter Wege; die Landschaft wechselt mit den Etappen (Felder, Wald, See, Dorf, Wald, Ziel), der Himmel wird zum Abend hin wärmer,
	 * Opi winkt bei jedem Wechsel und sagt zu jeder Etappe etwas. Ab 3 s erklärt er, warum es länger dauert; bei langen Wartezeiten macht er
	 * eine Kaffeepause. Bei „weniger Bewegung“ ein ruhiges Standbild.
	 * Gestaltung: nichts Hartes – Creme statt Weiß, Taubenblau/Dunkelgrün statt Schwarz, weiche Schatten.
	 */
	let {
		title,
		progress,
		/** weite Strecke: ehrlich vorwarnen, dass es länger dauern kann */
		long = false,
		/** nach so vielen Sekunden meldet sich Opi mit der Erklärung */
		explainAfter = 3
	}: { title: string; progress?: PlanProgress; long?: boolean; explainAfter?: number } = $props();

	let box: HTMLDivElement | undefined = $state();
	let svg: SVGSVGElement | undefined = $state();
	let w = $state(360);
	let h = $state(600);
	let elapsed = $state(0); // Sekunden seit Beginn
	let message: Part[] | undefined = $state();
	let messageKey = $state(0);
	let coffee = $state(false);
	let waving = $state(false);

	const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const fraction = $derived(progress?.fraction ?? 0);
	const scene = $derived(sceneFor(fraction));
	const label = $derived(progress ? stageLabel(progress.stage) : 'Karten und Wege vorbereiten');
	const requests = $derived(progress?.requests ?? 0);

	/** Maßstab: das Rad (ca. 200 Einheiten breit, Opis Schal inbegriffen) soll gut vier Fünftel der Breite füllen (Rest: Luft zum Rand), die Szene höchstens gut die Hälfte der Höhe, am PC nicht riesig werden */
	const scale = $derived(Math.max(0.6, Math.min(w / 262, (h * 0.54) / 200, 2.8)));
	const width = $derived(w / scale);
	const height = $derived(h / scale);
	const top = $derived(height - 200); // Oberkante der Szene (darüber ist Himmel)
	const copies = $derived(Array.from({ length: Math.ceil(width / 360) + 1 }, (_, i) => i * 360));
	/** Abstand der Köpfe von der Oberkante der Fläche (px): bis hierher reicht der Platz für Überschrift, Fortschritt und Sprechblase */
	const roomAbove = $derived(Math.max(0, (top - 8) * scale));
	/**
	 * Reicht der Platz über Opis Kopf? Die Höhen von Überschrift + Fortschritt (oben) und Sprechblase (unten, für die längste Erklärung
	 * freigehalten) werden gemessen. Ist es zu eng, wird nach und nach gespart: 1 der Hinweis „Weite Strecke“ entfällt, 2 die Sprechblase
	 * wird kleiner gesetzt, 3 die sichtbare Überschrift entfällt (bleibt für Vorlesegeräte), 4 Etappe und Zähler – der Balken bleibt immer.
	 */
	let level = $state(0);
	/** Höhe des oberen Blocks (Überschrift, Fortschritt) – die Sprechblase daneben darf nicht hineinragen */
	let topH = $state(0);
	/** Breit und flach (PC, Handy quer): Die Sprechblase steht links neben Opis Kopf statt darüber – oben bleibt der Platz für Überschrift und Fortschritt */
	const side = $derived(w >= 640 && w / h > 1.15);
	let topEl: HTMLDivElement | undefined = $state();
	let slotEl: HTMLDivElement | undefined = $state();

	async function fit() {
		await afterRender();
		// die neue Stufe muss gezeichnet sein, bevor gemessen wird
		await new Promise((r) => setTimeout(r, 40));
		if (!topEl) return;
		topH = topEl.offsetHeight;
		if (topEl.offsetHeight + (side ? 0 : (slotEl?.offsetHeight ?? 0)) + 40 > roomAbove && level < 4) level++;
	}

	$effect(() => {
		// andere Fenstergröße: wieder mit allem anfangen
		void roomAbove;
		void w;
		level = 0;
	});

	$effect(() => {
		void [level, roomAbove, w, label, requests, long, side];
		void fit();
	});

	function say(parts: Part[] | undefined) {
		message = parts;
		messageKey++;
		spokeAt = elapsed;
		spokeStage = progress?.stage;
	}
	let spokeAt = 0;
	let spokeStage: string | undefined;
	let explained = false;
	const said = new Set<string>();

	function startCoffee() {
		coffee = true;
		waving = false;
		say(COFFEE);
		svg?.pauseAnimations();
		setTimeout(() => {
			coffee = false;
			if (!reduced) svg?.unpauseAnimations();
			say(BACK);
		}, COFFEE_SECONDS * 1000);
	}

	/** Jede Sekunde: zur rechten Zeit etwas sagen, Kaffeepause einlegen */
	function tick() {
		elapsed++;
		void fit(); // Sicherheitsnetz: Zeilenumbrüche können sich auch ohne Größenänderung der Fläche verschieben (Schrift, Zähler)
		if (coffee) return;
		if ((COFFEE_AT as readonly number[]).includes(elapsed)) return startCoffee();
		if (!explained) {
			if (elapsed >= explainAfter) {
				explained = true;
				say(EXPLAIN);
			}
			return;
		}
		const age = elapsed - spokeAt;
		const stageChanged = progress && progress.stage !== spokeStage;
		if (age >= 10 || (stageChanged && age >= 5)) {
			const next = progress && nextQuip(progress.stage, said);
			if (next) say(next);
			else if (age >= 14) say(undefined); // nichts Neues: Opi schweigt und radelt
		}
	}

	// Beim Wechsel der Landschaft winkt Opi kurz
	let lastScene: string | undefined;
	$effect(() => {
		const now = scene;
		untrack(() => {
			if (lastScene && lastScene !== now && !coffee && !reduced) {
				waving = true;
				setTimeout(() => (waving = false), 2200);
			}
			lastScene = now;
		});
	});

	onMount(() => {
		const measure = () => {
			if (!box) return;
			const r = box.getBoundingClientRect();
			if (r.width && r.height) {
				w = r.width;
				h = r.height;
			}
		};
		measure();
		const observer = new ResizeObserver(measure);
		if (box) observer.observe(box);
		const fitObserver = new ResizeObserver(() => void fit());
		if (topEl) fitObserver.observe(topEl);
		if (slotEl) fitObserver.observe(slotEl);
		window.addEventListener('resize', measure);
		// die Schrift ändert die Zeilenumbrüche: nach dem Laden neu messen
		void document.fonts?.ready.then(() => (level = 0));
		const clock = setInterval(tick, 1000);
		// SMIL (Beine, Kurbel) lässt sich nicht per CSS abschalten
		if (reduced) svg?.pauseAnimations();
		return () => {
			observer.disconnect();
			fitObserver.disconnect();
			window.removeEventListener('resize', measure);
			clearInterval(clock);
		};
	});

	// --- Beine: zwei Knochen (Oberschenkel, Unterschenkel) vom Becken zum Fuß auf dem Pedal; je Kurbelstellung ein Pfad, SMIL läuft mit der Kurbel ---
	const HIP = [114, 81];
	const CRANK = [138, 152];
	const PEDAL = [-12, -11]; // Pedal bei Kurbelwinkel 0 (relativ zur Kurbelachse)
	const THIGH = 47;
	const SHIN = 47;
	const STEPS = 16;
	const f = (n: number) => n.toFixed(1);

	function ankle(phi: number): [number, number] {
		const a = (phi * Math.PI) / 180;
		return [
			CRANK[0] + PEDAL[0] * Math.cos(a) - PEDAL[1] * Math.sin(a) - 1,
			CRANK[1] + PEDAL[0] * Math.sin(a) + PEDAL[1] * Math.cos(a) - 7
		];
	}

	function leg(phi: number): string {
		const [ax, ay] = ankle(phi);
		const dx = ax - HIP[0];
		const dy = ay - HIP[1];
		const d = Math.hypot(dx, dy);
		const reach = Math.min(d, THIGH + SHIN - 0.5);
		const along = (THIGH * THIGH - SHIN * SHIN + reach * reach) / (2 * reach);
		const out = Math.sqrt(Math.max(0, THIGH * THIGH - along * along));
		const ux = dx / d;
		const uy = dy / d;
		// das Knie zeigt nach vorn (rechts)
		const sign = -uy > 0 ? 1 : -1;
		const kx = HIP[0] + ux * along + -uy * out * sign;
		const ky = HIP[1] + uy * along + ux * out * sign;
		return `M${f(HIP[0])} ${f(HIP[1])}L${f(kx)} ${f(ky)}L${f(ax)} ${f(ay)}`;
	}

	function shoe(phi: number): string {
		const [ax, ay] = ankle(phi);
		return `M${f(ax - 3)} ${f(ay + 2)}L${f(ax + 10)} ${f(ay + 4)}`;
	}

	const frames = (fn: (phi: number) => string, offset: number) =>
		Array.from({ length: STEPS + 1 }, (_, i) => fn(offset + (i * 360) / STEPS)).join(';');

	const nearLeg = frames(leg, 0);
	const farLeg = frames(leg, 180);
	const nearShoe = frames(shoe, 0);
	const farShoe = frames(shoe, 180);

	// Bäume im Wald (x, Maßstab, Art) und Wimpel am Straßenrand (x, Farbe)
	const FOREST_TREES: [number, number, 'c' | 'b'][] = [
		[12, 0.9, 'c'],
		[42, 1, 'b'],
		[72, 1.15, 'c'],
		[104, 0.8, 'b'],
		[134, 1, 'c'],
		[166, 1.2, 'b'],
		[198, 0.95, 'c'],
		[228, 1.05, 'b'],
		[258, 1.2, 'c'],
		[292, 0.9, 'b'],
		[322, 1.1, 'c'],
		[350, 0.85, 'b']
	];
	const PENNANTS = Array.from({ length: 16 }, (_, i) => ({ x: 24 + i * 21, color: ['#dd8258', '#f1b34c', '#768641', '#32596f'][i % 4] }));
</script>

<div class="scene" class:coffee class:waving bind:this={box}>
	<!-- Himmel am Abend: wärmer, je weiter die Suche ist -->
	<div class="dusk" style:opacity={fraction}></div>
	<svg bind:this={svg} viewBox="0 0 {width} {height}" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
		<defs>
			<path id="rl-far" d="M0 118 Q45 92 90 110 T180 106 T270 112 T360 118 V176 H0 Z" />
			<path id="rl-mid" d="M0 140 Q60 116 120 134 T240 128 T360 140 V176 H0 Z" />
			<g id="rl-clouds" fill="#fdfbf5" opacity="0.85">
				<g transform="translate(60 38)">
					<ellipse rx="26" ry="9" />
					<ellipse cx="-12" cy="-6" rx="14" ry="9" />
					<ellipse cx="9" cy="-9" rx="16" ry="10" />
				</g>
				<g transform="translate(240 56) scale(0.8)">
					<ellipse rx="26" ry="9" />
					<ellipse cx="-12" cy="-6" rx="14" ry="9" />
					<ellipse cx="9" cy="-9" rx="16" ry="10" />
				</g>
				<g transform="translate(150 -34) scale(1.2)">
					<ellipse rx="26" ry="9" />
					<ellipse cx="-12" cy="-6" rx="14" ry="9" />
					<ellipse cx="9" cy="-9" rx="16" ry="10" />
				</g>
				<g transform="translate(330 -96) scale(0.9)">
					<ellipse rx="26" ry="9" />
					<ellipse cx="-12" cy="-6" rx="14" ry="9" />
					<ellipse cx="9" cy="-9" rx="16" ry="10" />
				</g>
			</g>

			<!-- Bausteine der Landschaften -->
			<g id="rl-broad">
				<rect x="-2" y="-14" width="4" height="16" fill="#7a6a45" />
				<circle cx="0" cy="-26" r="14" fill="#4f7a3e" />
				<circle cx="-9" cy="-18" r="9" fill="#4f7a3e" />
				<circle cx="9" cy="-18" r="9" fill="#4f7a3e" />
			</g>
			<g id="rl-broad2">
				<rect x="-2" y="-14" width="4" height="16" fill="#7a6a45" />
				<circle cx="0" cy="-26" r="14" fill="#5d8a47" />
				<circle cx="-9" cy="-18" r="9" fill="#5d8a47" />
				<circle cx="9" cy="-18" r="9" fill="#5d8a47" />
			</g>
			<g id="rl-conifer">
				<rect x="-1.5" y="-4" width="3" height="6" fill="#7a6a45" />
				<path d="M0 -50 L11 -26 L-11 -26 Z M0 -38 L14 -12 L-14 -12 Z M0 -24 L17 2 L-17 2 Z" fill="#2f5236" />
			</g>

			<!-- Felder: Getreide- und Wiesenstreifen, einzelne Bäume -->
			<g id="rl-s-fields">
				<g transform="translate(14 148)">
					<path d="M0 16 L84 16 L74 0 L10 0 Z" fill="#e3cf8c" />
					<path d="M16 0 L12 16 M32 0 L30 16 M48 0 L48 16 M64 0 L66 16" stroke="#c9b062" stroke-width="1.6" />
				</g>
				<g transform="translate(150 150)">
					<path d="M0 14 L70 14 L62 0 L8 0 Z" fill="#a9c36e" />
					<path d="M14 0 L10 14 M28 0 L26 14 M42 0 L42 14 M54 0 L56 14" stroke="#8fae58" stroke-width="1.6" />
				</g>
				<g transform="translate(250 148)">
					<path d="M0 16 L80 16 L70 0 L10 0 Z" fill="#e8d596" />
					<path d="M16 0 L12 16 M32 0 L30 16 M48 0 L48 16 M62 0 L64 16" stroke="#c9b062" stroke-width="1.6" />
				</g>
				<use href="#rl-broad" transform="translate(34 164)" />
				<use href="#rl-broad2" transform="translate(118 164) scale(0.75)" />
				<use href="#rl-conifer" transform="translate(206 164)" />
				<use href="#rl-broad" transform="translate(300 164) scale(0.9)" />
			</g>

			<!-- Wald: dicht an dicht -->
			<g id="rl-s-forest">
				{#each FOREST_TREES as [x, s, kind] (x)}
					<use href={kind === 'c' ? '#rl-conifer' : x % 2 ? '#rl-broad' : '#rl-broad2'} transform="translate({x} 164) scale({s})" />
				{/each}
			</g>

			<!-- See mit Schilf, Ente und Spiegelungen -->
			<g id="rl-s-lake">
				<ellipse cx="150" cy="158" rx="136" ry="11" fill="#8db7cb" />
				<ellipse cx="150" cy="156" rx="122" ry="7.5" fill="#a6cbdb" />
				<path d="M70 156h24M128 159h34M196 155h22M104 153h14" stroke="#fdfbf5" stroke-width="1.8" opacity="0.7" stroke-linecap="round" />
				<g stroke="#6f8b45" stroke-width="2" stroke-linecap="round">
					<path d="M22 164v-16M27 164v-20M32 164v-14M280 164v-15M285 164v-19M290 164v-13" />
				</g>
				<g fill="#7a5a3c">
					<ellipse cx="27" cy="143.5" rx="2" ry="4" />
					<ellipse cx="285" cy="144.5" rx="2" ry="4" />
				</g>
				<g transform="translate(176 157)">
					<ellipse rx="6.5" ry="3.6" fill="#f7f2e5" />
					<circle cx="5" cy="-3.4" r="2.5" fill="#f7f2e5" />
					<path d="M7.2 -3.4l3.2 .9-3.2 .9z" fill="#f1b34c" />
				</g>
				<use href="#rl-broad" transform="translate(326 164) scale(0.9)" />
				<use href="#rl-conifer" transform="translate(8 164) scale(0.8)" />
			</g>

			<!-- Dorf: Häuser mit roten Dächern und ein Kirchturm -->
			<g id="rl-s-village">
				{#each [40, 118, 262, 330] as x (x)}
					<g transform="translate({x} 164)">
						<rect x="-15" y="-21" width="30" height="21" fill="#f7f2e5" />
						<path d="M-18 -21 L0 -36 L18 -21Z" fill="#b0552f" />
						<rect x="-3.5" y="-12" width="7" height="12" fill="#7a6a45" />
						<rect x="7" y="-17" width="6" height="6" fill="#afc6d1" />
						<rect x="-13" y="-17" width="6" height="6" fill="#afc6d1" />
					</g>
				{/each}
				<g transform="translate(192 164)">
					<rect x="-16" y="-20" width="32" height="20" fill="#efe6cf" />
					<rect x="-7" y="-52" width="14" height="32" fill="#efe6cf" />
					<path d="M-9 -52 L0 -74 L9 -52Z" fill="#8e4425" />
					<path d="M0 -74v-8M-3 -79h6" stroke="#f1b34c" stroke-width="1.6" />
					<path d="M-3 -34h6v9h-6z" fill="#6c8a9b" />
					<rect x="-4" y="-12" width="8" height="12" fill="#7a6a45" />
				</g>
				<use href="#rl-broad2" transform="translate(80 164) scale(0.7)" />
				<use href="#rl-broad" transform="translate(300 164) scale(0.75)" />
			</g>

			<!-- Ziel: Wimpelkette am Straßenrand und eine Zielflagge -->
			<g id="rl-s-finish">
				{#each [24, 108, 192, 276] as x (x)}
					<rect x={x - 1.5} y="118" width="3" height="46" fill="#7a6a45" />
				{/each}
				<path d="M24 121 Q66 134 108 121 T192 121 T276 121" stroke="#7a6a45" stroke-width="1.4" fill="none" />
				{#each PENNANTS.slice(0, 13) as p (p.x)}
					<path d="M{p.x} {121 + 6.5 * Math.sin(((p.x - 24) / 84) * Math.PI)} l7 0 l-3.5 12 z" fill={p.color} />
				{/each}
				<g transform="translate(330 164)">
					<rect x="-1.5" y="-52" width="3" height="52" fill="#7a6a45" />
					<g transform="translate(1.5 -52)">
						{#each [0, 1, 2, 3, 4, 5] as i (i)}
							{#each [0, 1, 2] as j (j)}
								<rect x={i * 5} y={j * 5} width="5" height="5" fill={(i + j) % 2 ? '#243539' : '#f7f2e5'} />
							{/each}
						{/each}
					</g>
				</g>
				<use href="#rl-broad2" transform="translate(150 164) scale(0.8)" />
			</g>
		</defs>

		<g transform="translate(0 {top})">
			<!-- Sonne: sinkt mit dem Fortschritt, wird orange -->
			<g class="sun" style:transform="translate(0px, {fraction * 62}px)">
				<circle cx={width - 60} cy="44" r="19" fill="#f1b34c" />
				<circle cx={width - 60} cy="44" r="19" fill="#e98a4a" opacity={fraction} />
			</g>
			<g class="layer clouds">
				{#each copies as x (x)}<use href="#rl-clouds" {x} />{/each}
			</g>
			<g class="layer far" fill="#c5d3a4">
				{#each copies as x (x)}<use href="#rl-far" {x} />{/each}
			</g>
			<g class="layer mid" fill="#a4b975">
				{#each copies as x (x)}<use href="#rl-mid" {x} />{/each}
			</g>
			<rect y="164" {width} height="12" fill="#8fa55a" />
			{#each SCENES as kind (kind)}
				<g class="layer trees scenery" class:on={scene === kind}>
					{#each copies as x (x)}<use href="#rl-s-{kind}" {x} />{/each}
				</g>
			{/each}
			<rect y="170" {width} height="30" fill="#5b666a" />
			<line class="dashes" x1="-90" x2={width + 90} y1="193" y2="193" stroke="#f7f2e5" stroke-width="3" stroke-dasharray="40 40" stroke-linecap="round" />

			<!-- das E-Bike (Rahmen in Orange) mit Opi, in der Mitte der Fläche -->
			<g transform="translate({width / 2 - 152} 0)">
				<ellipse cx="152" cy="186" rx="104" ry="3.5" fill="#000" opacity="0.18" />
				<g class="bike">
					<!-- das ferne Bein hinter dem Rad -->
					<g fill="none" stroke-linecap="round" stroke-linejoin="round">
						<path stroke="#274655" stroke-width="11" d={leg(180)}>
							<animate attributeName="d" values={farLeg} dur="1.6s" repeatCount="indefinite" />
						</path>
						<path stroke="#1d2a2d" stroke-width="8" d={shoe(180)}>
							<animate attributeName="d" values={farShoe} dur="1.6s" repeatCount="indefinite" />
						</path>
					</g>
					<!-- Räder -->
					<g class="wheel" transform="translate(90 150)">
						<circle r="34" fill="none" stroke="#243539" stroke-width="5.5" />
						<g class="spin" stroke="#cfd8dc" stroke-width="1.4">
							<path d="M-31 0H31M0 -31V31M-22 -22L22 22M-22 22L22 -22" />
						</g>
						<circle r="4" fill="#243539" />
					</g>
					<g class="wheel" transform="translate(214 150)">
						<circle r="34" fill="none" stroke="#243539" stroke-width="5.5" />
						<g class="spin" stroke="#cfd8dc" stroke-width="1.4">
							<path d="M-31 0H31M0 -31V31M-22 -22L22 22M-22 22L22 -22" />
						</g>
						<circle r="4" fill="#243539" />
					</g>
					<!-- Rahmen -->
					<g fill="none" stroke="#b0552f" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
						<path d="M90 150L138 152" />
						<path d="M90 150L120 100" />
						<path d="M138 152L120 100" />
						<path d="M120 100L190 96" />
						<path d="M138 152L190 96" />
						<path d="M190 96L214 150" />
					</g>
					<!-- Akku am Unterrohr -->
					<rect x="146" y="116" width="34" height="11" rx="5" fill="#243539" transform="rotate(-48 163 121)" />
					<!-- Sattel und Lenker -->
					<path d="M120 100L117 88" stroke="#243539" stroke-width="5" stroke-linecap="round" />
					<path d="M104 86H132" stroke="#243539" stroke-width="7" stroke-linecap="round" />
					<path d="M190 96L186 78" stroke="#243539" stroke-width="5" stroke-linecap="round" />
					<path d="M172 76L196 78" stroke="#243539" stroke-width="6" stroke-linecap="round" />
					<!-- Kurbel -->
					<g transform="translate(138 152)">
						<g>
							<path d="M-12 -11L12 11" stroke="#243539" stroke-width="5" stroke-linecap="round" />
							<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.6s" repeatCount="indefinite" />
						</g>
						<circle r="7" fill="#f1b34c" stroke="#243539" stroke-width="2.5" />
					</g>
					<circle cx="190" cy="96" r="4" fill="#f1b34c" />

					<!-- Opi: Schal weht nach hinten -->
					<g class="scarf">
						<path d="M138 40C128 40 118 44 108 40C112 47 122 49 131 47Z" fill="#dd8258" />
						<path d="M108 40C100 38 94 41 88 38C91 45 99 47 106 45Z" fill="#dd8258" opacity="0.85" />
					</g>
					<!-- Oberkörper: Strickjacke in Olivgrün mit rundem Bäuchlein -->
					<g>
						<path d="M116 82L140 46" stroke="#768641" stroke-width="27" stroke-linecap="round" />
						<ellipse cx="132" cy="66" rx="18" ry="17" fill="#768641" />
						<path d="M126 52C130 62 132 72 128 82" stroke="#5f6e33" stroke-width="2" fill="none" stroke-linecap="round" />
						<circle cx="131" cy="62" r="1.8" fill="#283c30" />
						<circle cx="132" cy="71" r="1.8" fill="#283c30" />
						<path d="M134 40L146 44L140 50Z" fill="#f7f2e5" />
					</g>
					<!-- das nahe Bein vorn -->
					<g fill="none" stroke-linecap="round" stroke-linejoin="round">
						<path stroke="#32596f" stroke-width="12" d={leg(0)}>
							<animate attributeName="d" values={nearLeg} dur="1.6s" repeatCount="indefinite" />
						</path>
						<path stroke="#243539" stroke-width="9" d={shoe(0)}>
							<animate attributeName="d" values={nearShoe} dur="1.6s" repeatCount="indefinite" />
						</path>
					</g>
					<!-- Arm zum Lenker -->
					<path d="M142 48L166 62L186 77" stroke="#768641" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round" />
					<circle cx="188" cy="78" r="5.5" fill="#f1c9a5" />
					<!-- der andere Arm: winkt beim Wechsel der Landschaft -->
					<g class="gesture wave-arm">
						<g class="swing">
							<path d="M142 48L162 38L174 16" stroke="#768641" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round" />
							<circle cx="175.5" cy="13" r="5.5" fill="#f1c9a5" />
						</g>
					</g>
					<!-- … und trinkt bei der Kaffeepause einen Schluck -->
					<g class="gesture coffee-arm">
						<path d="M142 50L156 62L168 46" stroke="#768641" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round" />
						<circle cx="169.5" cy="43.5" r="5.5" fill="#f1c9a5" />
						<g transform="translate(172 36) rotate(-10)">
							<path d="M-7 0h14v9a7 7 0 0 1-7 7a7 7 0 0 1-7-7z" fill="#f7f2e5" />
							<path d="M-7 4h14" stroke="#afc6d1" stroke-width="3" />
							<path d="M7 3h3a3.2 3.2 0 0 1 0 6.4h-3" stroke="#f7f2e5" stroke-width="2" fill="none" />
							<ellipse cy="0.6" rx="7" ry="1.8" fill="#6b4a36" />
							<path class="steam" d="M-2 -4c-3 -4 3 -6 0 -10" stroke="#fdfbf5" stroke-width="1.8" fill="none" stroke-linecap="round" />
							<path class="steam late" d="M3 -4c-3 -4 3 -6 0 -10" stroke="#fdfbf5" stroke-width="1.8" fill="none" stroke-linecap="round" />
						</g>
					</g>
					<!-- Kopf (etwas größer als natürlich: Opi darf komisch aussehen) -->
					<g transform="translate(140 40) scale(1.18) translate(-140 -40)">
						<g class="tuft">
							<circle cx="136" cy="23" r="5.5" fill="#f7f2e5" stroke="#cfd8dc" stroke-width="0.8" />
							<circle cx="138" cy="30" r="4.5" fill="#f7f2e5" stroke="#cfd8dc" stroke-width="0.8" />
							<circle cx="132" cy="27" r="3.5" fill="#f7f2e5" stroke="#cfd8dc" stroke-width="0.8" />
						</g>
						<circle cx="148" cy="23" r="13" fill="#f1c9a5" />
						<circle cx="139.5" cy="25" r="3.2" fill="#e5b08a" />
						<!-- Schiebermütze -->
						<path d="M135 18C135 6 158 3 161 15C161 19 148 20 135 18Z" fill="#283c30" />
						<path d="M156 14L173 18L171 22L154 19Z" fill="#1e2f26" />
						<circle cx="148" cy="6.5" r="2" fill="#1e2f26" />
						<!-- Brille und Augenbraue -->
						<path d="M147 20L141 22" stroke="#243539" stroke-width="1.4" stroke-linecap="round" />
						<circle cx="152" cy="22" r="4.8" fill="#fff" fill-opacity="0.55" stroke="#243539" stroke-width="1.6" />
						<circle cx="153.2" cy="22.2" r="1.8" fill="#243539" />
						<path d="M147 16C150 13 155 13 158 15" stroke="#cfd8dc" stroke-width="2.6" fill="none" stroke-linecap="round" />
						<!-- Nase, Schnurrbart, Lächeln -->
						<ellipse cx="160.5" cy="26.5" rx="3.6" ry="3.2" fill="#e8a583" />
						<g class="mustache">
							<path d="M153 31C156 27 165 27 169 31C167 36 161 35 161 32.5C161 35 155 36 153 31Z" fill="#f7f2e5" stroke="#cfd8dc" stroke-width="0.8" />
						</g>
						<path d="M156 36.5Q161 40 166 36.5" stroke="#8a4b3a" stroke-width="1.4" fill="none" stroke-linecap="round" />
					</g>
				</g>
			</g>
		</g>
	</svg>

	<div class="overlay" class:tight={level >= 2} style:height="{roomAbove}px">
		<div class="top" bind:this={topEl}>
			<h2 class="title" class:quiet={level >= 3}>{title}</h2>

			<!-- die Wegstrecke der Suche: Stationen = Etappen, Fähnchen = fertig; darunter die Etappe und der Zähler -->
			<div class="progress">
				<div
					class="track"
					role="progressbar"
					aria-label="Fortschritt der Suche"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={Math.round(fraction * 100)}
				>
					<div class="fill" style:width="{Math.max(3, fraction * 100)}%"></div>
					{#each STATIONS as s (s)}
						<span class="station" class:done={fraction >= s} style:left="{s * 100}%"></span>
					{/each}
					<svg class="goal" viewBox="0 0 22 26" aria-hidden="true" focusable="false">
						<path d="M3 24V2" stroke="#283c30" stroke-width="2.4" stroke-linecap="round" />
						<path d="M3.5 3C9 0 12 6 18 3V13C12 16 9 10 3.5 13Z" fill={fraction >= 0.97 ? '#768641' : '#dd8258'} />
					</svg>
				</div>
				<p class="stage" role="status" class:quiet={level >= 4}>
					<span class="label">{label}</span>
					{#if requests > 0}<span class="count">{requests} Wege geprüft</span>{/if}
				</p>
				{#if long && level < 1}<p class="hint">Weite Strecke – das kann bis zu einer Minute dauern.</p>{/if}
			</div>
		</div>

		<!-- Platz für die Sprechblase (hochkant): gemessen wird die längste (Erklärung); die echte Blase sitzt unten in diesem Platz, direkt über Opi -->
		{#if !side}
			<div class="slot" bind:this={slotEl}>
				<div class="bubble ghost" aria-hidden="true">
					<p>{textOf(EXPLAIN)}</p>
				</div>
				{#if message}{#key messageKey}{@render speech()}{/key}{/if}
			</div>
		{/if}
	</div>

	<!-- breit: die Sprechblase links neben Opis Kopf, der Zipfel zeigt auf ihn -->
	{#if side && message}
		<div class="side-anchor" style:top="{Math.max(topH + 36, (top + 20) * scale - 40)}px" style:right="calc(50% + {22 * scale + 26}px)">
			{#key messageKey}{@render speech()}{/key}
		</div>
	{/if}
</div>

{#snippet speech()}
	<div class="bubble live" class:side role="status">
		<p>{#each message ?? [] as part}{#if typeof part === 'string'}{part}{:else}<em>{part.em}</em>{/if}{/each}</p>
		<svg class="tail" viewBox="0 0 40 26" aria-hidden="true" focusable="false"><path d="M0 0C11 0 17 11 23 26C27 13 33 4 40 0Z" /></svg>
	</div>
{/snippet}

<style>
	/* füllt die Fläche, die der Aufrufer gibt (der braucht position: relative und eine Höhe, z. B. flex: 1) */
	.scene {
		position: absolute;
		inset: 0;
		overflow: hidden;
		/* Himmel: Wasserblau, zum Horizont heller */
		background: linear-gradient(180deg, #afc6d1 0%, #cfdde4 45%, #f3efe2 100%);
	}

	/* Abendhimmel: legt sich mit dem Fortschritt weich über den blauen */
	.dusk {
		position: absolute;
		inset: 0;
		/* oben bleibt es blau, nur der Horizont glüht (Blau und Orange direkt gemischt würden grau) */
		background: linear-gradient(180deg, rgb(244 190 150 / 0) 0%, rgb(244 190 150 / 0) 38%, rgb(244 190 150 / 0.5) 72%, rgb(250 216 152 / 0.85) 100%);
		transition: opacity 2.5s ease;
	}

	.scene > svg {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}

	/* Überschrift, Fortschritt oben, Sprechblase unten – alles zwischen Oberkante und Opis Kopf */
	.overlay {
		position: absolute;
		inset: 0 0 auto 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 1rem 1rem 0.75rem;
		box-sizing: border-box;
		text-align: center;
		pointer-events: none;
	}

	.title {
		margin: 0;
		color: var(--color-green);
		font-family: var(--font-title);
		font-size: var(--text-h2);
		line-height: 1.2;
		text-wrap: balance;
	}

	.top {
		display: grid;
		justify-items: center;
		gap: 0.5rem;
		width: 100%;
	}

	.slot {
		position: relative;
		display: flex;
		justify-content: center;
		width: 100%;
	}

	/* nur für Vorlesegeräte sichtbar */
	.title.quiet,
	.stage.quiet {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	/* Wegstrecke: weiche, dunkelgrüne Spur auf dem Himmel, Füllung von Terrakotta zu Sonnengelb */
	.progress {
		display: grid;
		justify-items: center;
		gap: 0.375rem;
		width: min(30rem, 100%);
	}

	.track {
		position: relative;
		width: min(21rem, calc(100% - 1.5rem));
		height: 0.75rem;
		margin-right: 1.5rem;
		border-radius: 999px;
		background: rgb(40 60 48 / 0.16);
		box-shadow: inset 0 1px 3px rgb(40 60 48 / 0.18);
	}

	.fill {
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, #dd8258, #f1b34c);
		transition: width 0.9s ease;
	}

	.station {
		position: absolute;
		top: 50%;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: rgb(253 251 245 / 0.75);
		box-shadow: 0 0 0 2px rgb(40 60 48 / 0.18);
		transform: translate(-50%, -50%);
		transition: background 0.6s ease;
	}

	.station.done {
		background: #768641;
	}

	.goal {
		position: absolute;
		right: -1.75rem;
		bottom: -0.1rem;
		width: 1.375rem;
		height: 1.625rem;
	}

	.stage {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.125rem 0.75rem;
		margin: 0;
		color: var(--color-green);
		font-size: 1.0625rem;
		line-height: 1.3;
	}

	.label {
		font-weight: 700;
		white-space: nowrap;
	}

	.count {
		font-weight: 500;
		white-space: nowrap;
		opacity: 0.85;
	}

	.hint {
		margin: 0;
		color: var(--color-green);
		font-size: 1.0625rem;
		line-height: 1.3;
		opacity: 0.9;
	}

	/*
	 * Sprechblase: gehört zum Bild wie die Wolken – warmes Creme statt reinem Weiß, kein Rand, weicher bläulicher Schatten, Schrift in Taubenblau
	 * (6,6 : 1), das Wichtige in Terrakotta. Schwebt leicht über Opis Kopf; der Zipfel zeigt auf ihn.
	 */
	.bubble {
		position: relative;
		max-width: min(25rem, 100%);
		margin: 0 0 22px;
		padding: 0.875rem 1.375rem 1rem;
		border-radius: 2rem;
		background: linear-gradient(180deg, #fffdf8 0%, #f8f1e0 100%);
		box-shadow:
			0 10px 26px rgb(50 89 111 / 0.2),
			0 1px 0 rgb(255 255 255 / 0.9) inset;
		color: var(--color-text-muted);
		transform-origin: 50% 100%;
		animation:
			pop 0.4s ease-out,
			float 3.4s ease-in-out 0.4s infinite alternate;
	}

	.bubble p {
		margin: 0;
		font-family: var(--font-title);
		font-size: 1.125rem;
		font-weight: 500;
		line-height: 1.35;
		text-wrap: pretty;
		hyphens: none;
	}

	.bubble em {
		color: var(--color-orange-dark);
		font-style: normal;
		font-weight: 700;
	}

	/* die unsichtbare Blase hält nur den Platz frei; die echte sitzt unten in diesem Platz */
	.bubble.ghost {
		visibility: hidden;
		animation: none;
	}

	.slot .bubble.live {
		position: absolute;
		inset: auto 0 0;
		width: fit-content;
		margin: 0 auto 22px;
	}

	/* breit: Blase links neben dem Kopf; der Anker verschiebt sie mittig auf Kopfhöhe (der Blase selbst bleiben transform und translate für die Bewegung) */
	.side-anchor {
		position: absolute;
		max-width: min(26rem, 44%);
		pointer-events: none;
	}

	.side-anchor .bubble {
		margin: 0 24px 0 0;
		transform-origin: 100% 50%;
	}

	.bubble.side .tail {
		left: auto;
		right: -33px;
		bottom: auto;
		top: calc(50% - 13px);
		transform: rotate(-90deg);
	}

	/* Zipfel in der Farbe des unteren Blasenrands */
	.tail {
		position: absolute;
		left: calc(50% - 20px);
		bottom: -22px;
		width: 40px;
		height: 26px;
		fill: #f8f1e0;
		filter: drop-shadow(0 6px 5px rgb(50 89 111 / 0.14));
	}

	@media (max-height: 30rem) {
		.title {
			font-size: 1.375rem;
		}
	}

	.tight .bubble p {
		font-size: 1.0625rem;
		line-height: 1.25;
	}

	.tight .bubble {
		padding: 0.5rem 0.875rem 0.625rem;
	}

	@media (max-width: 24rem) {
		.overlay {
			padding-inline: 0.5rem;
		}
	}

	/* Hügel, Bäume und Straße ziehen nach links vorbei – je näher, desto schneller */
	.layer {
		animation: slide 20s linear infinite;
	}

	.layer.clouds {
		animation-duration: 60s;
	}

	.layer.mid {
		animation-duration: 11s;
	}

	.layer.trees {
		animation-duration: 4.2s;
	}

	/* die Landschaften überblenden sich weich */
	.scenery {
		opacity: 0;
		transition: opacity 1.6s ease;
	}

	.scenery.on {
		opacity: 1;
	}

	.sun {
		transition: transform 2.5s ease;
	}

	.dashes {
		animation: dash 0.75s linear infinite;
	}

	.spin {
		transform-box: fill-box;
		transform-origin: center;
		animation: turn 1.1s linear infinite;
	}

	.bike {
		animation: bob 0.55s ease-in-out infinite alternate;
	}

	/* Schal und Haarbüschel wehen im Fahrtwind */
	.scarf {
		transform-box: fill-box;
		transform-origin: right center;
		animation: flutter 0.32s ease-in-out infinite alternate;
	}

	.tuft {
		transform-box: fill-box;
		transform-origin: right center;
		animation: flutter 0.4s ease-in-out infinite alternate-reverse;
	}

	.mustache {
		transform-box: fill-box;
		transform-origin: left center;
		animation: wiggle 0.55s ease-in-out infinite alternate;
	}

	/* Gesten: der andere Arm erscheint zum Winken bzw. für den Kaffee */
	.gesture {
		opacity: 0;
		transition: opacity 0.25s ease;
	}

	.waving .wave-arm,
	.coffee .coffee-arm {
		opacity: 1;
	}

	.swing {
		transform-origin: 142px 48px;
	}

	.waving .swing {
		animation: wave 0.34s ease-in-out infinite alternate;
	}

	.steam {
		animation: steam 1.6s ease-out infinite;
	}

	.steam.late {
		animation-delay: 0.8s;
	}

	/* Kaffeepause: Opi hält an, alles steht still */
	.coffee .layer,
	.coffee .dashes,
	.coffee .spin,
	.coffee .bike,
	.coffee .scarf,
	.coffee .tuft,
	.coffee .mustache {
		animation-play-state: paused;
	}

	@keyframes slide {
		to {
			transform: translateX(-360px);
		}
	}

	@keyframes dash {
		to {
			stroke-dashoffset: -80;
		}
	}

	@keyframes turn {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes bob {
		to {
			transform: translateY(-1.5px);
		}
	}

	@keyframes flutter {
		from {
			transform: rotate(-7deg) skewY(-4deg);
		}
		to {
			transform: rotate(7deg) skewY(4deg);
		}
	}

	@keyframes wiggle {
		to {
			transform: translateY(1px) rotate(3deg);
		}
	}

	@keyframes wave {
		from {
			transform: rotate(-9deg);
		}
		to {
			transform: rotate(13deg);
		}
	}

	@keyframes steam {
		from {
			opacity: 0.9;
			transform: translateY(0);
		}
		to {
			opacity: 0;
			transform: translateY(-7px);
		}
	}

	@keyframes float {
		to {
			translate: 0 -4px;
		}
	}

	@keyframes pop {
		from {
			opacity: 0;
			transform: scale(0.85);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.layer,
		.dashes,
		.spin,
		.bike,
		.scarf,
		.tuft,
		.mustache,
		.swing,
		.steam,
		.bubble {
			animation: none;
		}

		.fill,
		.dusk,
		.sun,
		.scenery {
			transition: none;
		}
	}
</style>
