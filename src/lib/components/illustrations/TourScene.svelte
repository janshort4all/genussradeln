<script lang="ts" module>
	export type SceneKind = 'river' | 'lake' | 'forest' | 'fields';
</script>

<script lang="ts">
	/**
	 * Landschafts-Stimmung für Tourkarten und Tourdetail – passend zur Hauptlandschaft der Tour.
	 * Stil und Farben wie im Logo (Olivgrün-Hügel, Wasserblau, Sonnengelb, Creme). Reine Dekoration.
	 */
	let { kind }: { kind: SceneKind } = $props();

	// Eindeutige IDs je Instanz, weil mehrere Szenen auf einer Seite stehen
	const uid = $props.id();

	// Logo-Farben und Abstufungen
	const c = {
		sky: '#FBF8EF',
		cream: '#F7F2E5',
		sun: '#F1B34C',
		hillFar: '#B5BC7A',
		hillMid: '#919B4F',
		hill: '#768641',
		hillDark: '#5F6E33',
		water: '#AFC6D1',
		waterDeep: '#8FAFBE',
		path: '#E4D6B0',
		khaki: '#CEB37B',
		slate: '#243539',
		terracotta: '#DD8258'
	};
</script>

{#snippet poplar(x: number, y: number, h: number)}
	<ellipse cx={x} cy={y - h / 2} rx={h / 5} ry={h / 2} fill={c.hillMid} />
{/snippet}

{#snippet village(x: number, y: number)}
	<g transform="translate({x} {y})" fill={c.hillMid}>
		<path d="M0 0 V-12 L9 -20 L18 -12 V0 Z" />
		<path d="M20 0 V-16 H28 V-30 L32 -42 L36 -30 V-16 H44 V0 Z" />
		<path d="M46 0 V-10 L54 -17 L62 -10 V0 Z" />
	</g>
{/snippet}

<svg class="scene" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
	<defs>
		<linearGradient id="sky-{uid}" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color={c.sky} />
			<stop offset="1" stop-color={c.cream} />
		</linearGradient>
	</defs>
	<rect width="400" height="150" fill="url(#sky-{uid})" />

	{#if kind === 'river'}
		<circle cx="300" cy="38" r="20" fill={c.sun} />
		<path d="M0 86 C90 72 190 80 260 78 S360 70 400 74 V150 H0Z" fill={c.hillFar} />
		{@render village(200, 80)}
		{@render poplar(276, 80, 26)}
		{@render poplar(286, 79, 30)}
		<path d="M0 104 C110 88 250 96 400 86 V150 H0Z" fill={c.hillMid} />
		<path d="M0 101 C110 85 250 93 400 83" fill="none" stroke={c.path} stroke-width="4" />
		<path d="M0 118 C130 108 250 116 400 106 V150 H0Z" fill={c.water} />
		<path d="M0 140 C100 126 220 134 400 128 V150 H0Z" fill={c.hill} />
		<g fill="none" stroke={c.sky} stroke-width="2" stroke-linecap="round" opacity="0.8">
			<path d="M80 122 q8 -4 16 0 t16 0" />
			<path d="M240 116 q8 -4 16 0 t16 0" />
		</g>
	{:else if kind === 'lake'}
		<circle cx="262" cy="36" r="20" fill={c.sun} />
		<path d="M0 80 C80 66 160 74 230 72 S340 62 400 70 V150 H0Z" fill={c.hillFar} />
		{@render poplar(96, 76, 26)}
		{@render poplar(106, 75, 30)}
		{@render poplar(310, 70, 28)}
		<path d="M0 92 C90 84 300 86 400 90 V150 H0Z" fill={c.hillMid} />
		<ellipse cx="200" cy="114" rx="220" ry="26" fill={c.water} />
		<!-- Segelboot -->
		<g transform="translate(160 108)">
			<path d="M0 0 L0 -22 L14 0 Z" fill={c.sky} />
			<path d="M-10 2 L18 2 L14 8 L-6 8 Z" fill={c.terracotta} />
		</g>
		<g fill="none" stroke={c.sky} stroke-width="2" stroke-linecap="round" opacity="0.8">
			<path d="M236 116 q8 -4 16 0 t16 0" />
			<path d="M96 122 q8 -4 16 0" />
		</g>
		<path d="M0 140 C100 130 300 132 400 138 V150 H0Z" fill={c.hill} />
	{:else if kind === 'forest'}
		<path d="M0 70 C100 56 300 60 400 66 V150 H0Z" fill={c.hillFar} />
		<g fill={c.hillMid}>
			<circle cx="40" cy="70" r="24" />
			<circle cx="100" cy="64" r="28" />
			<circle cx="290" cy="64" r="28" />
			<circle cx="352" cy="70" r="24" />
		</g>
		<path d="M0 84 H400 V150 H0Z" fill={c.hill} />
		{#each [24, 72, 124, 276, 328, 380] as x, i (x)}
			<g transform="translate({x} {108 + (i % 2) * 6})">
				<rect x="-3" y="0" width="6" height="26" fill={c.slate} />
				<path d="M0 -44 L22 4 L-22 4 Z" fill={i % 2 ? c.hillDark : c.hill} />
				<path d="M0 -58 L16 -18 L-16 -18 Z" fill={i % 2 ? c.hillDark : c.hill} />
			</g>
		{/each}
		<!-- Waldweg -->
		<path
			d="M170 150 C180 126 214 118 200 98 C192 88 206 82 214 78 L226 78 C220 84 210 90 218 100 C236 122 214 132 230 150 Z"
			fill={c.path}
		/>
	{:else}
		<circle cx="280" cy="38" r="20" fill={c.sun} />
		<path d="M0 80 C100 70 260 76 400 70 V150 H0Z" fill={c.hillFar} />
		{@render village(120, 78)}
		<path d="M0 98 L400 86 V150 H0Z" fill={c.khaki} />
		<path d="M0 118 L400 104 V150 H0Z" fill={c.hillMid} />
		<path d="M0 136 L400 124 V150 H0Z" fill={c.hill} />
	{/if}
</svg>

<style>
	.scene {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
