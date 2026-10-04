<script lang="ts">
	import type { ElevationProfile } from '$lib/tour/elevation';

	/**
	 * Höhenprofil als einfache Kurve – ohne Höhenmeter-Zahlen, nur Start, Ziel und höchster Punkt.
	 * Mindestens MIN_RANGE_M Spanne, damit flache Wege auch flach aussehen.
	 */
	interface Props {
		profile: ElevationProfile;
		climb: string;
		/** bei Hin- und Rückweg: wo das Ziel liegt */
		destinationKm?: number;
		destinationName?: string;
	}

	let { profile, climb, destinationKm, destinationName }: Props = $props();

	const MIN_RANGE_M = 60;
	/** erst ab diesem Höhenunterschied lohnt es, einen „höchsten Punkt“ zu nennen */
	const HILL_M = 15;
	const W = 300;
	const H = 100;
	const TOP = 12;
	const BOTTOM = 96;

	const scale = $derived.by(() => {
		const span = profile.max - profile.min;
		const range = Math.max(MIN_RANGE_M, span);
		// flache Wege liegen im unteren Drittel – so wirken sie auch flach
		const base = profile.min - (range - span) * 0.25;
		return { base, range };
	});

	const x = (d: number) => (profile.total > 0 ? (d / profile.total) * W : 0);
	const y = (ele: number) => BOTTOM - ((ele - scale.base) / scale.range) * (BOTTOM - TOP);

	const line = $derived(profile.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)} ${y(p.ele).toFixed(1)}`).join(' '));
	const area = $derived(`${line} L${W} ${H} L0 ${H} Z`);
	const highestPct = $derived(profile.total ? (profile.highestAt / profile.total) * 100 : 0);
	const hasHill = $derived(profile.max - profile.min >= HILL_M);
	const destinationPct = $derived(destinationKm && profile.total ? ((destinationKm * 1000) / profile.total) * 100 : undefined);

	const km = (meters: number) => (meters / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 });
	const description = $derived(
		hasHill
			? `Höhenprofil: ${climb}. Der höchste Punkt liegt bei Kilometer ${km(profile.highestAt)} von ${km(profile.total)}.`
			: `Höhenprofil: ${climb}, praktisch ohne Höhenunterschied.`
	);
</script>

<figure class="elevation">
	<div class="chart" role="img" aria-label={description}>
		<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
			<path d={area} class="area" />
			<path d={line} class="line" vector-effect="non-scaling-stroke" />
		</svg>
		{#if destinationPct !== undefined}
			<span class="marker destination" style:left="{destinationPct}%" aria-hidden="true"></span>
		{/if}
		{#if hasHill}
			<span class="dot" style:left="{highestPct}%" style:top="{(y(profile.max) / H) * 100}%" aria-hidden="true"></span>
		{/if}
	</div>
	<div class="labels" aria-hidden="true">
		<span>Start</span>
		{#if destinationPct !== undefined}
			<span class="mid" style:left="{destinationPct}%">{destinationName ?? 'Ziel'}</span>
			<span>zurück</span>
		{:else}
			<span>Ziel</span>
		{/if}
	</div>
	<figcaption>
		<strong>Steigung: {climb}.</strong>
		{#if hasHill}
			Der höchste Punkt (●) liegt nach etwa {km(profile.highestAt)} km.
		{:else}
			Praktisch ohne Höhenunterschied.
		{/if}
	</figcaption>
</figure>

<style>
	.elevation {
		margin: 0;
	}

	.chart {
		position: relative;
		height: 6.5rem;
		border-bottom: 2px solid var(--color-border);
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.area {
		fill: var(--color-green-light);
	}

	.line {
		fill: none;
		stroke: var(--color-olive);
		stroke-width: 3;
		stroke-linejoin: round;
	}

	.dot {
		position: absolute;
		width: 0.875rem;
		height: 0.875rem;
		border-radius: 50%;
		background: var(--color-green);
		border: 2px solid var(--color-surface);
		translate: -50% -50%;
	}

	.marker.destination {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 0;
		border-left: 2px dashed var(--color-orange);
	}

	.labels {
		position: relative;
		display: flex;
		justify-content: space-between;
		min-height: 1.6em;
		margin-top: 0.25rem;
		color: var(--color-text-muted);
		font-size: var(--text-small);
	}

	.labels .mid {
		position: absolute;
		translate: -50% 0;
		max-width: 40%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-orange-dark);
		font-weight: 700;
	}

	figcaption {
		margin-top: 0.5rem;
	}
</style>
