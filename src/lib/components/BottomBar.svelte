<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Heart from '@lucide/svelte/icons/heart';
	import MapPinPlus from '@lucide/svelte/icons/map-pin-plus';
	import Search from '@lucide/svelte/icons/search';

	/** Untere Leiste: Tour finden / Meine Touren / Selbst planen */
	const items = [
		{ href: resolve('/'), label: 'Tour finden', icon: Search },
		{ href: resolve('/meine-touren'), label: 'Meine Touren', icon: Heart },
		{ href: resolve('/planen'), label: 'Selbst planen', icon: MapPinPlus }
	];

	const home = resolve('/');

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === home) {
			// „Tour finden“ umfasst auch die Vorschläge und das Tourdetail
			return !items.some((item) => item.href !== home && path.startsWith(item.href));
		}
		return path.startsWith(href);
	}
</script>

<nav class="bottom-bar" aria-label="Hauptbereiche">
	<ul>
		{#each items as item (item.href)}
			{@const active = isActive(item.href)}
			<li>
				<a href={item.href} aria-current={active ? 'page' : undefined}>
					<span class="icon-wrap">
						<item.icon size={26} strokeWidth={2} aria-hidden="true" />
					</span>
					<span>{item.label}</span>
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
		box-shadow: 0 -4px 16px rgb(27 31 26 / 0.06);
		padding-bottom: env(safe-area-inset-bottom);
	}

	ul {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		max-width: var(--page-width);
		margin: 0 auto;
		padding: 0;
		list-style: none;
	}

	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.125rem;
		min-height: var(--bottom-bar-height);
		padding: 0.375rem 0.25rem 0.5rem;
		color: var(--color-text-muted);
		font-size: var(--text-small);
		font-weight: 700;
		line-height: 1.2;
		text-align: center;
		text-decoration: none;
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
</style>
