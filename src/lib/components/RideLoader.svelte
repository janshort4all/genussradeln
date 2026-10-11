<script lang="ts">
	/**
	 * Wartebild (Jan, 14.10.2026): ein großes E-Bike in unserem Orange fährt eine Landstraße entlang, Hügel, Bäume und Straße ziehen
	 * vorbei, die Räder drehen sich, die Kurbel läuft. Nur Gestaltung – der Text daneben sagt, worauf gewartet wird. Reine CSS-Animation
	 * (Transformationen, kein Neuzeichnen) und bei „weniger Bewegung“ ein ruhiges Standbild.
	 */
</script>

<svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
	<defs>
		<path id="far" d="M0 118 Q45 92 90 110 T180 106 T270 112 T360 118 V176 H0 Z" />
		<path id="mid" d="M0 140 Q60 116 120 134 T240 128 T360 140 V176 H0 Z" />
		<g id="clouds" fill="#fdfbf5">
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
		</g>
		<g id="trees">
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

	<circle cx="300" cy="44" r="19" fill="#f1b34c" />
	<g class="layer clouds">
		<use href="#clouds" />
		<use href="#clouds" x="360" />
	</g>
	<g class="layer far" fill="#c5d3a4">
		<use href="#far" />
		<use href="#far" x="360" />
	</g>
	<g class="layer mid" fill="#a4b975">
		<use href="#mid" />
		<use href="#mid" x="360" />
	</g>
	<rect y="164" width="360" height="12" fill="#8fa55a" />
	<g class="layer trees">
		<use href="#trees" />
		<use href="#trees" x="360" />
	</g>
	<rect y="170" width="360" height="30" fill="#5b666a" />
	<line class="dashes" x1="-90" x2="450" y1="193" y2="193" stroke="#f7f2e5" stroke-width="3" stroke-dasharray="40 40" stroke-linecap="round" />

	<!-- das E-Bike: Rahmen in Orange -->
	<g class="bike" transform="translate(28 0)">
		<ellipse cx="152" cy="186" rx="104" ry="3.5" fill="#000" opacity="0.18" />
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
		<!-- Kurbel mit Pedalen -->
		<g transform="translate(138 152)">
			<g class="crank">
				<path d="M0 0L0 0M-12 -11L12 11" stroke="#243539" stroke-width="5" stroke-linecap="round" />
				<rect x="-19" y="-14" width="14" height="5" rx="2.5" fill="#243539" />
				<rect x="5" y="9" width="14" height="5" rx="2.5" fill="#243539" />
			</g>
			<circle r="7" fill="#f1b34c" stroke="#243539" stroke-width="2.5" />
		</g>
		<circle cx="190" cy="96" r="4" fill="#f1b34c" />
	</g>
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: 100%;
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

	.spin,
	.crank {
		transform-box: fill-box;
		transform-origin: center;
		animation: turn 1.1s linear infinite;
	}

	.crank {
		animation-duration: 1.6s;
	}

	.bike {
		animation: bob 0.55s ease-in-out infinite alternate;
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
			transform: translate(28px, -1.5px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.layer,
		.dashes,
		.spin,
		.crank,
		.bike {
			animation: none;
		}
	}
</style>
