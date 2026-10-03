<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	/** Untere Leiste: Tour finden / Meine Touren / Selbst planen */
	const items = [
		{ href: resolve('/'), label: 'Tour finden', icon: 'search' },
		{ href: resolve('/meine-touren'), label: 'Meine Touren', icon: 'heart' },
		{ href: resolve('/planen'), label: 'Selbst planen', icon: 'pin' }
	] as const;

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
			<li>
				<a href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
					<svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28">
						{#if item.icon === 'search'}
							<circle cx="11" cy="11" r="6.5" />
							<path d="M16 16 L20.5 20.5" />
						{:else if item.icon === 'heart'}
							<path
								d="M12 20 C5 15 3 11.5 3 8.5 A4.5 4.5 0 0 1 12 6.5 A4.5 4.5 0 0 1 21 8.5 C21 11.5 19 15 12 20 Z"
							/>
						{:else}
							<path d="M12 21 C12 21 5 14.5 5 9.5 A7 7 0 0 1 19 9.5 C19 14.5 12 21 12 21 Z" />
							<circle cx="12" cy="9.5" r="2.5" />
						{/if}
					</svg>
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
		padding: 0.5rem 0.25rem;
		color: var(--color-text-muted);
		font-size: var(--text-small);
		font-weight: 700;
		line-height: 1.2;
		text-align: center;
		text-decoration: none;
	}

	a[aria-current='page'] {
		color: var(--color-green);
		box-shadow: inset 0 4px 0 var(--color-green);
	}

	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	a[aria-current='page'] svg {
		fill: var(--color-green-light);
	}
</style>
