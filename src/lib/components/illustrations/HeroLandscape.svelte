<script lang="ts">
	/**
	 * Titelbild Start-Screen: Niederrhein mit Deich, Kopfweiden, Windmühle, Rhein und einem Radler.
	 * Reine Dekoration (aria-hidden), als SVG winzig und offline sofort da.
	 */
</script>

<svg
	class="hero"
	viewBox="0 0 400 190"
	preserveAspectRatio="xMidYMax slice"
	aria-hidden="true"
	focusable="false"
>
	<defs>
		<linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#DCEDE6" />
			<stop offset="1" stop-color="#F7F5EF" />
		</linearGradient>
		<linearGradient id="hero-water" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#8CC0D3" />
			<stop offset="1" stop-color="#5E9DB6" />
		</linearGradient>
	</defs>

	<!-- Himmel, Sonne, Wolken -->
	<rect width="400" height="190" fill="url(#hero-sky)" />
	<circle cx="318" cy="48" r="24" fill="#F4C76A" />
	<circle cx="318" cy="48" r="34" fill="#F4C76A" opacity="0.18" />
	<g fill="#FFFFFF" opacity="0.85">
		<ellipse cx="110" cy="40" rx="30" ry="8" />
		<ellipse cx="130" cy="34" rx="18" ry="8" />
		<ellipse cx="236" cy="62" rx="22" ry="6" />
	</g>

	<!-- Ferne Hügel und Pappelreihe -->
	<path d="M0 112 C60 98 120 102 180 106 S300 94 400 104 V190 H0Z" fill="#C6DCB4" />
	<g fill="#8DB580">
		<ellipse cx="236" cy="96" rx="4" ry="13" />
		<ellipse cx="246" cy="94" rx="4" ry="15" />
		<ellipse cx="256" cy="97" rx="4" ry="12" />
		<ellipse cx="266" cy="95" rx="4" ry="14" />
	</g>

	<!-- Windmühle -->
	<g transform="translate(76 70)">
		<path d="M-8 38 L8 38 L5 8 L-5 8 Z" fill="#7A6450" />
		<path d="M-6 9 Q0 1 6 9 Z" fill="#4A4D45" />
		<g stroke="#4A4D45" stroke-width="2" stroke-linecap="round">
			<line x1="0" y1="7" x2="13" y2="-9" />
			<line x1="0" y1="7" x2="-16" y2="-6" />
			<line x1="0" y1="7" x2="-13" y2="23" />
			<line x1="0" y1="7" x2="16" y2="20" />
		</g>
		<rect x="-2" y="26" width="4" height="12" fill="#4A4D45" />
	</g>

	<!-- Deich mit Radweg -->
	<path d="M0 132 C80 120 160 118 240 122 S360 128 400 124 V190 H0Z" fill="#8DB580" />
	<path d="M0 129 C80 117 160 115 240 119 S360 125 400 121" fill="none" stroke="#EDE5CC" stroke-width="4" />

	<!-- Kopfweiden -->
	{#each [{ x: 34, y: 128 }, { x: 326, y: 124 }, { x: 364, y: 125 }] as tree (tree.x)}
		<g transform="translate({tree.x} {tree.y})">
			<rect x="-3" y="-16" width="6" height="16" rx="2" fill="#6B5644" />
			<circle cx="-7" cy="-20" r="8" fill="#5E8F5A" />
			<circle cx="6" cy="-21" r="8" fill="#5E8F5A" />
			<circle cx="0" cy="-27" r="9" fill="#73A36B" />
		</g>
	{/each}

	<!-- Radler auf dem Deich -->
	<g transform="translate(196 104)" stroke-linecap="round" stroke-linejoin="round">
		<g fill="none" stroke="#1B1F1A" stroke-width="1.8">
			<circle cx="-9" cy="12" r="6.5" />
			<circle cx="11" cy="12" r="6.5" />
			<path d="M-9 12 L0 12 L-3 3 Z M0 12 L7 3 L-3 3 M7 3 L11 12 M5 0 L9 0" />
		</g>
		<path d="M-2 2 L1 -8 L6 -1" fill="none" stroke="#B93A0B" stroke-width="3.5" />
		<circle cx="2" cy="-12" r="3.2" fill="#B93A0B" />
	</g>

	<!-- Rhein -->
	<path d="M0 156 C100 146 220 152 400 144 V190 H0Z" fill="url(#hero-water)" />
	<g fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" opacity="0.65">
		<path d="M40 168 q8 -4 16 0 t16 0" />
		<path d="M170 162 q8 -4 16 0 t16 0" />
		<path d="M290 172 q8 -4 16 0 t16 0" />
		<path d="M330 156 q6 -3 12 0" />
	</g>
</svg>

<style>
	.hero {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
