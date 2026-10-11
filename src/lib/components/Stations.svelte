<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import { untrack } from 'svelte';
	import { loadPlanDeps } from '$lib/improve/deps';
	import { applyOffer } from '$lib/improve/offers';
	import { stationOptions, stationsOf, type Station, type StationOption } from '$lib/improve/stations';
	import OfferMap from '$lib/map/OfferMap.svelte';
	import type { PlanDeps } from '$lib/routing/plan';
	import { RoutingUnavailableError } from '$lib/routing/graphhopper';
	import { tourLine, type PlannedTour } from '$lib/tour/model';

	/**
	 * „Diese Tour führt vorbei an …“: die Stationen der Tour in Fahrtrichtung. Ein Tipp auf eine Station zeigt Alternativen in
	 * der Nähe – mit Karte, Mehrweg in Kilometern und Minuten. Nichts ändert sich vor „Übernehmen“.
	 */
	interface Props {
		tour: PlannedTour;
		/** die Tour hat sich geändert (Übernehmen); `text` beschreibt die Änderung für „Rückgängig“ */
		onchange: (tour: PlannedTour, text: string) => void;
		/** die Stationen (für die nummerierten Punkte auf der Karte) */
		stations?: Station[];
		/** die gewählte Station (wird auf der Karte hervorgehoben) */
		selectedId?: string;
	}

	let { tour, onchange, stations = $bindable([]), selectedId = $bindable() }: Props = $props();

	let deps: PlanDeps | undefined;
	let status: 'loading' | 'ready' | 'none' = $state('loading');

	// Stationen berechnen, sobald Namensdaten und Tour da sind (und nach jeder Änderung der Tour neu)
	$effect(() => {
		const current = tour;
		let cancelled = false;
		untrack(() => {
			status = 'loading';
			selectedId = undefined;
		});
		(async () => {
			deps = await loadPlanDeps();
			if (cancelled) return;
			stations = deps.names ? stationsOf(current, deps.names) : [];
			status = stations.length ? 'ready' : 'none';
		})().catch((error) => {
			console.warn('Stationen nicht verfügbar:', error);
			if (!cancelled) status = 'none';
		});
		return () => (cancelled = true);
	});

	// Alternativen zur gewählten Station
	let options: StationOption[] = $state([]);
	let optionsStatus: 'idle' | 'searching' | 'done' | 'unavailable' = $state('idle');
	let chosenId: string | undefined = $state();
	const selected = $derived(stations.find((s) => s.id === selectedId));
	const number = (s: Station) => stations.indexOf(s) + 1;
	const chosen = $derived(options.find((o) => o.id === chosenId));

	$effect(() => {
		const station = selected;
		const names = deps?.names;
		const current = untrack(() => tour);
		untrack(() => {
			options = [];
			chosenId = undefined;
			optionsStatus = station ? 'searching' : 'idle';
		});
		if (!station || !names || !deps) return;
		const controller = new AbortController();
		stationOptions(current, station, names, { ...deps, signal: controller.signal })
			.then((found) => {
				if (controller.signal.aborted) return;
				options = found;
				chosenId = found[0]?.id;
				optionsStatus = 'done';
			})
			.catch((error) => {
				if (controller.signal.aborted || (error as Error).name === 'AbortError') return;
				console.warn('Alternativen nicht verfügbar:', error);
				optionsStatus = error instanceof RoutingUnavailableError ? 'unavailable' : 'done';
			});
		return () => controller.abort();
	});

	function accept() {
		if (!chosen || !deps || !selected) return;
		onchange(applyOffer(tour, chosen.offer, deps), `${chosen.title} (statt „${selected.name}“)`);
	}

	const km = (meters: number) => (Math.abs(meters) / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
	function plus(meters: number): string {
		if (Math.abs(meters) < 100) return 'gleich lang';
		return meters > 0 ? `+${km(meters)} km` : `${km(meters)} km kürzer`;
	}
	function minutesText(minutes: number): string {
		if (minutes === 0) return 'gleiche Fahrzeit';
		return minutes > 0 ? `+${minutes} Min.` : `${-minutes} Min. weniger`;
	}
	function clockText(minutes: number): string {
		const rounded = Math.round(minutes / 5) * 5;
		const hours = Math.floor(rounded / 60);
		const rest = rounded % 60;
		return hours ? `${hours}:${String(rest).padStart(2, '0')} Std.` : `${rest} Min.`;
	}
	const mapLine = $derived(tourLine(tour));
</script>

{#if status !== 'none'}
	<section class="stations" aria-labelledby="stations-title">
		<h2 id="stations-title" class="section-title">
			<span class="round-icon" aria-hidden="true"><MapPin size={22} strokeWidth={2.25} /></span>
			Diese Tour führt vorbei an
		</h2>

		{#if status === 'loading'}
			<p class="muted" role="status">Wir schauen, woran Ihre Tour vorbeiführt …</p>
		{:else}
			<p class="hint">Tippen Sie auf einen Ort, wenn Sie lieber woanders vorbeifahren möchten.</p>
			<ul class="chips">
				{#each stations as station (station.id)}
					<li>
						<button
							type="button"
							class="chip"
							class:on={station.id === selectedId}
							aria-pressed={station.id === selectedId}
							onclick={() => (selectedId = station.id === selectedId ? undefined : station.id)}
						>
							<span class="num" aria-hidden="true">{number(station)}</span>
							<span>{station.name}</span>
						</button>
					</li>
				{/each}
			</ul>

			{#if selected}
				<div class="panel" role="region" aria-label="Alternativen zu {selected.name}">
					{#if optionsStatus === 'searching'}
						<p class="muted" role="status">Wir suchen Alternativen zu „{selected.name}“ …</p>
					{:else if optionsStatus === 'unavailable'}
						<p class="muted">Die Suche ist gerade nicht möglich. Bitte versuchen Sie es später noch einmal.</p>
					{:else if !options.length}
						<p class="muted">Zu „{selected.name}“ haben wir hier keine Alternative gefunden, die sich lohnt.</p>
						<button type="button" class="decline" onclick={() => (selectedId = undefined)}>Schließen</button>
					{:else}
						<h3>Statt „{selected.name}“ lieber …</h3>
						<ul class="options">
							{#each options as option (option.id)}
								<li>
									<button
										type="button"
										class="option"
										class:on={option.id === chosenId}
										aria-pressed={option.id === chosenId}
										onclick={() => (chosenId = option.id)}
									>
										<span class="option-title">{option.title}</span>
										<span class="option-facts">{plus(option.offer.extraMeters)} · {minutesText(option.offer.extraMinutes)}</span>
									</button>
								</li>
							{/each}
						</ul>

						{#if chosen}
							{#key chosen.id}
								<div class="map">
									<OfferMap
										tour={mapLine}
										oldLine={chosen.offer.oldLine}
										newLine={chosen.offer.newLine}
										newLabel="Neu · {plus(chosen.offer.extraMeters)}"
										label="Karte: Der bisherige Weg (orange) und der neue Weg (grün, gestrichelt)"
									/>
								</div>
							{/key}
							<p class="total">
								Danach: {km(tour.stats.distance + chosen.offer.extraMeters)} km, ca. {clockText(tour.minutes + chosen.offer.extraMinutes)}
								<span class="was">(jetzt {km(tour.stats.distance)} km, {clockText(tour.minutes)})</span>
							</p>
						{/if}

						<div class="buttons">
							<button type="button" class="accept" onclick={accept} disabled={!chosen}>
								<Check size={24} strokeWidth={3} aria-hidden="true" /> Übernehmen
							</button>
							<button type="button" class="decline" onclick={() => (selectedId = undefined)}>Nein, danke</button>
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
