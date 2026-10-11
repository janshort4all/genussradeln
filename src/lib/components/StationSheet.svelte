<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import type { StationsController } from '$lib/improve/stations.svelte';
	import { clockText, kmText, minutesText, plusText } from '$lib/improve/wording';
	import type { PlannedTour } from '$lib/tour/model';

	/**
	 * Fenster am unteren Rand der großen Karte: Tipp auf eine nummerierte Station → Alternativen, Vorschau direkt auf der
	 * Karte (orange „Bisher“, grün gestrichelt „Neu“), Mehrweg und Fahrzeit, „Übernehmen“ / „Nein, danke“.
	 */
	let { tour, controller }: { tour: PlannedTour; controller: StationsController } = $props();
</script>

{#if controller.status === 'ready'}
	<div class="sheet-box" role="region" aria-label="Stationen der Tour">
		{#if !controller.selected}
			<p class="tip">Tippen Sie auf eine Nummer, um dort anders entlangzufahren.</p>
		{:else}
			{@const selected = controller.selected}
			<div class="head">
				<h2>
					<span class="num" aria-hidden="true">{controller.number(selected)}</span>
					Statt „{selected.name}“ lieber …
				</h2>
				<button type="button" class="close" aria-label="Schließen" onclick={() => controller.close()}>
					<X size={24} strokeWidth={2.5} aria-hidden="true" />
				</button>
			</div>

			{#if controller.optionsStatus === 'searching'}
				<p class="muted" role="status">Wir suchen Alternativen …</p>
			{:else if controller.optionsStatus === 'unavailable'}
				<p class="muted">Die Suche ist gerade nicht möglich. Bitte versuchen Sie es später noch einmal.</p>
			{:else if !controller.options.length}
				<p class="muted">Hier haben wir keine Alternative gefunden, die sich lohnt.</p>
			{:else}
				<ul class="options">
					{#each controller.options as option (option.id)}
						<li>
							<button
								type="button"
								class="option"
								class:on={option.id === controller.chosenId}
								aria-pressed={option.id === controller.chosenId}
								onclick={() => controller.choose(option.id)}
							>
								<span class="option-title">{option.title}</span>
								<span class="option-facts">{plusText(option.offer.extraMeters)} · {minutesText(option.offer.extraMinutes)}</span>
							</button>
						</li>
					{/each}
				</ul>
				{#if controller.chosen}
					<p class="total">
						Danach: {kmText(tour.stats.distance + controller.chosen.offer.extraMeters)} km, ca.
						{clockText(tour.minutes + controller.chosen.offer.extraMinutes)}
					</p>
				{/if}
				<div class="buttons">
					<button type="button" class="accept" onclick={() => controller.accept()} disabled={!controller.chosen}>
						<Check size={24} strokeWidth={3} aria-hidden="true" /> Übernehmen
					</button>
					<button type="button" class="decline" onclick={() => controller.close()}>Nein, danke</button>
				</div>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.sheet-box {
		padding: 0.875rem 1rem calc(0.875rem + env(safe-area-inset-bottom));
		border-radius: 1.5rem 1.5rem 0 0;
		background: var(--color-surface);
		box-shadow: 0 -4px 16px rgb(36 53 57 / 0.25);
	}

	.tip {
		margin: 0;
		font-weight: 700;
		text-align: center;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: var(--text-large);
		line-height: 1.2;
	}

	.num {
		display: grid;
		flex: none;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: var(--color-orange);
		color: var(--color-surface);
		font-size: var(--text-small);
	}

	.close {
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

	.muted {
		margin: 0 0 0.5rem;
		color: var(--color-text-muted);
	}

	.options {
		display: grid;
		gap: 0.5rem;
		margin: 0 0 0.75rem;
		padding: 0;
		list-style: none;
	}

	.option {
		display: grid;
		gap: 0.125rem;
		width: 100%;
		min-height: 3.25rem;
		padding: 0.5rem 0.875rem;
		border: 2px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.option.on {
		border-color: var(--color-green);
		background: var(--color-green-light);
	}

	.option:focus-visible,
	.close:focus-visible {
		outline: 3px solid var(--color-orange);
		outline-offset: 2px;
	}

	.option-title {
		font-weight: 700;
	}

	.option-facts {
		color: var(--color-text-muted);
	}

	.total {
		margin: 0 0 0.75rem;
		font-weight: 700;
	}

	.buttons {
		display: grid;
		gap: 0.25rem;
	}

	.accept {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-height: 3.5rem;
		border: 2px solid var(--color-green);
		border-radius: var(--radius);
		background: var(--color-green);
		color: var(--color-surface);
		font: inherit;
		font-size: var(--text-large);
		font-weight: 700;
		cursor: pointer;
	}

	.accept:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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
</style>
