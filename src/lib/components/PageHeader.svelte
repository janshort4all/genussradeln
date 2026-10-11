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
		/** anderes Bild (Pfad unter static/), sonst das Titelbild */
		image?: string;
		/** großer Kopf (Eingabeseiten): höher, die erste Karte darunter ragt ins Bild */
		large?: boolean;
	}

	let { title, lead, backHref, backLabel, image = '/hero.jpg', large = false }: Props = $props();
</script>

<header class="page-header" class:large>
	<img class="photo" src={asset(image)} alt="" width="1200" height="600" />
	<div class="fade" aria-hidden="true"></div>
	{#if backHref}
		<div class="back"><BackLink href={backHref} label={backLabel} /></div>
	{/if}
	<div class="text">
		<h1>{title}</h1>
		{#if lead}<p>{lead}</p>{/if}
		{#if large}
			<svg class="stroke" viewBox="0 0 240 24" aria-hidden="true">
				<path d="M4 18 C 50 6, 130 6, 236 10" fill="none" stroke="#5f6e33" stroke-width="5" stroke-linecap="round" />
			</svg>
		{/if}
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

	/* großer Kopf: viel Bild, die Karte darunter schiebt sich über den unteren Rand (Entwurf von Jan, 10.10.2026) */
	.large {
		min-height: 17rem;
		padding-bottom: 4.25rem;
		margin-bottom: -3rem;
	}

	/* Foto nur in der rechten Hälfte, links weich ausgeblendet: Überschrift und Satz stehen auf ruhigem Grund,
	   die Gesichter der beiden bleiben frei (Marketing-Prüfung, 14.10.2026: Text lag auf den Radfahrern) */
	.large .photo {
		left: auto;
		right: 0;
		width: 82%;
		object-position: 82% 50%;
		-webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 40%);
		mask-image: linear-gradient(90deg, transparent 0%, #000 40%);
	}

	.large .fade {
		background: linear-gradient(0deg, rgb(247 242 229 / 0.55) 0%, rgb(247 242 229 / 0) 22%);
	}

	.large .text {
		max-width: 56%;
	}

	.large h1,
	.large p {
		text-wrap: balance;
	}

	.stroke {
		display: block;
		width: 7.5rem;
		height: 1.5rem;
		margin-top: 0.25rem;
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

		.large {
			min-height: 19rem;
			margin-bottom: -3.5rem;
		}

		.large .photo {
			object-position: 75% 50%;
			width: 70%;
		}

		.large .text {
			max-width: 46%;
		}
	}
</style>
