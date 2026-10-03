<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';

	/** Sichtbarer Zurück-Weg oben auf jedem Screen. */
	interface Props {
		href: string;
		label?: string;
		dark?: boolean;
	}

	let { href, label = 'Zurück', dark = false }: Props = $props();
</script>

<a {href} class="back-link" class:dark>
	<ChevronLeft size={26} strokeWidth={2.5} aria-hidden="true" />
	<span>{label}</span>
</a>

<style>
	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		min-height: var(--tap);
		min-width: var(--tap);
		padding: 0.5rem 0.75rem 0.5rem 0.25rem;
		margin-left: -0.25rem;
		color: var(--color-green);
		font-weight: 700;
		text-decoration: none;
	}

	.back-link:hover span {
		text-decoration: underline;
	}

	.back-link.dark {
		color: var(--color-nav-text);
	}
</style>
