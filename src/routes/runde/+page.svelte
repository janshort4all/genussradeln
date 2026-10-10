<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowDownLeft from '@lucide/svelte/icons/arrow-down-left';
	import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowUpLeft from '@lucide/svelte/icons/arrow-up-left';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Clock from '@lucide/svelte/icons/clock';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Minus from '@lucide/svelte/icons/minus';
	import Navigation from '@lucide/svelte/icons/navigation';
	import Plus from '@lucide/svelte/icons/plus';
	import Route from '@lucide/svelte/icons/route';
	import Shuffle from '@lucide/svelte/icons/shuffle';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Trees from '@lucide/svelte/icons/trees';
	import Waves from '@lucide/svelte/icons/waves';
	import Waypoints from '@lucide/svelte/icons/waypoints';
	import Wheat from '@lucide/svelte/icons/wheat';
	import Button from '$lib/components/Button.svelte';
	import ChoiceGroup from '$lib/components/ChoiceGroup.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PlaceSearch from '$lib/components/PlaceSearch.svelte';
	import { currentPosition, PositionError } from '$lib/geo/position';
	import { inRegion } from '$lib/geocode/photon';
	import type { Effort } from '$lib/routing/graphhopper';
	import { rideMinutes } from '$lib/tour/duration';
	import { draft } from '$lib/tour/draft.svelte';
	import type { Place } from '$lib/tour/model';
	import { formatDuration } from '$lib/tour/sample';
	import { session } from '$lib/tour/session.svelte';

	// Rundtour-Wunsch (F2): Start und Länge – die App schlägt fünf schöne Runden vor, bei jeder Suche andere.
	// Start und Länge liegen im gemeinsamen Zwischenspeicher (draft), siehe „Zu einem Ziel“.
	const effort: Effort = 'easy';

	/** Auswahl bis 50 km als Kacheln; darüber „Länger“ mit Plus und Minus (Tagestouren) */
	const LENGTHS = [10, 15, 20, 30, 40, 50];
	const LONG_MIN = 60;
	const LONG_MAX = 150;
	const LONG_STEP = 10;
	const LONG_START = 70;
	const choices = [
		...LENGTHS.map((value) => ({ value: String(value), label: `${value} km`, icon: Route })),
		{ value: 'more', label: 'Länger als 50 km', icon: Route, wide: true }
	];

	/** „Worauf haben Sie Lust?“ – die App sucht die Runde dann mehr am Wasser, im Wald oder durch Felder und Dörfer */
	const wishes = [
		{ value: 'water', label: 'Am Wasser', icon: Waves },
		{ value: 'forest', label: 'Durch den Wald', icon: Trees },
		{ value: 'fields', label: 'Durch Felder und Dörfer', icon: Wheat },
		{ value: 'any', label: 'Überrasche mich', icon: Shuffle }
	];

	/** Wunschrichtung (freiwillig): Grad ab Norden */
	const directions = [
		{ value: '0', label: 'Norden', icon: ArrowUp },
		{ value: '45', label: 'Nordosten', icon: ArrowUpRight },
		{ value: '90', label: 'Osten', icon: ArrowRight },
		{ value: '135', label: 'Südosten', icon: ArrowDownRight },
		{ value: '180', label: 'Süden', icon: ArrowDown },
		{ value: '225', label: 'Südwesten', icon: ArrowDownLeft },
		{ value: '270', label: 'Westen', icon: ArrowLeft },
		{ value: '315', label: 'Nordwesten', icon: ArrowUpLeft },
		{ value: 'any', label: 'Egal', icon: Shuffle, wide: true }
	];
	const directionLabel = $derived(directions.find((d) => d.value === draft.direction)?.label ?? 'Egal');

	const km = $derived(Number(draft.km));
	const isLong = $derived(km > LENGTHS[LENGTHS.length - 1]);
	const duration = $derived(formatDuration(rideMinutes(km * 1000, 0, effort)));

	// Die Kacheln zeigen „Länger“, solange die Länge über 50 km liegt; die genaue Länge stellt man darunter ein
	const chosenLength = () => (isLong ? 'more' : draft.km);
	function chooseLength(value: string | string[] | undefined) {
		if (value === 'more') {
			if (!isLong) draft.km = String(LONG_START);
		} else if (typeof value === 'string') {
			draft.km = value;
		}
	}
	function step(delta: number) {
		draft.km = String(Math.min(LONG_MAX, Math.max(LONG_MIN, km + delta)));
	}

	let busy = $state(false);
	let problem = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		problem = '';
		let start: Place;
		if (draft.startMode === 'address') {
			const startPlace = $state.snapshot(draft.startPlace);
			if (!startPlace) {
				problem = 'Bitte suchen Sie Ihren Startpunkt und tippen Sie ihn in der Liste an.';
				return;
			}
			start = startPlace;
		} else {
			busy = true;
			try {
				start = { name: 'Ihr Standort', lngLat: await currentPosition() };
			} catch (error) {
				problem = error instanceof PositionError ? error.message : 'Ihr Standort ließ sich nicht bestimmen.';
				draft.startMode = 'address';
				return;
			} finally {
				busy = false;
			}
			if (!inRegion(start.lngLat)) {
				problem =
					'Sie sind gerade außerhalb der Testregion (Niederrhein / Düsseldorf). Bitte geben Sie einen Startpunkt in der Region ein.';
				draft.startMode = 'address';
				return;
			}
		}
		// jede Suche mit neuem Zufallswert → jedes Mal andere Runden
		const seed = Math.floor(Math.random() * 2 ** 31);
		session.setRequest({
			start,
			destination: start,
			effort,
			returnMode: 'one-way',
			round: {
				km,
				seed,
				...(draft.wish !== 'any' ? { wish: draft.wish } : {}),
				...(draft.direction !== 'any' ? { heading: Number(draft.direction) } : {})
			}
		});
		goto(resolve('/vorschlaege'));
	}
