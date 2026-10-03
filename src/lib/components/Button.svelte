<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * Großer Knopf. `primary` = die eine hervorgehobene Hauptaktion pro Screen (orange),
	 * `secondary` = weitere Aktion (Rahmen). Mit `href` wird ein Link daraus.
	 * `dark` für die schwarze Navigationsansicht.
	 */
	interface Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'secondary';
		href?: string;
		dark?: boolean;
		children: Snippet;
	}

	let {
		variant = 'secondary',
		href,
		dark = false,
		type = 'button',
		children,
		...rest
	}: Props = $props();
</script>

{#if href}
	<a {href} class="button {variant}" class:dark>
		{@render children()}
	</a>
{:else}
	<button {type} class="button {variant}" class:dark {...rest}>
		{@render children()}
	</button>
{/if}

<style>
	.button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 3.5rem;
		padding: 0.75rem 1.25rem;
		border-radius: var(--radius);
		border: 2px solid transparent;
		font-family: var(--font-text);
		font-size: var(--text-large);
		font-weight: 700;
		line-height: 1.25;
		text-align: center;
		text-decoration: none;
		cursor: pointer;
	}

	.primary {
		background: var(--color-orange);
		color: #ffffff;
	}

	.primary:hover {
		background: var(--color-orange-dark);
	}

	.secondary {
		background: var(--color-surface);
		color: var(--color-green);
		border-color: var(--color-green);
	}

	.secondary:hover {
		background: var(--color-green-light);
	}

	.primary.dark {
		background: var(--color-nav-orange);
		color: #000000;
	}

	.secondary.dark {
		background: var(--color-nav-surface);
		color: var(--color-nav-text);
		border-color: var(--color-nav-muted);
	}

	.button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
</style>
