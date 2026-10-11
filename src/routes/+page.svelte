<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Settings from '@lucide/svelte/icons/settings';

	/**
	 * Startseite: Was möchten Sie tun? Zwei große Felder – „Zu einem Ziel“ oder „Eine Runde“ (Entwurf von Jan, 10.10.2026).
	 * Die Eingaben liegen auf eigenen Seiten (/ziel, /runde); Start und Ziel bleiben beim Wechsel erhalten (tour/draft.svelte.ts).
	 */
</script>

<svelte:head>
	<title>Genuss-Radeln – Was möchten Sie tun?</title>
</svelte:head>

<header class="hero">
	<img class="photo" src={asset('/hero.jpg')} alt="" width="1200" height="600" fetchpriority="high" />
	<div class="fade" aria-hidden="true"></div>
	<img class="wordmark" src={asset('/wordmark.png')} alt="Genuss-Radeln" width="480" height="247" />
	<a class="settings" href={resolve('/mehr')} aria-label="Mehr und Einstellungen">
		<Settings size={28} strokeWidth={2.25} aria-hidden="true" />
	</a>
	<div class="welcome">
		<h1>Schön, dass Sie da sind!</h1>
		<p>Entdecken Sie die schönsten Radrouten in Ihrer Region.</p>
		<svg class="stroke" viewBox="0 0 240 24" aria-hidden="true">
			<path d="M4 18 C 50 6, 130 6, 236 10" fill="none" stroke="#5f6e33" stroke-width="5" stroke-linecap="round" />
		</svg>
	</div>
</header>

<section aria-labelledby="choose">
	<h2 id="choose">Was möchten Sie tun?</h2>

	<ul class="cards">
		<li>
			<a class="card goal" href={resolve('/ziel')}>
				<svg class="art" viewBox="0 0 96 96" aria-hidden="true">
					<g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M30 14c-9 0-16 7-16 16 0 12 16 28 16 28s16-16 16-28c0-9-7-16-16-16z" />
						<circle cx="30" cy="30" r="5.5" />
						<path d="M64 8c-8 0-14 6-14 14 0 10 14 24 14 24s14-14 14-24c0-8-6-14-14-14z" />
						<circle cx="64" cy="22" r="4.5" />
						<path d="M52 56c10 0 12 10 26 8" stroke-dasharray="1 9" />
						<path d="M16 78c10 0 12-8 22-8" stroke-dasharray="1 9" />
					</g>
					<circle cx="16" cy="78" r="5" fill="#fff" />
					<circle cx="80" cy="64" r="5" fill="#fff" />
				</svg>
				<span class="text">
					<strong>Zu einem Ziel</strong>
					<span>Sie sagen, wohin – wir finden den schönsten Weg.</span>
				</span>
				<span class="go" aria-hidden="true"><ChevronRight size={30} strokeWidth={3} /></span>
			</a>
		</li>
		<li>
			<a class="card round" href={resolve('/runde')}>
				<svg class="art" viewBox="0 0 96 96" aria-hidden="true">
					<g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M30 18c10-8 26-6 34 4" />
						<path d="M58 14l8 9-11 3" />
						<path d="M70 62c-6 12-22 18-36 10" />
						<path d="M38 82l-9-8 11-4" />
					</g>
					<g fill="#e8ebd6">
						<path d="M16 30l-11 22h7L7 66h18l-5-14h7z" />
						<rect x="14" y="66" width="4" height="9" />
						<path d="M82 24l-10 20h6L69 58h17l-4-14h6z" />
						<rect x="76" y="58" width="4" height="8" />
					</g>
				</svg>
				<span class="text">
					<strong>Eine schöne Runde drehen</strong>
					<span>Schöne Rundtouren ab Ihrer Haustür.</span>
				</span>
				<span class="go" aria-hidden="true"><ChevronRight size={30} strokeWidth={3} /></span>
			</a>
		</li>
	</ul>
</section>