</script>

<svelte:head>
	<title>Genuss-Radeln – Eine Runde drehen</title>
</svelte:head>

<PageHeader
	large
	image="/teaser.jpg"
	title="Eine schöne Runde drehen"
	lead="Wir finden für Sie die passende Route – entspannt und in Ihrer Nähe."
	backHref={resolve('/')}
	backLabel="Zur Startseite"
/>

<form onsubmit={submit} novalidate>
	<section class="sheet over" aria-labelledby="start-title">
		<h2 id="start-title" class="card-title">
			<MapPin size={30} strokeWidth={2} aria-hidden="true" /> Wo starten Sie?
		</h2>
		<ChoiceGroup
			legend="Wo starten Sie?"
			hideLegend
			name="start"
			columns={2}
			bind:value={draft.startMode}
			choices={[
				{ value: 'here', label: 'Hier, wo ich bin', icon: Navigation },
				{ value: 'address', label: 'An einer Adresse', icon: MapPin }
			]}
		/>
		{#if draft.startMode === 'address'}
			<PlaceSearch label="Startpunkt" placeholder="z. B. Ihre Straße und Hausnummer" bind:value={draft.startPlace} />
		{/if}
	</section>

	<section class="sheet" aria-labelledby="length-title">
		<h2 id="length-title" class="card-title">
			<Waypoints size={30} strokeWidth={2} aria-hidden="true" /> Wie lang soll die Runde sein?
		</h2>
		<ChoiceGroup
			legend="Wie lang soll die Runde sein?"
			hideLegend
			name="length"
			columns={3}
			bind:value={chosenLength, chooseLength}
			{choices}
		/>

		{#if isLong}
			<!-- Mehr als 50 km: genaue Länge mit großen Plus- und Minus-Knöpfen -->
			<div class="stepper" role="group" aria-label="Länge der Runde in Kilometern">
				<button type="button" onclick={() => step(-LONG_STEP)} disabled={km <= LONG_MIN} aria-label="10 Kilometer kürzer">
					<Minus size={30} strokeWidth={3} aria-hidden="true" />
				</button>
				<output aria-live="polite"><strong>{km}</strong> km</output>
				<button type="button" onclick={() => step(LONG_STEP)} disabled={km >= LONG_MAX} aria-label="10 Kilometer länger">
					<Plus size={30} strokeWidth={3} aria-hidden="true" />
				</button>
			</div>
		{/if}

		<p class="note">
			<Clock size={24} strokeWidth={2} aria-hidden="true" />
			<span>{km} km sind gemütlich gefahren ca. {duration}.</span>
		</p>
		{#if isLong}
			<p class="note day">
				<span>Das ist eine Tagestour. Bitte planen Sie Pausen ein und denken Sie an den Akku.</span>
			</p>
		{/if}

	</section>

	<section class="sheet" aria-labelledby="wish-title">
		<h2 id="wish-title" class="card-title">
			<Sparkles size={30} strokeWidth={2} aria-hidden="true" /> Worauf haben Sie Lust?
		</h2>
		<ChoiceGroup legend="Worauf haben Sie Lust?" hideLegend name="wish" columns={2} bind:value={draft.wish} choices={wishes} />

		<!-- Richtung ist freiwillig und deshalb eingeklappt – so bleibt die Seite übersichtlich -->
		<details class="direction">
			<summary>
				<span>Richtung: <strong>{directionLabel}</strong></span>
				<ChevronDown size={24} strokeWidth={2.5} aria-hidden="true" />
			</summary>
			<p class="muted">In welche Richtung soll die Runde von Ihrem Start aus führen?</p>
			<ChoiceGroup
				legend="Richtung der Runde"
				hideLegend
				name="direction"
				columns={3}
				bind:value={draft.direction}
				choices={directions}
			/>
		</details>

		<p class="problem" role="alert">{problem}</p>

		<Button variant="brand" type="submit" icon={Sparkles} trailing={ChevronRight} disabled={busy}>
			{busy ? 'Standort wird bestimmt …' : 'Schöne Runden finden'}
		</Button>
	</section>
</form>

<style>
	/* die erste Karte ragt über den unteren Rand des Titelbilds */
	.over {
		position: relative;
		z-index: 1;
	}

	.card-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0 0 0.875rem;
		font-size: var(--text-large);
		line-height: 1.2;
	}

	.card-title :global(svg) {
		flex: none;
		color: var(--color-green);
	}

	.stepper {
		display: grid;
		grid-template-columns: 4rem 1fr 4rem;
		align-items: center;
		gap: 0.75rem;
		margin: 0 0 1rem;
	}

	.stepper button {
		display: grid;
		place-items: center;
		width: 4rem;
		height: 4rem;
		border: 2px solid var(--color-green);
		border-radius: var(--radius);
		background: var(--color-green-light);
		color: var(--color-green);
		cursor: pointer;
	}

	.stepper button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.stepper button:focus-visible {
		outline: 3px solid var(--color-orange);
		outline-offset: 3px;
	}

	.stepper output {
		text-align: center;
		font-size: var(--text-large);
	}

	.stepper strong {
		font-family: var(--font-title);
		font-size: 2.25rem;
		line-height: 1;
	}

	.note {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin: 0 0 1rem;
		padding: 0.75rem 1rem;
		border-radius: var(--radius);
		background: var(--color-green-light);
		color: var(--color-text);
	}

	.note :global(svg) {
		flex: none;
		color: var(--color-green);
	}

	.direction {
		margin: 0 0 1rem;
	}

	.direction summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 3.5rem;
		padding: 0.5rem 1rem;
		border: 2px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-green);
		font-weight: 700;
		cursor: pointer;
		list-style: none;
	}

	.direction summary::-webkit-details-marker {
		display: none;
	}

	.direction summary:focus-visible {
		outline: 3px solid var(--color-orange);
		outline-offset: 3px;
	}

	.direction[open] summary :global(svg) {
		rotate: 180deg;
	}

	.direction .muted {
		margin: 0.75rem 0;
	}

	.day {
		margin-top: -0.25rem;
		background: var(--color-sun-light);
		font-weight: 700;
	}

	.problem {
		margin: 0 0 1rem;
		color: var(--color-orange-dark);
		font-weight: 700;
	}

	.problem:empty {
		display: none;
	}
</style>
