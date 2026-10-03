<script lang="ts" module>
	export type SceneKind = 'river' | 'lake' | 'forest' | 'fields';
</script>

<script lang="ts">
	/**
	 * Landschafts-Stimmung für Tourkarten und Tourdetail – passend zur Hauptlandschaft der Tour.
	 * Reine Dekoration (aria-hidden).
	 */
	let { kind }: { kind: SceneKind } = $props();

	// Eindeutige IDs je Instanz, weil mehrere Szenen auf einer Seite stehen
	const uid = $props.id();
</script>

<svg class="scene" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
	<defs>
		<linearGradient id="sky-{uid}" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#D6EAE3" />
			<stop offset="1" stop-color="#F3F1E8" />
		</linearGradient>
		<linearGradient id="water-{uid}" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#93C4D6" />
			<stop offset="1" stop-color="#5E9DB6" />
		</linearGradient>
	</defs>
	<rect width="400" height="150" fill="url(#sky-{uid})" />

	{#if kind === 'river'}
		<circle cx="300" cy="40" r="18" fill="#F4C76A" />
		<path d="M0 84 C90 74 200 80 400 72 V150 H0Z" fill="#C6DCB4" />
		<g fill="#8DB580">
			<ellipse cx="210" cy="70" rx="5" ry="15" />
			<ellipse cx="222" cy="68" rx="5" ry="17" />
			<ellipse cx="234" cy="71" rx="5" ry="14" />
		</g>
		<!-- Kopfweide am Deich -->
		<g transform="translate(110 92)">
			<rect x="-3" y="-14" width="6" height="14" rx="2" fill="#6B5644" />
			<circle cx="-7" cy="-18" r="8" fill="#5E8F5A" />
			<circle cx="6" cy="-19" r="8" fill="#5E8F5A" />
			<circle cx="0" cy="-25" r="9" fill="#73A36B" />
		</g>
		<path d="M0 100 C120 90 260 94 400 88 V150 H0Z" fill="#8DB580" />
		<path d="M0 97 C120 87 260 91 400 85" fill="none" stroke="#EDE5CC" stroke-width="4" />
		<path d="M0 118 C140 110 260 116 400 108 V150 H0Z" fill="url(#water-{uid})" />
		<g fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" opacity="0.6">
			<path d="M60 134 q8 -4 16 0 t16 0" />
			<path d="M220 128 q8 -4 16 0 t16 0" />
			<path d="M320 140 q8 -4 16 0" />
		</g>
	{:else if kind === 'lake'}
		<circle cx="262" cy="38" r="18" fill="#F4C76A" />
		<path d="M0 78 C80 66 160 72 230 70 S340 62 400 70 V150 H0Z" fill="#9CC28B" />
		<g fill="#5E8F5A">
			<circle cx="30" cy="74" r="14" />
			<circle cx="82" cy="72" r="14" />
			<circle cx="104" cy="68" r="16" />
			<circle cx="300" cy="68" r="15" />
			<circle cx="322" cy="72" r="13" />
			<circle cx="378" cy="72" r="14" />
		</g>
		<ellipse cx="200" cy="112" rx="230" ry="34" fill="url(#water-{uid})" />
		<!-- Segelboot -->
		<g transform="translate(150 98)">
			<path d="M0 0 L0 -22 L14 0 Z" fill="#FFFFFF" />
			<path d="M-10 2 L18 2 L14 8 L-6 8 Z" fill="#B93A0B" />
		</g>
		<g fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" opacity="0.6">
			<path d="M230 118 q8 -4 16 0 t16 0" />
			<path d="M90 126 q8 -4 16 0" />
		</g>
		<path d="M0 138 C100 130 300 132 400 136 V150 H0Z" fill="#8DB580" />
	{:else if kind === 'forest'}
		<g fill="#9CC28B">
			<circle cx="20" cy="66" r="26" />
			<circle cx="70" cy="58" r="30" />
			<circle cx="130" cy="64" r="26" />
			<circle cx="260" cy="60" r="30" />
			<circle cx="320" cy="56" r="28" />
			<circle cx="380" cy="64" r="26" />
		</g>
		<path d="M0 74 H400 V150 H0Z" fill="#7BA672" />
		{#each [20, 66, 118, 282, 334, 386] as x, i (x)}
			<g transform="translate({x} {104 + (i % 2) * 6})">
				<rect x="-4" y="0" width="8" height="30" fill="#6B5644" />
				<path d="M0 -44 L22 4 L-22 4 Z" fill={i % 2 ? '#2F6B45' : '#3D7A50'} />
				<path d="M0 -58 L16 -18 L-16 -18 Z" fill={i % 2 ? '#2F6B45' : '#3D7A50'} />
			</g>
		{/each}
		<!-- Waldweg -->
		<path d="M170 150 C180 126 214 118 200 98 C192 88 206 82 214 78 L226 78 C220 84 210 90 218 100 C236 122 214 132 230 150 Z" fill="#E6D9B5" />
	{:else}
		<circle cx="280" cy="40" r="18" fill="#F4C76A" />
		<path d="M0 80 C100 70 260 76 400 70 V150 H0Z" fill="#C6DCB4" />
		<path d="M0 98 L400 86 V150 H0Z" fill="#E9D58E" />
		<path d="M0 118 L400 104 V150 H0Z" fill="#9CC28B" />
		<path d="M0 136 L400 124 V150 H0Z" fill="#7BA672" />
	{/if}
</svg>

<style>
	.scene {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
