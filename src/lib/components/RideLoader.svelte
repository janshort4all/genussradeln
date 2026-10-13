<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * Wartebild (Jan, 14.10.2026; Neufassung 13.10.2026: „Fullscreen, ein witziger Opi radelt, nach 3 Sekunden erklärt er in einer Sprechblase,
	 * warum es bei uns länger dauert“): füllt die ganze Fläche zwischen der Zeile oben und der unteren Leiste. Ein E-Bike in unserem Orange fährt
	 * eine Landstraße entlang, Hügel, Bäume und Straße ziehen vorbei, die Räder drehen sich, Opi tritt in die Pedale (Beine über SMIL-Pfade,
	 * die zur Kurbel passen), Schal und Haarbüschel wehen. Die Szene wird je nach Fenstergröße neu aufgespannt (viewBox = Fläche in Einheiten),
	 * damit sie am Handy hoch und am PC breit ausgefüllt ist; das Rad bleibt dabei immer ganz im Bild.
	 * Nur Gestaltung – die Überschrift sagt, worauf gewartet wird. Bei „weniger Bewegung“ ein ruhiges Standbild.
	 */
	let {
		title,
		subtitle,
		/** nach so vielen Sekunden meldet sich Opi mit der Sprechblase */
		explainAfter = 3
	}: { title: string; subtitle?: string; explainAfter?: number } = $props();

	/** Was Opi sagt: erst die Erklärung (ab 3 s), dann – wenn es noch dauert – ein Trost (ab 11 s). Anrede „Sie“, kurz und mit einem Augenzwinkern. */
	const SAYINGS = [
		'Ja, das dauert. Andere Apps suchen den kürzesten Weg – ich suche Ihnen die schönsten. Gleich mehrere! Schönheit lässt sich nicht hetzen.',
		'Gleich geschafft! Ich trete schon, so fest ich kann. Der Akku ist voll, nur die Knie sind von gestern.'
	];

	let box: HTMLDivElement | undefined = $state();
	let svg: SVGSVGElement | undefined = $state();
	let w = $state(360);
	let h = $state(600);
	let stage = $state(0); // 0 = noch nichts, 1 = Erklärung, 2 = Trost

	/** Maßstab: das Rad (ca. 200 Einheiten breit, Opis Schal inbegriffen) soll gut vier Fünftel der Breite füllen, die Szene höchstens 60 % der Höhe, am PC nicht riesig werden */
	const scale = $derived(Math.max(0.6, Math.min(w / 235, (h * 0.6) / 200, 2.8)));
	const width = $derived(w / scale);
	const height = $derived(h / scale);
	const top = $derived(height - 200); // Oberkante der Szene (darüber ist Himmel)
	const copies = $derived(Array.from({ length: Math.ceil(width / 360) + 1 }, (_, i) => i * 360));
	/** Abstand der Köpfe von der Oberkante der Fläche (px): bis hierher reicht der Platz für Überschrift und Sprechblase */
	const roomAbove = $derived(Math.max(0, (top - 8) * scale));
	/**
	 * Reicht der Platz über Opis Kopf für Überschrift und Sprechblase zugleich? Grob geschätzt aus der Breite (Zeichen je Zeile).
	 * Wenn nicht, spricht nur Opi (die Überschrift bleibt für Vorlesegeräte).
	 */
	const need = $derived.by(() => {
		const charsPerBubbleLine = Math.max(14, (Math.min(416, w - 32) - 32) / 8.6);
		const bubbleLines = Math.ceil(SAYINGS[0].length / charsPerBubbleLine);
		const titleLines = Math.ceil((title.length * 15) / Math.max(200, w - 32));
		return titleLines * 35 + bubbleLines * 25 + 62;
	});
	const tight = $derived(roomAbove < need);

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
		window.addEventListener('resize', measure);
		const timers = [setTimeout(() => (stage = 1), explainAfter * 1000), setTimeout(() => (stage = 2), (explainAfter + 8) * 1000)];
		// SMIL (Beine, Kurbel) lässt sich nicht per CSS abschalten
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) svg?.pauseAnimations();
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', measure);
			timers.forEach(clearTimeout);
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
</script>

