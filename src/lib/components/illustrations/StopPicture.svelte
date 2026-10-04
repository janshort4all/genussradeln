<script lang="ts">
	import type { StopKind } from '$lib/stops/kinds';

	/**
	 * Kleine Zeichnung zu einem Stopp (statt Foto – Fotos gibt es nicht frei und verlässlich).
	 * Nur Logo-Farben. Rein schmückend, daher für Screenreader ausgeblendet.
	 */
	interface Props {
		kind: StopKind;
	}

	let { kind }: Props = $props();
</script>

<svg viewBox="0 0 120 90" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
	{#if kind === 'biergarten'}
		<rect width="120" height="90" fill="#FBECCC" />
		<circle cx="96" cy="20" r="11" fill="#F1B34C" />
		<rect x="0" y="62" width="120" height="28" fill="#CFD8B0" />
		<rect x="22" y="34" width="5" height="30" fill="#8E4425" />
		<circle cx="24" cy="30" r="17" fill="#768641" />
		<circle cx="36" cy="38" r="11" fill="#5F6E33" />
		<rect x="44" y="60" width="56" height="5" rx="2" fill="#8E4425" />
		<rect x="50" y="65" width="4" height="16" fill="#8E4425" />
		<rect x="90" y="65" width="4" height="16" fill="#8E4425" />
		<path d="M62 40 h16 v20 h-16 z" fill="#F1B34C" stroke="#283C30" stroke-width="2.5" stroke-linejoin="round" />
		<path d="M78 45 h5 a4 4 0 0 1 4 4 v3 a4 4 0 0 1 -4 4 h-5" fill="none" stroke="#283C30" stroke-width="2.5" />
		<path d="M60 40 q4 -7 10 -3 q6 -6 10 3 z" fill="#FDFBF5" stroke="#283C30" stroke-width="2" stroke-linejoin="round" />
	{:else if kind === 'eis'}
		<rect width="120" height="90" fill="#DFE8EC" />
		<circle cx="20" cy="18" r="10" fill="#F1B34C" />
		<rect x="0" y="72" width="120" height="18" fill="#CEB37B" />
		<path d="M48 44 L60 84 L72 44 Z" fill="#CEB37B" stroke="#8E4425" stroke-width="2.5" stroke-linejoin="round" />
		<path d="M52 50 l14 14 M56 46 l12 12 M68 50 l-14 14" stroke="#8E4425" stroke-width="1.5" />
		<circle cx="52" cy="40" r="10" fill="#DD8258" />
		<circle cx="68" cy="40" r="10" fill="#FDFBF5" stroke="#CEB37B" stroke-width="1.5" />
		<circle cx="60" cy="27" r="10" fill="#F1B34C" />
	{:else if kind === 'aussicht'}
		<rect width="120" height="90" fill="#DFE8EC" />
		<circle cx="88" cy="24" r="11" fill="#F1B34C" />
		<path d="M0 62 Q30 34 58 56 T120 48 V90 H0 Z" fill="#768641" />
		<path d="M0 74 Q40 58 70 72 T120 66 V90 H0 Z" fill="#5F6E33" />
		<path d="M0 84 Q60 74 120 82 V90 H0 Z" fill="#AFC6D1" />
	{:else}
		<!-- Café (und alles andere): Tasse mit Kuchen auf dem Tisch -->
		<rect width="120" height="90" fill="#F6E1D5" />
		<rect x="0" y="60" width="120" height="30" fill="#CEB37B" />
		<path d="M40 18 q-4 6 0 12 M50 16 q-4 6 0 12" fill="none" stroke="#B0552F" stroke-width="2.5" stroke-linecap="round" />
		<path d="M30 36 h30 v14 a12 12 0 0 1 -12 12 h-6 a12 12 0 0 1 -12 -12 z" fill="#FDFBF5" stroke="#283C30" stroke-width="2.5" stroke-linejoin="round" />
		<path d="M60 40 h4 a5 5 0 0 1 0 10 h-4" fill="none" stroke="#283C30" stroke-width="2.5" />
		<ellipse cx="45" cy="66" rx="22" ry="4" fill="#FDFBF5" stroke="#283C30" stroke-width="2" />
		<path d="M74 66 L102 66 L102 50 Z" fill="#F1B34C" stroke="#8E4425" stroke-width="2" stroke-linejoin="round" />
		<path d="M74 66 L102 50" stroke="#DD8258" stroke-width="5" stroke-linecap="round" />
	{/if}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
