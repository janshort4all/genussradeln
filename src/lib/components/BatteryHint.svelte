<script lang="ts">
	import { batteryText, type BatteryLevel } from '$lib/tour/sample';

	/** Akku-Einschätzung in Worten, mit Symbol – nie als Prozentzahl. */
	let { level }: { level: BatteryLevel } = $props();

	const filled = $derived(level === 'locker' ? 3 : level === 'knapp' ? 1 : 0);
</script>

<p class="battery-hint {level}">
	<svg aria-hidden="true" viewBox="0 0 28 16" width="32" height="18">
		<rect x="1" y="1" width="22" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2" />
		<rect x="24" y="5" width="3" height="6" rx="1" fill="currentColor" />
		{#each [0, 1, 2] as i (i)}
			{#if i < filled}
				<rect x={4 + i * 6.3} y="4" width="4.6" height="8" rx="1" fill="currentColor" />
			{/if}
		{/each}
	</svg>
	<span>{batteryText[level]}</span>
</p>

<style>
	.battery-hint {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0.375rem 0.875rem 0.375rem 0.625rem;
		border-radius: 999px;
		background: var(--color-green-light);
		font-weight: 700;
		color: var(--color-green);
	}

	.battery-hint.knapp,
	.battery-hint.voll-laden {
		background: var(--color-orange-light);
		color: var(--color-orange-dark);
	}
</style>
