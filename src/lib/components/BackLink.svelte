<script lang="ts">
	/** Sichtbarer Zurück-Weg oben auf jedem Screen. */
	interface Props {
		href: string;
		label?: string;
		dark?: boolean;
	}

	let { href, label = 'Zurück', dark = false }: Props = $props();
</script>

<a {href} class="back-link" class:dark>
	<svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
		<path
			d="M15 5 L8 12 L15 19"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
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