<style>
	/* Titelbild über die ganze Breite (bis an den Rand), Text links auf aufgehelltem Himmel und Wasser */
	.hero {
		position: relative;
		isolation: isolate;
		height: clamp(19rem, 60vw, 24rem);
		margin: -0.5rem -1rem 1.5rem;
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
		/* die beiden Radfahrer stehen rechts im Bild – sie bleiben sichtbar, auch wenn das Bild beschnitten wird */
		object-position: 100% 50%;
	}

	/* links in die Seitenfarbe ausblenden: Schrift bleibt gut lesbar (Kontrast ≥ 4,5 : 1) */
	.fade {
		position: absolute;
		inset: 0;
		z-index: -1;
		background:
			linear-gradient(90deg, rgb(247 242 229 / 0.94) 0%, rgb(247 242 229 / 0.84) 38%, rgb(247 242 229 / 0) 72%),
			linear-gradient(0deg, var(--color-bg) 0%, rgb(247 242 229 / 0) 18%);
	}

	.wordmark {
		position: absolute;
		top: 0.875rem;
		left: 1rem;
		width: min(8.5rem, 36%);
		height: auto;
	}

	.settings {
		position: absolute;
		top: 0.875rem;
		right: 1rem;
		display: grid;
		place-items: center;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 50%;
		background: var(--color-surface);
		color: var(--color-green);
		box-shadow: 0 2px 8px rgb(36 53 57 / 0.25);
	}

	.settings:focus-visible {
		outline: 3px solid var(--color-orange);
		outline-offset: 2px;
	}

	.welcome {
		position: absolute;
		left: 1rem;
		right: 46%;
		bottom: 1.25rem;
	}

	h1 {
		margin: 0 0 0.5rem;
		font-size: clamp(var(--text-h2), 7.5vw, 2.5rem);
		line-height: 1.1;
	}

	.welcome p {
		margin: 0;
		color: var(--color-text);
		font-size: var(--text-base);
		line-height: 1.35;
	}

	.stroke {
		display: block;
		width: 7.5rem;
		height: 1.5rem;
		margin-top: 0.375rem;
	}

	h2 {
		margin: 0 0 1rem;
	}

	/* beide Felder immer gleich hoch und gleich aufgebaut (Jan, 14.10.2026: „ein Button ist größer als der andere – wirkt lieblos“) */
	.cards {
		display: grid;
		grid-auto-rows: 1fr;
		gap: 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* das Feld füllt seine Zeile ganz aus – dadurch sind beide gleich hoch */
	.cards > li {
		display: grid;
	}

	.card {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 7.5rem;
		padding: 1rem;
		border-radius: 1.5rem;
		overflow: hidden;
		text-decoration: none;
		box-shadow: 0 4px 14px rgb(36 53 57 / 0.16);
	}

	.card:focus-visible {
		outline: 3px solid var(--color-orange);
		outline-offset: 3px;
	}

	.art {
		flex: none;
		width: 4rem;
		height: 4rem;
	}

	.text {
		display: grid;
		flex: 1;
		gap: 0.25rem;
		min-width: 0;
		font-size: var(--text-base);
		line-height: 1.3;
		/* keine Silbentrennung mitten im Wort („einge-ben“ sah schlecht aus) */
		hyphens: manual;
		overflow-wrap: normal;
		text-wrap: pretty;
	}

	.text strong {
		font-family: var(--font-title);
		font-size: var(--text-h2);
		line-height: 1.15;
		text-wrap: balance;
	}

	.go {
		flex: none;
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: 0 1px 4px rgb(36 53 57 / 0.25);
	}

	/* „Zu einem Ziel“: dunkelgrün mit sanften Hügeln, weiße Schrift (11 : 1) */
	.goal {
		background:
			radial-gradient(120% 70% at 30% 120%, rgb(118 134 65 / 0.35) 0 55%, transparent 56%),
			radial-gradient(110% 80% at 90% 130%, rgb(118 134 65 / 0.28) 0 55%, transparent 56%),
			var(--color-green);
		color: #fff;
	}

	/* „Eine schöne Runde drehen“: Terrakotta wie jede Hauptaktion der App (weiße Schrift 5 : 1) – wärmer Gegenpol zum Dunkelgrün,
	   fällt sofort auf und ist nicht mit dem anderen Feld zu verwechseln */
	.round {
		background:
			radial-gradient(120% 60% at 80% 125%, rgb(255 255 255 / 0.14) 0 55%, transparent 56%),
			radial-gradient(100% 55% at 10% 130%, rgb(255 255 255 / 0.1) 0 55%, transparent 56%),
			var(--color-orange);
		color: #fff;
	}

	.round .go {
		color: var(--color-orange-dark);
	}

	/* ganz schmale Handys und große Systemschrift: Pfeil und Bild werden kleiner, der Text behält den Platz */
	@media (max-width: 24rem) {
		.art {
			width: 3.25rem;
			height: 3.25rem;
		}
	}

	/* größere Fenster: Titelbild mit runden Ecken innerhalb der Seite */
	@media (min-width: 40rem) {
		.hero {
			margin: 0.5rem 0 2rem;
			border-radius: 1.5rem;
		}

		.photo {
			object-position: 78% 50%;
		}

		.welcome {
			right: 45%;
		}
	}
</style>
