<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Settings from '@lucide/svelte/icons/settings';

	/**
	 * Zahnrad „Mehr“ (Selbst planen, Aufgezeichnete Fahrten, Datenschutz) – steht oben rechts auf jeder Seite, damit auch „Mehr“ immer
	 * zu sehen ist, obwohl die untere Leiste nur die vier Hauptwege zeigt (Jan, 14.10.2026). Auf den Seiten unter „Mehr“ ist es markiert.
	 */
	interface Props {
		/** kleiner Knopf (48 px) in einer Werkzeugzeile statt der runden weißen Scheibe (56 px) */
		compact?: boolean;
	}

	let { compact = false }: Props = $props();

	const moreSection = [resolve('/mehr'), resolve('/planen'), resolve('/fahrten')];
	const here = $derived(moreSection.some((p) => page.url.pathname.startsWith(p)));
</script>

<a
	class="more-link"
	class:compact
	class:here
	href={resolve('/mehr')}
	aria-label="Mehr und Einstellungen"
	aria-current={here ? 'page' : undefined}
>
	<Settings size={compact ? 26 : 28} strokeWidth={2.25} aria-hidden="true" />
</a>

<style>
	.more-link {
		display: grid;
		place-items: center;
		width: 3.5rem;
		height: 3.5rem;
		border: 2px solid transparent;
		border-radius: 50%;
		background: var(--color-surface);
		color: var(--color-green);
		box-shadow: 0 2px 8px rgb(36 53 57 / 0.25);
	}

	.more-link.compact {
		width: var(--tap);
		height: var(--tap);
		background: none;
		box-shadow: none;
	}

	.more-link.compact:hover {
		background: var(--color-green-light);
	}

	/* auf den Seiten unter „Mehr“: markiert, wie die aktive Fläche in der unteren Leiste */
	.more-link.here {
		border-color: var(--color-green);
		background: var(--color-green-light);
	}

	.more-link:focus-visible {
		outline: 3px solid var(--color-orange);
		outline-offset: 2px;
	}
</style>
