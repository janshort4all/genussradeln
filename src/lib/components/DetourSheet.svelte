<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import Trees from '@lucide/svelte/icons/trees';
	import Waves from '@lucide/svelte/icons/waves';
	import type { DetoursController } from '$lib/improve/detours.svelte';
	import { clockText, kmText, minutesText, plusText } from '$lib/improve/wording';
	import type { PlannedTour } from '$lib/tour/model';

	/**
	 * Fenster am unteren Rand der großen Karte: „Spannende Umwege suchen“ → Highlights in der Nähe (auch als Symbole auf der
	 * Karte) → eins antippen: Vorschau auf der Karte, Mehrweg und Fahrzeit, „Übernehmen“ / „Nein, danke“.
	 */
	interface Props {
		tour: PlannedTour;
		controller: DetoursController;
		/** zuletzt übernommene Änderung (für „Rückgängig“ direkt in der Karte) */
		undoText?: string;
		onundo?: () => void;
	}

	let { tour, controller, undoText, onundo }: Props = $props();
</script>

<div class="sheet-box" role="region" aria-label="Spannende Umwege">
	{#if undoText && controller.status === 'idle'}
		<p class="done" role="status">
			<Check size={22} strokeWidth={3} aria-hidden="true" />
			<span>Übernommen: {undoText}</span>
			<button type="button" class="undo" onclick={() => onundo?.()}>
				<Undo2 size={20} strokeWidth={2.5} aria-hidden="true" /> Rückgängig
			</button>
		</p>
	{/if}
	{#if controller.status === 'idle'}
		<p class="intro">Schöne Ziele in der Nähe, die einen Umweg wert sind – Seen, Flüsse, Wälder, Parks.</p>
		<button type="button" class="primary" onclick={() => controller.find()}>
			<Sparkles size={24} strokeWidth={2.25} aria-hidden="true" /> Spannende Umwege suchen
		</button>
	{:else if controller.status === 'searching'}
		<p class="intro" role="status">Wir suchen spannende Umwege …</p>
	{:else if controller.status === 'none'}
		<p class="intro">Kein spannender Umweg gefunden. Ihre Tour nimmt in dieser Gegend schon das Schönste mit.</p>
	{:else if controller.status === 'unavailable'}
		<p class="intro">Die Suche ist gerade nicht möglich. Bitte versuchen Sie es später noch einmal.</p>
	{:else if controller.status === 'error'}
		<p class="intro">Die Suche hat leider nicht geklappt.</p>
		<button type="button" class="decline" onclick={() => controller.find()}>Noch einmal versuchen</button>
	{:else if !controller.selected}
		<p class="intro">Tippen Sie auf ein Ziel – auf der Karte oder hier:</p>
		<ul class="list">
			{#each controller.detours as detour (detour.highlight.id)}
				{@const water = detour.highlight.kind === 'lake' || detour.highlight.kind === 'river'}
				<li>
					<button type="button" class="item" onclick={() => controller.select(detour.highlight.id)}>
						<span class="icon" class:water aria-hidden="true">
							{#if water}<Waves size={22} strokeWidth={2.25} />{:else}<Trees size={22} strokeWidth={2.25} />{/if}
						</span>
						<span class="text">
							<strong>{detour.offer.title}</strong>
							<span>{plusText(detour.offer.extraMeters)} · {minutesText(detour.offer.extraMinutes)}</span>
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		{@const chosen = controller.selected}
		<div class="head">
			<button type="button" class="back" aria-label="Zurück zur Auswahl" onclick={() => controller.select(chosen.highlight.id)}>
				<ChevronLeft size={26} strokeWidth={2.5} aria-hidden="true" />
			</button>
			<h2>{chosen.offer.title}</h2>
		</div>
		<p class="facts"><strong>{plusText(chosen.offer.extraMeters)}</strong> · <strong>{minutesText(chosen.offer.extraMinutes)}</strong> · {chosen.offer.why}</p>
		<p class="total">
			Danach: {kmText(tour.stats.distance + chosen.offer.extraMeters)} km, ca. {clockText(tour.minutes + chosen.offer.extraMinutes)}
			<span class="was">(jetzt {kmText(tour.stats.distance)} km, {clockText(tour.minutes)})</span>
		</p>
		<div class="buttons">
			<button type="button" class="primary" onclick={() => controller.accept()}>
				<Check size={24} strokeWidth={3} aria-hidden="true" /> Übernehmen
			</button>
			<button type="button" class="decline" onclick={() => controller.select(chosen.highlight.id)}>Nein, danke</button>
		</div>
	{/if}
</div>

<style>
	.sheet-box {
		padding: 0.875rem 1rem calc(0.875rem + env(safe-area-inset-bottom));
		border-radius: 1.5rem 1.5rem 0 0;
		background: var(--color-surface);
		box-shadow: 0 -4px 16px rgb(36 53 57 / 0.25);
	}

	.intro {
		margin: 0 0 0.75rem;
		font-weight: 700;
	}

	.intro:last-child {
		margin-bottom: 0;
	}

	.primary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 3.5rem;
		border: 0;
		border-radius: var(--radius);
		background: var(--color-green);
		color: var(--color-surface);
		font: inherit;
		font-size: var(--text-large);
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 3px 0 #18241d;
	}

	.list {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		min-height: 3.5rem;
		padding: 0.5rem 0.75rem;
		border: 2px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.item:hover {
		border-color: var(--color-green);
	}

	.icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		background: var(--color-green);
		color: var(--color-surface);
	}

	.icon.water {
		background: var(--color-blue);
	}

	.text {
		display: grid;
		gap: 0.125rem;
	}

	.text span {
		color: var(--color-text-muted);
	}

	.head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	h2 {
		margin: 0;
		font-size: var(--text-large);
		line-height: 1.2;
	}

	.back {
		display: grid;
		flex: none;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		border: 0;
		border-radius: 50%;
		background: var(--color-green-light);
		color: var(--color-green);
		cursor: pointer;
	}

	.facts {
		margin: 0 0 0.25rem;
	}

	.total {
		margin: 0 0 0.75rem;
		font-weight: 700;
	}

	.was {
		display: block;
		color: var(--color-text-muted);
		font-weight: 400;
	}

	.buttons {
		display: grid;
		gap: 0.25rem;
	}

	.decline {
		min-height: var(--tap);
		border: 0;
		border-radius: var(--radius);
		background: none;
		color: var(--color-text-muted);
		font: inherit;
		font-weight: 700;
		text-decoration: underline;
		cursor: pointer;
	}

	.done {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 0.75rem;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius);
		background: var(--color-green-light);
		font-weight: 700;
	}

	.done span {
		flex: 1;
		min-width: 10rem;
	}

	.undo {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		min-height: var(--tap);
		padding: 0.25rem 0.875rem;
		border: 2px solid var(--color-green);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-green);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	.primary:focus-visible,
	.item:focus-visible,
	.back:focus-visible,
	.decline:focus-visible {
		outline: 3px solid var(--color-orange);
		outline-offset: 2px;
	}
</style>
