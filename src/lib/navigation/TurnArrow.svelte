<script lang="ts">
	import type { ArrowKind } from './wording';

	/**
	 * Großer Abbiegepfeil für die Navigation. `rotate` dreht einen geraden Pfeil (z. B. „zurück zur Strecke“).
	 * Rein schmückend – der Text daneben sagt dasselbe.
	 */
	interface Props {
		kind: ArrowKind;
		rotate?: number;
		size?: number;
	}

	let { kind, rotate = 0, size = 96 }: Props = $props();

	/** Winkel des Pfeils nach der Abzweigung (Grad, 0 = geradeaus, negativ = links) */
	const ANGLE: Partial<Record<ArrowKind, number>> = {
		'slight-left': -45,
		'slight-right': 45,
		left: -90,
		right: 90,
		'sharp-left': -135,
		'sharp-right': 135,
		'keep-left': -30,
		'keep-right': 30
	};

	const angle = $derived(ANGLE[kind]);
	/** Ende des Pfeils: vom Knick (50, 52) aus in Richtung `angle` */
	const tip = $derived.by(() => {
		const a = ((angle ?? 0) * Math.PI) / 180;
		return { x: 50 + Math.sin(a) * 34, y: 52 - Math.cos(a) * 34, a: angle ?? 0 };
	});
</script>

<svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false" style:transform="rotate({rotate}deg)">
	{#if kind === 'finish'}
		<path d="M30 92 V12" stroke="currentColor" stroke-width="9" stroke-linecap="round" />
		<path d="M34 14 H78 L68 30 L78 46 H34 Z" fill="currentColor" />
	{:else if kind === 'roundabout'}
		<circle cx="50" cy="44" r="20" fill="none" stroke="currentColor" stroke-width="9" />
		<path d="M50 94 V64" stroke="currentColor" stroke-width="9" stroke-linecap="round" />
		<path d="M64 30 L84 12" stroke="currentColor" stroke-width="9" stroke-linecap="round" />
		<path d="M70 6 H90 V26 Z" fill="currentColor" />
	{:else if kind === 'uturn'}
		<path d="M66 92 V40 A16 16 0 0 0 34 40 V64" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" />
		<path d="M18 58 L34 84 L50 58 Z" fill="currentColor" />
	{:else if angle === undefined}
		<!-- geradeaus (auch „zurück zur Strecke“, dann gedreht) -->
		<path d="M50 94 V30" stroke="currentColor" stroke-width="10" stroke-linecap="round" />
		<path d="M28 36 L50 6 L72 36 Z" fill="currentColor" />
	{:else}
		<path
			d="M50 94 V52 L{tip.x} {tip.y}"
			fill="none"
			stroke="currentColor"
			stroke-width="10"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<path d="M-14 8 L0 -14 L14 8 Z" fill="currentColor" transform="translate({tip.x} {tip.y}) rotate({tip.a})" />
	{/if}
</svg>

<style>
	svg {
		flex: none;
	}
</style>
