<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { untrack } from 'svelte';
	import { loadPlanDeps } from '$lib/improve/deps';
	import { applyOffer, findOffers, type Offer } from '$lib/improve/offers';
	import OfferMap from '$lib/map/OfferMap.svelte';
	import { NoRouteError, RoutingUnavailableError } from '$lib/routing/graphhopper';
	import type { PlanDeps } from '$lib/routing/plan';
	import { tourLine, type PlannedTour } from '$lib/tour/model';

	/**
	 * „Noch schöner fahren?“ (F7): schönere Umwege für die gewählte Tour, einer nach dem anderen – mit Karte, Mehrweg in
	 * Kilometern und Minuten. Nichts ändert sich, bevor „Übernehmen“ gedrückt wird; danach geht „Rückgängig“.
	 */
	interface Props {
		tour: PlannedTour;
		/** die Tour hat sich geändert (Übernehmen); `text` beschreibt die Änderung für „Rückgängig“ */
		onchange: (tour: PlannedTour, text: string) => void;
	}

	let { tour, onchange }: Props = $props();

	let status: 'searching' | 'ready' | 'unavailable' | 'error' = $state('searching');
	let offers: Offer[] = $state([]);
	/** Nummer des gezeigten Vorschlags; nach dem letzten ist die Liste „durch“ */
	let index = $state(0);

	const current = $derived(offers[index]);

	let deps: PlanDeps | undefined;

	// Suche starten, sobald die Tour da ist (und nach jeder Änderung neu – die Stellen verschieben sich)
	$effect(() => {
		const snapshot = tour;
		const controller = new AbortController();
		untrack(() => {
			status = 'searching';
			offers = [];
			index = 0;
		});
		(async () => {
			try {
				deps = await loadPlanDeps(controller.signal);
				const found = await findOffers(snapshot, deps);
				if (controller.signal.aborted) return;
				offers = found;
				status = 'ready';
			} catch (error) {
				if (controller.signal.aborted || (error as Error).name === 'AbortError') return;
				console.warn('Suche nach schöneren Wegen fehlgeschlagen:', error);
				status = error instanceof RoutingUnavailableError ? 'unavailable' : error instanceof NoRouteError ? 'ready' : 'error';
			}
		})();
		return () => controller.abort();
	});

	function accept() {
		if (!current || !deps) return;
		onchange(applyOffer(tour, current, deps), `${current.title} (${plus(current.extraMeters)})`);
	}

	const km = (meters: number) => (meters / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
	/** „+1,8 km“, „gleich lang“, „0,3 km kürzer“ */
	function plus(meters: number): string {
		if (Math.abs(meters) < 100) return 'gleich lang';
		return meters > 0 ? `+${km(meters)} km` : `${km(-meters)} km kürzer`;
	}
	function minutesText(minutes: number): string {
		if (minutes <= 0) return 'kaum länger';
		return `+${minutes} Min.`;
	}
	function clockText(minutes: number): string {
		const rounded = Math.round(minutes / 5) * 5;
		const hours = Math.floor(rounded / 60);
		const rest = rounded % 60;
		return hours ? `${hours}:${String(rest).padStart(2, '0')} Std.` : `${rest} Min.`;
	}
	const totalKm = (meters: number) => Math.round(meters / 100) / 10;

	const mapLine = $derived(tourLine(tour));
</script>

<section class="offers" aria-labelledby="offers-title">
	<h2 id="offers-title" class="section-title">
		<span class="round-icon" aria-hidden="true"><Sparkles size={22} strokeWidth={2.25} /></span>
		Noch schöner fahren?
	</h2>

	{#if status === 'searching'}
		<p class="muted" role="status">Wir suchen schönere Stellen auf Ihrer Tour …</p>
	{:else if status === 'unavailable'}
		<p class="muted">Die Suche nach schöneren Wegen ist gerade nicht möglich. Bitte versuchen Sie es später noch einmal.</p>
	{:else if status === 'error'}
		<p class="muted">Die Suche nach schöneren Wegen hat leider nicht geklappt.</p>
	{:else if !offers.length}
		<p class="muted">Ihre Tour führt schon überwiegend durch schöne Gegenden – wir haben keinen besseren Umweg gefunden.</p>
	{:else if !current}
		<p class="muted">Das waren alle Vorschläge für diese Tour.</p>
		<button type="button" class="again" onclick={() => (index = 0)}>Noch einmal ansehen</button>
	{:else}
		{#key current.id}
			<div class="offer">
				<p class="counter">Vorschlag {index + 1} von {offers.length}</p>
				<h3>{current.title}</h3>
				<p class="why">{current.why}</p>

				<div class="map">
					<OfferMap
						tour={mapLine}
						oldLine={current.oldLine}
						newLine={current.newLine}
						newLabel="Neu · {plus(current.extraMeters)}"
						label="Karte: Der Weg, der ersetzt würde (orange), und der neue Weg (grün, gestrichelt)"
					/>
				</div>
				<p class="legend">
					<span><i class="bar old" aria-hidden="true"></i> Bisher</span>
					<span><i class="bar new" aria-hidden="true"></i> Neu</span>
				</p>

				<dl class="effect">
					<div>
						<dd>{plus(current.extraMeters)}</dd>
						<dt>Strecke</dt>
					</div>
					<div>
						<dd>{minutesText(current.extraMinutes)}</dd>
						<dt>Fahrzeit</dt>
					</div>
				</dl>
				<p class="total">
					Danach: {km(tour.stats.distance + current.extraMeters)} km, ca. {clockText(tour.minutes + current.extraMinutes)}
					<span class="was">(jetzt {totalKm(tour.stats.distance).toLocaleString('de-DE')} km, {clockText(tour.minutes)})</span>
				</p>

				<div class="buttons">
					<button type="button" class="accept" onclick={accept}>
						<Check size={24} strokeWidth={3} aria-hidden="true" /> Übernehmen
					</button>
					<button type="button" class="decline" onclick={() => index++}>Nein, danke</button>
				</div>
			</div>
		{/key}
	{/if}
</section>

<style>
	.offers {
		margin: 0 0 1.75rem;
		padding: 1rem;
		border: 2px solid var(--color-border);
		border-radius: 1rem;
		background: var(--color-surface);
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

	.muted {
		margin: 0;
		color: var(--color-text-muted);
	}

	.counter {
		margin: 0;
		color: var(--color-text-muted);
		font-weight: 700;
	}

	h3 {
		margin: 0.125rem 0 0.25rem;
		font-family: var(--font-title);
		font-size: var(--text-h2);
		line-height: 1.2;
	}

	.why {
		margin: 0 0 0.75rem;
	}

	.map {
		height: 15rem;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 1.25rem;
		margin: 0.5rem 0 0.75rem;
		font-weight: 700;
	}

	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.bar {
		display: inline-block;
		width: 2rem;
		height: 0.375rem;
		border-radius: 999px;
	}

	.bar.old {
		background: #b0552f;
	}

	.bar.new {
		background: repeating-linear-gradient(90deg, #4b5a22 0 0.5rem, transparent 0.5rem 0.75rem);
	}

	/* Wirkung groß und in Worten: wie viel länger, wie viel mehr Zeit */
	.effect {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
		gap: 0.5rem;
		margin: 0 0 0.5rem;
	}

	.effect div {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.625rem 0.375rem;
		border-radius: 1rem;
		background: var(--color-green-light);
		text-align: center;
	}

	.effect dd {
		order: 1;
		margin: 0;
		font-size: var(--text-h2);
		font-weight: 700;
		line-height: 1.2;
	}

	.effect dt {
		order: 2;
		color: var(--color-text-muted);
		font-size: var(--text-small);
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

	.accept,
	.decline,
	.again {
		font: inherit;
		cursor: pointer;
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
		font-size: var(--text-large);
		font-weight: 700;
	}

	.accept:hover {
		background: #dbe0bf;
	}

	.decline,
	.again {
		min-height: var(--tap);
		border: 0;
		border-radius: var(--radius);
		background: none;
		color: var(--color-text-muted);
		font-size: var(--text-base);
		font-weight: 700;
		text-decoration: underline;
	}

	.again {
		margin-top: 0.5rem;
	}

</style>
