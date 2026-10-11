<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Lock from '@lucide/svelte/icons/lock';
	import MapPinPlus from '@lucide/svelte/icons/map-pin-plus';
	import Route from '@lucide/svelte/icons/route';
	import PageHeader from '$lib/components/PageHeader.svelte';
</script>

<svelte:head>
	<title>Genuss-Radeln – Mehr</title>
</svelte:head>

<PageHeader title="Mehr" lead="Weitere Funktionen und Hinweise." backHref={resolve('/')} backLabel="Zur Startseite" />

<ul class="list">
	<li>
		<a href={resolve('/planen')}>
			<span class="round-icon" aria-hidden="true"><MapPinPlus size={26} strokeWidth={2.25} /></span>
			<span class="text">
				<strong>Selbst planen</strong>
				<span>Eine Strecke selbst auf der Karte zusammenstellen.</span>
			</span>
			<ChevronRight size={26} strokeWidth={2.5} aria-hidden="true" />
		</a>
	</li>
	<li>
		<a href={resolve('/fahrten')}>
			<span class="round-icon" aria-hidden="true"><Route size={26} strokeWidth={2.25} /></span>
			<span class="text">
				<strong>Aufgezeichnete Fahrten</strong>
				<span>Ihre Testfahrten als Datei speichern oder verschicken.</span>
			</span>
			<ChevronRight size={26} strokeWidth={2.5} aria-hidden="true" />
		</a>
	</li>
</ul>

<section class="info sheet">
	<h2 class="section-title">
		<span class="round-icon" aria-hidden="true"><Lock size={24} strokeWidth={2.25} /></span>
		Ihre Daten bleiben bei Ihnen
	</h2>
	<p>
		Diese Testversion braucht kein Konto. Gemerkte Touren, Ihre Eingaben und aufgezeichnete Fahrten bleiben auf Ihrem Gerät. Wir
		sammeln keine Nutzungsdaten – eine aufgezeichnete Fahrt sehen wir nur, wenn Sie die Datei selbst verschicken.
	</p>
</section>

<style>
	.list {
		display: grid;
		gap: 0.75rem;
		margin: 0 0 2rem;
		padding: 0;
		list-style: none;
	}

	.list a {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		min-height: 4.5rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--color-border);
		border-radius: 1.5rem;
		background: var(--color-surface);
		box-shadow: 0 4px 14px rgb(36 53 57 / 0.1);
		color: var(--color-green);
		text-decoration: none;
	}

	.list a:hover {
		border-color: var(--color-green);
	}

	.list a:focus-visible {
		outline: 3px solid var(--color-orange);
		outline-offset: 2px;
	}

	.text {
		display: grid;
		flex: 1;
		gap: 0.125rem;
		color: var(--color-text);
	}

	.text strong {
		color: var(--color-green);
		font-size: var(--text-large);
	}

	.round-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 50%;
		background: var(--color-green-light);
		color: var(--color-green);
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.info {
		margin-bottom: 0;
	}

	.info p {
		margin: 0;
		color: var(--color-text-muted);
	}
</style>
