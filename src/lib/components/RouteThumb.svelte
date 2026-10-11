<script lang="ts">
	import { boundsOf, distance, resample, type LngLat } from '$lib/geo/geo';

	/** Der Weg als kleine Zeichnung (ohne Karte) – so erkennt man auf einen Blick, wie er verläuft */
	interface Props {
		line: LngLat[];
		color: string;
	}

	let { line, color }: Props = $props();

	const SIZE = 64;
	const PAD = 7;

	const path = $derived.by(() => {
		if (line.length < 2) return '';
		const b = boundsOf([line]);
		// Längengrade sind weniger breit als Breitengrade – sonst wird die Form gestaucht
		const k = Math.cos((((b.north + b.south) / 2) * Math.PI) / 180);
		const width = (b.east - b.west) * k;
		const height = b.north - b.south;
		const scale = (SIZE - 2 * PAD) / Math.max(width, height, 1e-9);
		const left = (SIZE - width * scale) / 2;
		const top = (SIZE - height * scale) / 2;
		let total = 0;
		for (let i = 1; i < line.length; i++) total += distance(line[i - 1], line[i]);
		return resample(line, Math.max(20, total / 90))
			.map(([lon, lat], i) => `${i ? 'L' : 'M'}${(left + (lon - b.west) * k * scale).toFixed(1)} ${(top + (b.north - lat) * scale).toFixed(1)}`)
			.join('');
	});
</script>

<svg viewBox="0 0 {SIZE} {SIZE}" aria-hidden="true">
	<path d={path} fill="none" stroke={color} stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
