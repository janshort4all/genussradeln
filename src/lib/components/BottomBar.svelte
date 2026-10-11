<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Heart from '@lucide/svelte/icons/heart';
	import House from '@lucide/svelte/icons/house';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { area } from '$lib/tour/area.svelte';
	import { session } from '$lib/tour/session.svelte';

	/**
	 * Untere Leiste (Entscheidung Jan, 14.10.2026): die vier Hauptwege – Start, Ziel, Runde, Meine Touren. „Mehr“ sitzt als Zahnrad oben
	 * rechts auf jeder Seite (MoreLink). Jede Seite gehört zu genau einem Bereich, der hier markiert ist.
	 */
	type Area = 'start' | 'ziel' | 'runde' | 'meine-touren';

	const items: { id: Area; href: string; label: string; icon: typeof House }[] = [
		{ id: 'start', href: resolve('/'), label: 'Start', icon: House },
		{ id: 'ziel', href: resolve('/ziel'), label: 'Ziel', icon: MapPin },
		{ id: 'runde', href: resolve('/runde'), label: 'Runde', icon: RefreshCw },
		{ id: 'meine-touren', href: resolve('/meine-touren'), label: 'Meine\nTouren', icon: Heart }
	];

	/** Welcher Bereich zur aktuellen Seite gehört (Seiten unter „Mehr“ gehören zu keinem – dort ist das Zahnrad markiert) */
	const current = $derived.by((): Area | undefined => {
		const route = page.route.id ?? '/';
		const is = (p: string) => route === p || route.startsWith(`${p}/`);
		if (is('/ziel')) return 'ziel';
		if (is('/runde')) return 'runde';
		if (is('/meine-touren')) return 'meine-touren';
		if (is('/vorschlaege')) return session.request?.round ? 'runde' : 'ziel';
		// Tourdetail: der Bereich, aus dem man kam (setzt die Tour-Seite)
		if (is('/tour')) return area.tab ?? 'start';
		if (is('/mehr') || is('/planen') || is('/fahrten')) return undefined;
		return 'start';
	});
</script>

<nav class="bottom-bar" aria-label="Hauptbereiche">
	<ul>
		{#each items as item (item.id)}
			<li>
				<a href={item.href} aria-current={current === item.id ? 'page' : undefined}>
					<span class="icon-wrap">
						<item.icon size={26} strokeWidth={2} aria-hidden="true" />
					</span>
					<span class="label">{item.label}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style>
	.bottom-bar {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 10;
		background: var(--color-surface);
		border-top: 1px solid var(--color-border);
		box-shadow: 0 -4px 16px rgb(36 53 57 / 0.06);
		padding-bottom: env(safe-area-inset-bottom);
	}

	ul {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		max-width: var(--page-width);
		margin: 0 auto;
		padding: 0;
		list-style: none;
	}

	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: 0.125rem;
		min-height: var(--bottom-bar-height);
		padding: 0.375rem 0.125rem 0.5rem;
		color: var(--color-text-muted);
		font-size: var(--text-small);
		font-weight: 700;
		line-height: 1.15;
		text-align: center;
		text-decoration: none;
	}

	/* „Meine\nTouren“: zwei Zeilen, damit die Schrift bei vier Feldern groß genug bleibt */
	.label {
		white-space: pre-line;
	}

	.icon-wrap {
		display: grid;
		place-items: center;
		width: 3.5rem;
		height: 2rem;
		border-radius: 1rem;
	}

	a[aria-current='page'] {
		color: var(--color-green);
	}

	a[aria-current='page'] .icon-wrap {
		background: var(--color-green-light);
	}

	a:focus-visible {
		outline: 3px solid var(--color-orange);
		outline-offset: -3px;
	}
</style>
