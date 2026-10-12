<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Check from '@lucide/svelte/icons/check';
	import Coffee from '@lucide/svelte/icons/coffee';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Trees from '@lucide/svelte/icons/trees';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import Waves from '@lucide/svelte/icons/waves';
	import type { DetoursController } from '$lib/improve/detours.svelte';
	import { clockText, kmText, plusText } from '$lib/improve/wording';
	import type { PlannedTour } from '$lib/tour/model';

	/**
	 * Fenster am unteren Rand der großen Karte: „Spannende Umwege suchen“ → Liste der Ziele (auch als Symbole auf der Karte)
	 * → ein Ziel: Vergleich „Bisher“ / „Mit Umweg“ in großen Zahlen, Vorschau auf der Karte, „Übernehmen“ / „Nein, danke“.
	 * Bewusst wenig Text (Jan, 12.10.2026: „deutlich einfacher und strukturierter“).
	 */
	interface Props {
		tour: PlannedTour;
		controller: DetoursController;
		/** zuletzt übernommene Änderung (für „Rückgängig“ direkt in der Karte) */
		undoText?: string;
		onundo?: () => void;
	}

	let { tour, controller, undoText, onundo }: Props = $props();

	const isWater = (kind: string) => kind === 'lake' || kind === 'river';
	/**
	 * „+12 km“ – für die Liste ohne Nachkommastelle, große Umwege sind keine Feinarbeit. Kurze Stücke durch Wald oder am See
	 * (through-offers.ts) sind oft nur ein paar hundert Meter länger: „+0,6 km“ bzw. „gleich lang“.
	 */
	const roundKm = (meters: number) => (meters >= 3000 ? `+${Math.round(meters / 1000)} km` : plusText(meters));
	/** Durch Wald/Park/am See statt daneben – derselbe Weg, kein Umweg zu einem Ziel; ebenso der Einbau eines Stopps (Café, Biergarten) */
	const isThrough = (id: string) => id.startsWith('durch-') || id.startsWith('halt-');
	const isStop = (id: string) => id.startsWith('halt-');
	/**
	 * „+50 Min.“ bzw. „+1:10 Std.“ – genau der Unterschied der beiden angezeigten Fahrzeiten (auf 5 Minuten gerundet), damit
	 * „Bisher“, „Neu“ und das gelbe Feld zusammenpassen; leer, wenn die angezeigte Fahrzeit gleich bleibt
	 */
	function plusTime(minutes: number): string {
		const round5 = (m: number) => Math.round(m / 5) * 5;
		const rounded = round5(tour.minutes + minutes) - round5(tour.minutes);
		if (rounded <= 0) return '';
		return rounded >= 60 ? `+${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')} Std.` : `+${rounded} Min.`;
	}
</script>

