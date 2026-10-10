<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Repeat from '@lucide/svelte/icons/repeat';
	import Route from '@lucide/svelte/icons/route';

	/**
	 * Ganz oben auf den Eingabeseiten: Was möchten Sie? Zwei große Felder – „Zu einem Ziel“ oder „Eine Runde“.
	 * Es sind echte Links (zwei Seiten), die Eingaben bleiben beim Wechsel erhalten (tour/draft.svelte.ts).
	 */
	const modes = [
		{ href: resolve('/'), label: 'Zu einem Ziel', hint: 'von A nach B', icon: Route },
		{ href: resolve('/runde'), label: 'Eine Runde', hint: 'einfach losradeln', icon: Repeat }
	];
	const onRound = $derived(page.url.pathname.replace(/\/$/, '').endsWith('/runde'));
</script>

<nav class="mode-switch" aria-label="Was möchten Sie?">
	{#each modes as mode, i (mode.href)}
		{@const current = i === 1 ? onRound : !onRound}
		<a href={mode.href} class:current aria-current={current ? 'page' : undefined}>
			<mode.icon size={28} strokeWidth={2.25} aria-hidden="true" />
			<span class="text">
				<strong>{mode.label}</strong>
				<span class="hint">{mode.hint}</span>
			</span>
		</a>
	{/each}
</nav>

<style>
	.mode-switch {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.375rem;
		margin: 0 0 1.5rem;
		padding: 0.375rem;
		border-radius: calc(var(--radius) + 0.375rem);
		background: var(--color-green-light);
	}

	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		min-height: 4.5rem;
		padding: 0.625rem 0.5rem;
		border-radius: var(--radius);
		color: var(--color-green);
		text-align: center;
		text-decoration: none;
		line-height: 1.2;
	}

	a:focus-visible {
		outline: 3px solid var(--color-orange);
		outline-offset: 2px;
	}

	a.current {
		background: var(--color-green);
		color: #fff;
	}

	.text {
		display: grid;
		gap: 0.125rem;
	}

	strong {
		font-size: var(--text-large);
	}

	.hint {
		font-size: var(--text-small);
		opacity: 0.9;
	}

	/* breite Fenster: Symbol neben dem Text */
	@media (min-width: 30rem) {
		a {
			flex-direction: row;
			gap: 0.75rem;
			text-align: left;
		}
	}
</style>