<div class="scene" bind:this={box}>
	<svg
		bind:this={svg}
		viewBox="0 0 {width} {height}"
		preserveAspectRatio="xMidYMax meet"
		aria-hidden="true"
		focusable="false"
	>
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
			<g id="rl-trees">
				<g transform="translate(34 164)">
					<rect x="-2" y="-14" width="4" height="16" fill="#7a6a45" />
					<circle cx="0" cy="-26" r="14" fill="#4f7a3e" />
					<circle cx="-9" cy="-18" r="9" fill="#4f7a3e" />
					<circle cx="9" cy="-18" r="9" fill="#4f7a3e" />
				</g>
				<g transform="translate(118 164) scale(0.75)">
					<rect x="-2" y="-14" width="4" height="16" fill="#7a6a45" />
					<circle cx="0" cy="-26" r="14" fill="#5d8a47" />
					<circle cx="-9" cy="-18" r="9" fill="#5d8a47" />
					<circle cx="9" cy="-18" r="9" fill="#5d8a47" />
				</g>
				<g transform="translate(206 164)">
					<rect x="-1.5" y="-4" width="3" height="6" fill="#7a6a45" />
					<path d="M0 -50 L11 -26 L-11 -26 Z M0 -38 L14 -12 L-14 -12 Z M0 -24 L17 2 L-17 2 Z" fill="#2f5236" />
				</g>
				<g transform="translate(296 164) scale(0.9)">
					<rect x="-2" y="-14" width="4" height="16" fill="#7a6a45" />
					<circle cx="0" cy="-26" r="14" fill="#4f7a3e" />
					<circle cx="-9" cy="-18" r="9" fill="#4f7a3e" />
					<circle cx="9" cy="-18" r="9" fill="#4f7a3e" />
				</g>
			</g>
		</defs>

		<g transform="translate(0 {top})">
			<circle cx={width - 60} cy="44" r="19" fill="#f1b34c" />
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
			<g class="layer trees">
				{#each copies as x (x)}<use href="#rl-trees" {x} />{/each}
			</g>
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

	<div class="overlay" class:tight style:height="{roomAbove}px">
		<h2 class="title" class:quiet={tight && stage > 0}>
			{title}<span class="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>
		</h2>
		{#if subtitle && stage === 0}<p class="subtitle">{subtitle}</p>{/if}
		{#if stage > 0}
			{#key stage}
				<p class="bubble" role="status">{SAYINGS[stage - 1]}</p>
			{/key}
		{/if}
	</div>
</div>

<style>
	/* füllt die Fläche, die der Aufrufer gibt (der braucht position: relative und eine Höhe, z. B. flex: 1) */
	.scene {
		position: absolute;
		inset: 0;
		overflow: hidden;
		/* Himmel: Wasserblau, zum Horizont heller */
		background: linear-gradient(180deg, #afc6d1 0%, #cfdde4 45%, #f3efe2 100%);
	}

	svg {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}

	/* Überschrift oben, Sprechblase unten – beides zwischen Oberkante und Opis Kopf */
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

	/* nur für Vorlesegeräte sichtbar */
	.title.quiet {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	.subtitle {
		margin: 0;
		color: var(--color-text);
		font-size: var(--text-large);
	}

	/* Sprechblase: heller Kasten mit Zipfel nach unten zu Opis Kopf; poppt kurz auf */
	.bubble {
		position: relative;
		max-width: min(26rem, 100%);
		margin: auto 0 14px;
		padding: 0.75rem 1rem;
		border: 2px solid var(--color-green);
		border-radius: 1.25rem;
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 1.125rem;
		line-height: 1.35;
		box-shadow: 0 4px 14px rgb(36 53 57 / 0.2);
		transform-origin: 50% 100%;
		animation: pop 0.35s ease-out;
	}

	.bubble::before,
	.bubble::after {
		content: '';
		position: absolute;
		left: 50%;
		border: 12px solid transparent;
		border-bottom: 0;
		transform: translateX(-50%);
	}

	.bubble::before {
		bottom: -14px;
		border-top-color: var(--color-green);
	}

	.bubble::after {
		bottom: -10.5px;
		border-top-color: var(--color-surface);
	}

	@media (max-height: 30rem) {
		.subtitle {
			display: none;
		}

		.title {
			font-size: 1.375rem;
		}
	}

	.tight .bubble {
		font-size: 1.0625rem;
		line-height: 1.3;
		padding: 0.5rem 0.75rem;
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

	@keyframes pop {
		from {
			opacity: 0;
			transform: scale(0.85);
		}
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
		.layer,
		.dashes,
		.spin,
		.bike,
		.scarf,
		.tuft,
		.mustache,
		.dots i,
		.bubble {
			animation: none;
		}
	}
</style>