<div class="sheet-box" role="region" aria-label="Spannende Umwege">
	{#if undoText && controller.status === 'idle'}
		<p class="done" role="status">
			<Check size={22} strokeWidth={3} aria-hidden="true" />
			<span>Übernommen</span>
			<button type="button" class="undo" onclick={() => onundo?.()}>
				<Undo2 size={20} strokeWidth={2.5} aria-hidden="true" /> Rückgängig
			</button>
		</p>
	{/if}

	{#if controller.status === 'idle'}
		<button type="button" class="primary search" onclick={() => controller.find()}>
			<Sparkles size={24} strokeWidth={2.25} aria-hidden="true" /> Spannende Umwege suchen
		</button>
		<p class="hint">Seen, Flüsse, Wälder und Parks in der Nähe</p>
	{:else if controller.status === 'searching'}
		<p class="message" role="status">Wir suchen …</p>
	{:else if controller.status === 'none'}
		<p class="message">Kein spannender Umweg gefunden.</p>
		<p class="hint">Ihre Tour nimmt hier schon das Schönste mit.</p>
	{:else if controller.status === 'unavailable'}
		<p class="message">Die Suche geht gerade nicht. Bitte später noch einmal versuchen.</p>
	{:else if controller.status === 'error'}
		<p class="message">Die Suche hat nicht geklappt.</p>
		<button type="button" class="decline" onclick={() => controller.find()}>Noch einmal versuchen</button>
	{:else if !controller.selected}
		<h2 class="title">Spannende Umwege</h2>
		<ul class="list">
			{#each controller.detours as detour (detour.highlight.id)}
				{@const water = isWater(detour.highlight.kind)}
				<li>
					<button type="button" class="item" onclick={() => controller.select(detour.highlight.id)}>
						<span class="icon" class:water aria-hidden="true">
							{#if water}<Waves size={22} strokeWidth={2.25} />{:else}<Trees size={22} strokeWidth={2.25} />{/if}
						</span>
						<span class="name">{detour.highlight.name}</span>
						<span class="extra">{roundKm(detour.offer.extraMeters)}</span>
						<ChevronRight size={22} strokeWidth={2.5} aria-hidden="true" />
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		{@const chosen = controller.selected}
		{@const water = isWater(chosen.highlight.kind)}
		<div class="head">
			<button type="button" class="back" aria-label="Zurück zur Liste" onclick={() => controller.select(chosen.highlight.id)}>
				<ChevronLeft size={26} strokeWidth={2.5} aria-hidden="true" />
			</button>
			<span class="icon" class:water aria-hidden="true">
				{#if isStop(chosen.highlight.id)}<Coffee size={22} strokeWidth={2.25} />{:else if water}<Waves size={22} strokeWidth={2.25} />{:else}<Trees size={22} strokeWidth={2.25} />{/if}
			</span>
			<h2 class="title">{isStop(chosen.highlight.id) ? `${chosen.highlight.name} einbauen?` : chosen.highlight.name}</h2>
		</div>

		<!-- Vergleich in großen Zahlen: bisher → mit Umweg -->
		<div class="compare">
			<div class="col">
				<span class="label">Bisher</span>
				<span class="value">{kmText(tour.stats.distance)} km</span>
				<span class="value">{clockText(tour.minutes)}</span>
			</div>
			<span class="arrow" aria-hidden="true"><ArrowRight size={28} strokeWidth={2.5} /></span>
			<div class="col new">
				<span class="label">{isThrough(chosen.highlight.id) ? 'Neu' : 'Mit Umweg'}</span>
				<span class="value">{kmText(tour.stats.distance + chosen.offer.extraMeters)} km</span>
				<span class="value">{clockText(tour.minutes + chosen.offer.extraMinutes)}</span>
			</div>
		</div>
		<p class="badge">{[plusText(chosen.offer.extraMeters), plusTime(chosen.offer.extraMinutes)].filter(Boolean).join(' · ')}</p>

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
		padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
		border-radius: 1.5rem 1.5rem 0 0;
		background: var(--color-surface);
		box-shadow: 0 -4px 16px rgb(36 53 57 / 0.25);
	}

	.title {
		margin: 0 0 0.75rem;
		font-size: var(--text-large);
		line-height: 1.2;
	}

	.head .title {
		margin: 0;
	}

	.message {
		margin: 0;
		font-size: var(--text-large);
		font-weight: 700;
		text-align: center;
	}

	.hint {
		margin: 0.5rem 0 0;
		color: var(--color-text-muted);
		text-align: center;
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

	/* „Spannende Umwege suchen“ in Terrakotta, damit er auffällt (Jan, 14.10.2026) – wie auf der Tour-Seite */
	.primary.search {
		background: var(--color-orange);
		box-shadow: 0 3px 0 var(--color-orange-dark);
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
		font-weight: 700;
		text-align: left;
		cursor: pointer;
	}

	.item:hover {
		border-color: var(--color-green);
	}

	.name {
		flex: 1;
		min-width: 0;
	}

	.extra {
		flex: none;
		color: var(--color-green);
		font-size: var(--text-large);
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

	.head {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin-bottom: 0.875rem;
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

	.compare {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.625rem;
	}

	.col {
		display: grid;
		gap: 0.125rem;
		padding: 0.625rem 0.75rem;
		border-radius: var(--radius);
		background: var(--color-bg);
		text-align: center;
	}

	.col.new {
		background: var(--color-green-light);
	}

	.label {
		color: var(--color-text-muted);
		font-weight: 700;
	}

	.value {
		font-family: var(--font-title);
		font-size: 1.5rem;
		font-weight: 700;
		line-height: 1.2;
	}

	.arrow {
		color: var(--color-green);
	}

	.badge {
		margin: 0 0 0.875rem;
		padding: 0.375rem 0.75rem;
		border-radius: 999px;
		background: var(--color-sun-light);
		font-weight: 700;
		text-align: center;
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
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 0.75rem;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius);
		background: var(--color-green-light);
		font-weight: 700;
	}

	.done :global(svg) {
		flex: none;
		color: var(--color-green);
	}

	.done span {
		flex: 1;
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
	.decline:focus-visible,
	.undo:focus-visible {
		outline: 3px solid var(--color-orange);
		outline-offset: 2px;
	}
</style>
