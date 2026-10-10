<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * Großer Knopf. `primary` = die eine hervorgehobene Hauptaktion pro Screen (orange),
	 * `secondary` = weitere Aktion (Rahmen). Mit `href` wird ein Link daraus.
	 * `dark` für die schwarze Navigationsansicht.
	 */
	interface Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'secondary' | 'brand';
		href?: string;
		dark?: boolean;
		/** Symbol links vom Text */
		icon?: LucideIcon;
		/** Symbol am rechten Rand (z. B. Pfeil „weiter“) */
		trailing?: LucideIcon;
		children: Snippet;
	}

	let {
		variant = 'secondary',
		href,
		dark = false,
		icon: Icon,
		trailing: Trailing,
		type = 'button',
		children,
		...rest
	}: Props = $props();
</script>

{#snippet content()}
	{#if Icon}
		<Icon size={24} strokeWidth={2.25} aria-hidden="true" />
	{/if}
	<span>{@render children()}</span>
	{#if Trailing}
		<span class="trailing" aria-hidden="true"><Trailing size={26} strokeWidth={2.5} /></span>
	{/if}
{/snippet}

{#if href}
	<a {href} class="button {variant}" class:dark>
		{@render content()}
	</a>
{:else}
	<button {type} class="button {variant}" class:dark {...rest}>
		{@render content()}
	</button>
{/if}

<style>
	.button {
		position: relative;
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

	.button :global(svg) {
		flex: none;
	}

	.primary {
		background: var(--color-orange);
		color: var(--color-surface);
		box-shadow: 0 3px 0 var(--color-orange-dark);
	}

	.primary:hover {
		background: var(--color-orange-dark);
	}

	.trailing {
		position: absolute;
		right: 1rem;
		display: grid;
		place-items: center;
	}

	/* Hauptaktion auf den Eingabeseiten: dunkelgrün wie „Tour starten“ (weiße Schrift 11 : 1) */
	.brand {
		background: var(--color-green);
		color: var(--color-surface);
		box-shadow: 0 3px 0 #18241d;
	}

	.brand:hover {
		background: #1d2c23;
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
		box-shadow: none;
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
