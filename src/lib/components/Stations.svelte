<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import type { StationsController } from '$lib/improve/stations.svelte';
	import { clockText, kmText, minutesText, plusText } from '$lib/improve/wording';
	import OfferMap from '$lib/map/OfferMap.svelte';
	import { tourLine, type PlannedTour } from '$lib/tour/model';

	/**
	 * „Diese Tour führt vorbei an …“: die Stationen der Tour in Fahrtrichtung. Ein Tipp auf eine Station zeigt Alternativen in
	 * der Nähe – mit Karte, Mehrweg in Kilometern und Minuten. Nichts ändert sich vor „Übernehmen“.
	 * (In der großen Karte gibt es dasselbe als Fenster am unteren Rand: StationSheet.svelte.)
	 */
	let { tour, controller }: { tour: PlannedTour; controller: StationsController } = $props();

	const mapLine = $derived(tourLine(tour));
</script>

{#if controller.status !== 'none'}
	<section class="stations" id="stations" aria-labelledby="stations-title">
		<h2 id="stations-title" class="section-title">
			<span class="round-icon" aria-hidden="true"><MapPin size={22} strokeWidth={2.25} /></span>
			Diese Tour führt vorbei an
		</h2>

		{#if controller.status === 'loading'}
			<p class="muted" role="status">Wir schauen, woran Ihre Tour vorbeiführt …</p>
		{:else}
			<p class="hint">Tippen Sie auf einen Ort – hier oder auf der Karte –, wenn Sie lieber woanders vorbeifahren möchten.</p>
			<ul class="chips">
				{#each controller.stations as station (station.id)}
					<li>
						<button
							type="button"
							class="chip"
							class:on={station.id === controller.selectedId}
							aria-pressed={station.id === controller.selectedId}
							onclick={() => controller.select(station.id)}
						>
							<span class="num" aria-hidden="true">{controller.number(station)}</span>
							<span>{station.name}</span>
						</button>
					</li>
				{/each}
			</ul>

			{#if controller.selected}
				{@const selected = controller.selected}
				<div class="panel" role="region" aria-label="Alternativen zu {selected.name}">
					{#if controller.optionsStatus === 'searching'}
						<p class="muted" role="status">Wir suchen Alternativen zu „{selected.name}“ …</p>
					{:else if controller.optionsStatus === 'unavailable'}
						<p class="muted">Die Suche ist gerade nicht möglich. Bitte versuchen Sie es später noch einmal.</p>
					{:else if !controller.options.length}
						<p class="muted">Zu „{selected.name}“ haben wir hier keine Alternative gefunden, die sich lohnt.</p>
						<button type="button" class="decline" onclick={() => controller.close()}>Schließen</button>
					{:else}
						<h3>Statt „{selected.name}“ lieber …</h3>
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
							{@const chosen = controller.chosen}
							{#key chosen.id}
								<div class="map">
									<OfferMap
										tour={mapLine}
										oldLine={chosen.offer.oldLine}
										newLine={chosen.offer.newLine}
										newLabel="Neu · {plusText(chosen.offer.extraMeters)}"
										label="Karte: Der bisherige Weg (orange) und der neue Weg (grün, gestrichelt)"
									/>
								</div>
							{/key}
							<p class="total">
								Danach: {kmText(tour.stats.distance + chosen.offer.extraMeters)} km, ca. {clockText(tour.minutes + chosen.offer.extraMinutes)}
								<span class="was">(jetzt {kmText(tour.stats.distance)} km, {clockText(tour.minutes)})</span>
							</p>
						{/if}

						<div class="buttons">
							<button type="button" class="accept" onclick={() => controller.accept()} disabled={!controller.chosen}>
								<Check size={24} strokeWidth={3} aria-hidden="true" /> Übernehmen
							</button>
							<button type="button" class="decline" onclick={() => controller.close()}>Nein, danke</button>
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</section>
{/if}

<style>
	.stations {
		margin: 0 0 1.75rem;
		padding: 1rem;
		border: 2px solid var(--color-border);
		border-radius: 1.5rem;
		background: var(--color-surface);
		box-shadow: 0 4px 14px rgb(36 53 57 / 0.1);
		scroll-margin-top: 0.75rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin-top: 0;
	}

	.round-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		background: var(--color-green-light);
		color: var(--color-green);
	}

	.muted,
	.hint {
		margin: 0 0 0.75rem;
		color: var(--color-text-muted);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0 0 1rem;
		padding: 0;
		list-style: none;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: var(--tap);
		padding: 0.375rem 1rem 0.375rem 0.5rem;
		border: 2px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	.chip:hover {
		border-color: var(--color-green);
	}

	.chip.on {
		border-color: var(--color-green);
		background: var(--color-green-light);
		color: var(--color-green);
	}

	.chip:focus-visible,
	.option:focus-visible {
		outline: 3px solid var(--color-orange);
		outline-offset: 3px;
	}

	.num {
		display: grid;
		flex: none;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: var(--color-green);
		color: var(--color-surface);
		font-size: var(--text-small);
	}

	.chip.on .num {
		background: var(--color-orange);
	}

	.panel {
		padding-top: 0.5rem;
		border-top: 1px solid var(--color-border);
	}

	h3 {
		margin: 0.5rem 0 0.75rem;
		font-family: var(--font-title);
		font-size: var(--text-large);
		line-height: 1.2;
	}

	.options {
		display: grid;
		gap: 0.5rem;
		margin: 0 0 1rem;
		padding: 0;
		list-style: none;
	}

	.option {
		display: grid;
		gap: 0.125rem;
		width: 100%;
		min-height: 3.5rem;
		padding: 0.625rem 1rem;
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

	.option-title {
		font-weight: 700;
	}

	.option-facts {
		color: var(--color-text-muted);
	}

	.map {
		height: 14rem;
		margin-bottom: 0.75rem;
	}

	.total {
		margin: 0 0 1rem;
		font-weight: 700;
	}

	.was {
		display: block;
		color: var(--color-text-muted);
		font-weight: 400;
	}

	.buttons {
		display: grid;
		gap: 0.5rem;
	}

	.accept {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-height: 3.5rem;
		border: 2px solid var(--color-green);
		border-radius: var(--radius);
		background: var(--color-green-light);
		color: var(--color-green);
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
