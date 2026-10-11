<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';

	/**
	 * Kopf eines Schritts auf den Eingabeseiten (Entwurf von Jan, 14.10.2026): Nummer in einer olivgrünen Scheibe, Symbol,
	 * Überschrift und darunter ein Satz, der erklärt, was zu tun ist.
	 */
	interface Props {
		number: number;
		icon: LucideIcon;
		title: string;
		/** Satz unter der Überschrift */
		hint?: string;
		/** für `aria-labelledby` des Abschnitts */
		id: string;
	}

	let { number, icon: Icon, title, hint, id }: Props = $props();
</script>

<div class="step">
	<span class="num" aria-hidden="true">{number}</span>
	<Icon class="icon" size={30} strokeWidth={2} aria-hidden="true" />
	<h2 {id}>{title}</h2>
	{#if hint}<p>{hint}</p>{/if}
</div>

<style>
	.step {
		display: grid;
		grid-template-columns: auto auto 1fr;
		align-items: center;
		gap: 0.25rem 0.75rem;
		margin: 0 0 0.875rem;
	}

	.num {
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		background: #5f6e33;
		color: #fff;
		font-size: var(--text-large);
		font-weight: 700;
	}

	.step :global(.icon) {
		color: var(--color-green);
	}

	h2 {
		margin: 0;
		font-size: var(--text-large);
		line-height: 1.2;
	}

	p {
		grid-column: 2 / -1;
		margin: 0;
		color: var(--color-text-muted);
	}
</style>
