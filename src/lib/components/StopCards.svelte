<script lang="ts">
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import StopPicture from './illustrations/StopPicture.svelte';
	import { STOP_LABELS } from '$lib/stops/kinds';
	import type { ViewStop } from '$lib/tour/view';

	/**
	 * „Einkehren unterwegs“: wenige Stopps als Karten mit Zeichnung, Kilometer, Name und Art.
	 * Antippen der Karte zeigt den Ort auf der Karte; rechts daneben öffnet „Infos“ den Ort in der Karten-App des Handys
	 * (Öffnungszeiten, Fotos, Bewertungen – Jan, 14.10.2026: „man muss sich das Café ansehen können“). Das Öffnen schickt nichts von der App weg,
	 * erst die Karten-App sucht.
	 */
	interface Props {
		stops: ViewStop[];
		focusedId?: string;
		onfocus?: (id: string) => void;
	}

	let { stops, focusedId, onfocus }: Props = $props();

	const km = (value: number) => value.toLocaleString('de-DE', { maximumFractionDigits: 1 });

	/** „Am Wald · Biergarten“ – Lage (falls bekannt) und Art */
	function detail(stop: ViewStop): string {
		const where = stop.reasons?.[0];
		const parts = [where ? where.charAt(0).toUpperCase() + where.slice(1) : '', STOP_LABELS[stop.kind], stop.note ?? ''];
		return parts.filter(Boolean).join(' · ');
	}

	/** Suche nach dem Ort in der Karten-App: Name und Koordinaten, damit genau dieser gefunden wird */
	function infoLink(stop: ViewStop): string | undefined {
		if (!stop.lngLat) return undefined;
		const [lon, lat] = stop.lngLat;
		const query = [stop.name, `${lat.toFixed(5)},${lon.toFixed(5)}`].filter(Boolean).join(' ');
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
	}
</script>

<ul class="cards">
	{#each stops as stop (stop.id)}
		{#snippet content()}
			<span class="picture"><StopPicture kind={stop.kind} /></span>
			<span class="text">
				<span class="km">
					{#if stop.lngLat && onfocus}<MapPin size={16} strokeWidth={2.5} aria-hidden="true" />{/if}{km(stop.km)} km
				</span>
				<span class="name">{stop.name ?? STOP_LABELS[stop.kind]}</span>
				<span class="detail">{detail(stop)}</span>
			</span>
		{/snippet}
		<li class="stop" class:focused={stop.id === focusedId}>
			{#if stop.lngLat && onfocus}
				<button type="button" class="card" aria-pressed={stop.id === focusedId} onclick={() => onfocus(stop.id)}>
					{@render content()}
					<span class="visually-hidden">– auf der Karte zeigen</span>
				</button>
			{:else}
				<div class="card">{@render content()}</div>
			{/if}
			{#if infoLink(stop)}
				<a class="info" href={infoLink(stop)} target="_blank" rel="noopener noreferrer">
					<ExternalLink size={24} strokeWidth={2.25} aria-hidden="true" />
					<span>Infos</span>
					<span class="visually-hidden">zu {stop.name ?? STOP_LABELS[stop.kind]} in der Karten-App</span>
				</a>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.cards {
		display: grid;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* eine Karte: links Zeichnung und Angaben (zeigt auf der Karte), rechts „Infos“ */
	.stop {
		display: grid;
		grid-template-columns: 1fr auto;
		overflow: hidden;
		border: 2px solid var(--color-border);
		border-radius: 1rem;
		background: var(--color-surface);
	}

	.stop.focused {
		border-color: var(--color-green);
	}

	.card {
		display: grid;
		grid-template-columns: 6rem 1fr;
		align-items: center;
		gap: 0.875rem;
		width: 100%;
		min-height: 5.5rem;
		padding: 0.5rem 0.75rem 0.5rem 0.5rem;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		line-height: 1.3;
	}

	button.card {
		cursor: pointer;
	}

	button.card:hover {
		background: var(--color-green-light);
	}

	.picture {
		align-self: stretch;
		min-height: 4.5rem;
		border-radius: 0.625rem;
		overflow: hidden;
	}

	.text {
		display: grid;
		justify-items: start;
		gap: 0.125rem;
		min-width: 0;
	}

	.km {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0 0.5rem;
		border-radius: 999px;
		background: var(--color-green-light);
		color: var(--color-green);
		font-size: var(--text-small);
		font-weight: 700;
	}

	.name {
		font-weight: 700;
	}

	.detail {
		color: var(--color-text-muted);
		font-size: var(--text-small);
	}

	/* „Infos“: eigener Knopf, ≥ 48 px, durch einen Strich vom Rest getrennt */
	.info {
		display: grid;
		place-items: center;
		align-content: center;
		gap: 0.125rem;
		min-width: 4.5rem;
		padding: 0.5rem;
		border-left: 2px solid var(--color-border);
		color: var(--color-green);
		font-size: var(--text-small);
		font-weight: 700;
		text-decoration: none;
	}

	.info:hover {
		background: var(--color-green-light);
	}
</style>
