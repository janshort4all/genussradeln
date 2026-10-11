<script lang="ts" module>
	/** Kleine gezeichnete Landschaften für die Auswahlkacheln (Länge der Runde, „Worauf haben Sie Lust?“) */
	export type SceneKind =
		| 'bench'
		| 'hills'
		| 'meadow'
		| 'forest'
		| 'river'
		| 'trail'
		| 'water'
		| 'woods'
		| 'fields';
</script>

<script lang="ts">
	/**
	 * Gezeichnete Landschaft in den Farben des Logos (Grüntöne, Wasserblau, Khaki, Sonnengelb). Rein schmückend –
	 * der Text der Kachel sagt dasselbe. Füllt den Platz, den sie bekommt (abgeschnitten, nicht verzerrt).
	 */
	let { kind }: { kind: SceneKind } = $props();
	const id = $props.id();

	const TRUNK = '#7a6a45';
	const LEAF = '#4f7a3e';
	const LEAF_DARK = '#2f5236';
</script>

{#snippet tree(x: number, y: number, s: number, c: string)}
	<g transform="translate({x} {y}) scale({s})">
		<rect x="-1.6" y="-4" width="3.2" height="10" fill={TRUNK} />
		<circle cx="0" cy="-13" r="10" fill={c} />
		<circle cx="-7" cy="-7" r="7.5" fill={c} />
		<circle cx="7" cy="-7" r="7.5" fill={c} />
	</g>
{/snippet}

{#snippet pine(x: number, y: number, s: number, c: string)}
	<g transform="translate({x} {y}) scale({s})">
		<rect x="-1.5" y="-2" width="3" height="8" fill={TRUNK} />
		<path d="M0 -30 L9 -14 L-9 -14 Z" fill={c} />
		<path d="M0 -22 L12 -4 L-12 -4 Z" fill={c} />
		<path d="M0 -14 L14 4 L-14 4 Z" fill={c} />
	</g>
{/snippet}

<svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
	<defs>
		<linearGradient id="{id}-sky" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#bcd5e0" />
			<stop offset="1" stop-color="#f6f0dc" />
		</linearGradient>
	</defs>
	<rect width="120" height="80" fill="url(#{id}-sky)" />

	{#if kind === 'bench'}
		<path d="M0 52 Q30 38 62 48 T120 44 V80 H0 Z" fill="#b3c486" />
		<path d="M0 60 Q40 52 120 58 V80 H0 Z" fill="#8fa55a" />
		<path d="M48 80 Q58 66 84 58 L96 58 Q72 68 72 80 Z" fill="#e4d2a0" />
		{@render tree(20, 62, 0.9, LEAF)}
		{@render tree(104, 56, 0.7, '#5d8a47')}
		<g transform="translate(40 66)">
			<rect x="0" y="0" width="18" height="3" fill="#8a6b3e" />
			<rect x="1" y="-5" width="16" height="2.5" fill="#8a6b3e" />
			<rect x="2" y="3" width="2" height="5" fill="#5b4527" />
			<rect x="14" y="3" width="2" height="5" fill="#5b4527" />
		</g>
	{:else if kind === 'hills'}
		<path d="M0 46 Q22 28 48 42 T96 34 T120 40 V80 H0 Z" fill="#b9c98e" />
		<path d="M0 56 Q30 40 64 54 T120 48 V80 H0 Z" fill="#8fa55a" />
		<path d="M0 66 Q40 56 120 64 V80 H0 Z" fill="#768641" />
		<path d="M30 80 Q50 66 70 62 L82 62 Q58 70 54 80 Z" fill="#e4d2a0" />
		{@render tree(18, 66, 0.8, LEAF)}
		{@render tree(100, 60, 0.7, '#5d8a47')}
	{:else if kind === 'meadow'}
		<path d="M0 40 Q30 30 60 38 T120 34 V80 H0 Z" fill="#b9c98e" />
		<rect y="44" width="120" height="36" fill="#d9c56d" />
		<path d="M0 52 H120 M0 60 H120 M0 68 H120 M0 76 H120" stroke="#c4ad4f" stroke-width="1.6" />
		<path d="M52 80 Q58 62 66 46 L72 46 Q66 64 74 80 Z" fill="#e8d9a8" />
		{@render tree(14, 52, 0.6, LEAF)}
		{@render tree(104, 50, 0.6, '#5d8a47')}
	{:else if kind === 'forest'}
		<rect y="30" width="120" height="50" fill="#5f8548" />
		<path d="M0 38 Q40 30 120 36 V80 H0 Z" fill="#4a7240" />
		{@render pine(16, 56, 0.9, LEAF_DARK)}
		{@render pine(34, 50, 0.8, LEAF)}
		{@render pine(92, 52, 0.85, LEAF_DARK)}
		{@render pine(108, 58, 0.9, LEAF)}
		<path d="M50 80 Q56 64 62 48 L68 48 Q66 64 78 80 Z" fill="#e4d2a0" />
		{@render pine(60, 46, 0.55, LEAF_DARK)}
	{:else if kind === 'river'}
		<path d="M0 44 Q30 32 60 42 T120 38 V80 H0 Z" fill="#b3c486" />
		<path d="M0 54 Q40 46 120 54 V80 H0 Z" fill="#8fa55a" />
		<path d="M44 42 Q60 56 52 66 T70 80 H90 Q76 68 82 58 Q84 48 62 42 Z" fill="#7fa9bd" />
		<path d="M56 48 Q66 56 60 64 T76 78" fill="none" stroke="#c4dbe5" stroke-width="1.6" stroke-linecap="round" />
		{@render tree(18, 62, 0.85, LEAF)}
		{@render tree(104, 60, 0.85, '#5d8a47')}
	{:else if kind === 'trail'}
		<path d="M0 40 Q26 22 54 38 T104 28 T120 34 V80 H0 Z" fill="#b9c98e" />
		<path d="M0 52 Q34 36 70 52 T120 46 V80 H0 Z" fill="#8fa55a" />
		<path d="M0 64 Q50 52 120 62 V80 H0 Z" fill="#768641" />
		<path d="M40 80 Q44 70 60 64 Q78 58 92 50 L98 52 Q84 62 68 68 Q56 72 56 80 Z" fill="#e4d2a0" />
		{@render tree(16, 62, 0.8, LEAF)}
		{@render tree(30, 58, 0.55, '#5d8a47')}
		{@render tree(104, 52, 0.6, LEAF)}
	{:else if kind === 'water'}
		<rect y="0" width="120" height="80" fill="url(#{id}-sky)" />
		<path d="M0 36 Q30 30 60 35 T120 33 V40 H0 Z" fill="#6f9a5a" />
		<rect y="38" width="120" height="42" fill="#7fa9bd" />
		<path d="M0 46 H120 M6 54 H114 M0 63 H120 M10 72 H110" stroke="#cfe2ea" stroke-width="1.4" stroke-opacity="0.8" stroke-dasharray="14 8" />
		<path d="M4 80 L8 54 M10 80 L12 58 M16 80 L22 56 M22 80 L24 62 M104 80 L100 58 M110 80 L112 52 M116 80 L118 60" stroke={LEAF_DARK} stroke-width="1.8" stroke-linecap="round" />
		<ellipse cx="14" cy="55" rx="2.2" ry="5" fill="#8a6b3e" />
		<ellipse cx="111" cy="52" rx="2.2" ry="5" fill="#8a6b3e" />
	{:else if kind === 'woods'}
		<rect width="120" height="80" fill="#bfd7a0" />
		<ellipse cx="62" cy="20" rx="38" ry="22" fill="#f7e9a8" opacity="0.7" />
		<rect y="50" width="120" height="30" fill="#6f9a5a" />
		{@render tree(10, 56, 1.3, LEAF_DARK)}
		{@render tree(32, 52, 1.1, LEAF)}
		{@render tree(100, 54, 1.25, LEAF_DARK)}
		{@render tree(116, 50, 1, LEAF)}
		<path d="M46 80 Q54 64 60 48 L66 48 Q66 64 80 80 Z" fill="#e4d2a0" />
		{@render tree(62, 52, 0.7, LEAF)}
	{:else if kind === 'fields'}
		<path d="M0 38 Q30 32 60 37 T120 35 V50 H0 Z" fill="#b3c486" />
		<!-- Dorf mit Kirchturm -->
		<g transform="translate(70 34)">
			<rect x="-3" y="-14" width="6" height="14" fill="#f7f2e5" />
			<path d="M-4 -14 L0 -24 L4 -14 Z" fill="#c9694a" />
			<rect x="8" y="-6" width="14" height="6" fill="#f7f2e5" />
			<path d="M7 -6 L15 -12 L23 -6 Z" fill="#c9694a" />
			<rect x="-20" y="-5" width="12" height="5" fill="#f7f2e5" />
			<path d="M-21 -5 L-14 -10 L-7 -5 Z" fill="#c9694a" />
		</g>
		<rect y="42" width="120" height="38" fill="#e6c565" />
		<path d="M0 50 H120 M0 58 H120 M0 66 H120 M0 74 H120" stroke="#d2a944" stroke-width="1.6" />
		<path d="M50 80 Q58 62 66 44 L72 44 Q66 64 76 80 Z" fill="#efe0b0" />
		{@render tree(12, 48, 0.7, LEAF)}
	{/if}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
