<script lang="ts">
	import { asset } from '$app/paths';
	import BackLink from '$lib/components/BackLink.svelte';
	import MoreLink from '$lib/components/MoreLink.svelte';

	/**
	 * Kopf aller Seiten – überall gleich (Jan, 14.10.2026: „der Stil muss auf allen Seiten derselbe sein“; Vorbild ist die Seite „Eine schöne
	 * Runde drehen“, dazu das Ausfaden nach unten wie auf der Startseite): dasselbe Titelbild, dieselbe Höhe, Foto rechts und nach links und unten
	 * weich ausgeblendet, darauf Zurück-Weg, Zahnrad, Überschrift, ein Satz und der grüne Strich. Das erste Element unter dem Kopf ragt ein Stück
	 * ins Bild. Die Startseite hat ihre eigene, höhere Fassung (routes/+page.svelte) mit demselben Ausfaden.
	 */
	interface Props {
		title: string;
		/** ein Satz unter der Überschrift */
		lead?: string;
		/** sichtbarer Zurück-Weg (Pflicht auf jedem Screen außer der Startseite) */
		backHref?: string;
		backLabel?: string;
		/** anderes Titelbild (Pfad unter static/) – nur wenn die Seite ein eigenes Bild bekommen soll, Größe und Ausfaden bleiben gleich */
		image?: string;
		/** Bild zurückgenommen (blasser, weniger Farbe), damit das Wichtige darunter – z. B. die Karte – mehr im Blick steht */
		calm?: boolean;
	}

	let { title, lead, backHref, backLabel, image = '/teaser.jpg', calm = false }: Props = $props();
</script>

<header class="page-header">
	<img class="photo" class:calm src={asset(image)} alt="" width="1200" height="600" />
	<div class="fade" aria-hidden="true"></div>
	{#if backHref}
		<div class="back"><BackLink href={backHref} label={backLabel} /></div>
	{/if}
	<!-- „Mehr“: Zahnrad oben rechts auf jeder Seite (Jan, 14.10.2026) -->
	<div class="gear"><MoreLink /></div>
	<div class="text">
		<h1>{title}</h1>
		{#if lead}<p>{lead}</p>{/if}
		<svg class="stroke" viewBox="0 0 240 24" aria-hidden="true">
			<path d="M4 18 C 50 6, 130 6, 236 10" fill="none" stroke="#5f6e33" stroke-width="5" stroke-linecap="round" />
		</svg>
	</div>
</header>

<style>
	/* bis an den Fensterrand; die Karte darunter schiebt sich über den unteren Rand (Entwurf von Jan, 10.10.2026) */
	.page-header {
		position: relative;
		isolation: isolate;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		height: 18rem;
		margin: -0.5rem 0 -3rem;
		margin-inline: calc(-1 * var(--bleed, 1rem));
		padding: 0.25rem var(--bleed, 1rem) 4.25rem;
		overflow: hidden;
		background: var(--color-bg);
	}

	/* das erste Element unter dem Kopf liegt über dem Bild (sonst verdeckte der Kopf es) */
	:global(.page-header + *) {
		position: relative;
		z-index: 1;
	}

	.gear {
		position: absolute;
		top: 0.5rem;
		right: var(--bleed, 1rem);
		z-index: 2;
	}

	/* Foto nur in der rechten Hälfte, links weich ausgeblendet: Überschrift und Satz stehen auf ruhigem Grund,
	   die Gesichter der beiden bleiben frei */
	.photo {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: -2;
		width: 82%;
		height: 100%;
		object-fit: cover;
		object-position: 82% 50%;
		-webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 40%);
		mask-image: linear-gradient(90deg, transparent 0%, #000 40%);
	}

	.photo.calm {
		opacity: 0.7;
		filter: saturate(0.75);
	}

	/* nach unten in die Seitenfarbe ausblenden – wie auf der Startseite */
	.fade {
		position: absolute;
		inset: 0;
		z-index: -1;
		background: linear-gradient(0deg, var(--color-bg) 0%, rgb(247 242 229 / 0) 30%);
	}

	.text {
		max-width: 56%;
		margin-top: 0.5rem;
	}

	h1 {
		margin: 0 0 0.25rem;
		font-size: clamp(var(--text-h2), 7vw, 2.25rem);
		line-height: 1.1;
		text-wrap: balance;
	}

	p {
		margin: 0;
		color: var(--color-text);
		line-height: 1.35;
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
			height: 19rem;
			margin-bottom: -3.5rem;
		}

		.photo {
			object-position: 75% 50%;
			width: 70%;
		}

		.text {
			max-width: 46%;
		}

		h1 {
			font-size: clamp(2.25rem, 3.4vw, 2.75rem);
		}
	}
</style>
