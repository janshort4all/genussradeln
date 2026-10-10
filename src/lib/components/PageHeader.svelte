<script lang="ts">
	import { asset } from '$app/paths';
	import BackLink from '$lib/components/BackLink.svelte';

	/**
	 * Kopf der Seiten im Stil der Startseite (Entwurf von Jan, 10.10.2026): schmaler Streifen mit dem Titelbild, links
	 * in die Seitenfarbe ausgeblendet, darauf Zurück-Weg, Überschrift und ein Satz. Die Startseite hat ihre eigene,
	 * größere Fassung (routes/+page.svelte).
	 */
	interface Props {
		title: string;
		/** ein Satz unter der Überschrift */
		lead?: string;
		/** sichtbarer Zurück-Weg (Pflicht auf jedem Screen außer der Startseite) */
		backHref?: string;
		backLabel?: string;
	}

	let { title, lead, backHref, backLabel }: Props = $props();
</script>

<header class="page-header">
	<img class="photo" src={asset('/hero.jpg')} alt="" width="1200" height="600" />
	<div class="fade" aria-hidden="true"></div>
	{#if backHref}
		<div class="back"><BackLink href={backHref} label={backLabel} /></div>
	{/if}
	<div class="text">
		<h1>{title}</h1>
		{#if lead}<p>{lead}</p>{/if}
	</div>
</header>

<style>
	/* bis an den Seitenrand wie auf der Startseite; auf größeren Fenstern innerhalb der Seite mit runden Ecken */
	.page-header {
		position: relative;
		isolation: isolate;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		min-height: 11.5rem;
		margin: -0.5rem -1rem 1.5rem;
		padding: 0.25rem 1rem 1rem;
		overflow: hidden;
		background: var(--color-bg);
	}

	.photo {
		position: absolute;
		inset: 0;
		z-index: -2;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 100% 45%;
	}

	/* links in die Seitenfarbe ausblenden: Schrift bleibt gut lesbar (Kontrast ≥ 4,5 : 1) */
	.fade {
		position: absolute;
		inset: 0;
		z-index: -1;
		background:
			linear-gradient(90deg, rgb(247 242 229 / 0.95) 0%, rgb(247 242 229 / 0.88) 45%, rgb(247 242 229 / 0) 85%),
			linear-gradient(0deg, var(--color-bg) 0%, rgb(247 242 229 / 0) 14%);
	}

	.text {
		max-width: 68%;
		margin-top: 0.5rem;
	}

	h1 {
		margin: 0 0 0.25rem;
		font-size: clamp(var(--text-h2), 7vw, 2.25rem);
		line-height: 1.1;
	}

	p {
		margin: 0;
		color: var(--color-text);
		line-height: 1.35;
	}

	@media (min-width: 40rem) {
		.page-header {
			margin: 0.5rem 0 1.75rem;
			border-radius: 1.5rem;
			min-height: 12.5rem;
		}

		.photo {
			object-position: 85% 45%;
		}

		.text {
			max-width: 60%;
		}
	}
</style>
