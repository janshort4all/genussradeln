<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Flag from '@lucide/svelte/icons/flag';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Navigation from '@lucide/svelte/icons/navigation';
	import Repeat from '@lucide/svelte/icons/repeat';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import ChoiceGroup from '$lib/components/ChoiceGroup.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PlaceSearch from '$lib/components/PlaceSearch.svelte';
	import StepHeader from '$lib/components/StepHeader.svelte';
	import { distance } from '$lib/geo/geo';
	import { currentPosition, PositionError } from '$lib/geo/position';
	import { inRegion } from '$lib/geocode/photon';
	import type { Effort } from '$lib/routing/graphhopper';
	import type { Place, ReturnMode } from '$lib/tour/model';
	import { draft } from '$lib/tour/draft.svelte';
	import { session } from '$lib/tour/session.svelte';

	// Zieltour-Wunsch (F1, F3). Die Eingaben liegen im gemeinsamen Zwischenspeicher (draft) – beim Wechsel zu
	// „Eine Runde“ und zurück bleiben Start und Ziel stehen.
	// Anstrengung fragen wir nicht mehr (Wunsch Jan): Länge und Steigung zeigen die Vorschläge.
	// Gerechnet wird gemütlich – 15 km/h für die Fahrzeit, steile Stücke werden gemieden.
	const effort: Effort = 'easy';

	let busy = $state(false);
	let problem = $state('');

	// Der Knopf unten bleibt beim Scrollen stehen und zeigt, was gewählt ist („nach Burg Linn · nur hin“) – wie bei „Eine schöne Runde drehen“
	const summary = $derived(
		[draft.destination ? `nach ${draft.destination.name}` : 'Ziel noch offen', draft.returnMode === 'one-way' ? 'nur hin' : 'hin und zurück'].join(' · ')
	);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		problem = '';
		const destination = $state.snapshot(draft.destination);
		const startMode = draft.startMode;
		const returnMode = draft.returnMode;
		if (!destination) {
			problem = 'Bitte suchen Sie zuerst Ihr Ziel und tippen Sie es in der Liste an.';
			return;
		}
		let start: Place;
		if (startMode === 'address') {
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
		if (distance(start.lngLat, destination.lngLat) < 300) {
			problem = 'Start und Ziel liegen sehr nah beieinander. Bitte wählen Sie ein anderes Ziel.';
			return;
		}
		session.setRequest({ start, destination, effort, returnMode });
		goto(resolve('/vorschlaege'));
	}
</script>

<svelte:head>
	<title>Genuss-Radeln – Zu einem Ziel</title>
</svelte:head>

<PageHeader
	title="Wohin möchten Sie?"
	lead="Wir bauen den schönsten Weg."
	image="/ziel.jpg"
	backHref={resolve('/')}
	backLabel="Zur Startseite"
/>

<form onsubmit={submit} novalidate>
	<section class="sheet over" aria-labelledby="goal-title">
		<StepHeader id="goal-title" number={1} icon={Flag} title="Wohin soll es gehen?" />
		<PlaceSearch
			label="Ziel"
			placeholder="z. B. Burg Linn"
			bind:value={draft.destination}
			near={draft.startPlace?.lngLat}
		/>
	</section>

	<section class="sheet" aria-labelledby="start-title">
		<StepHeader id="start-title" number={2} icon={MapPin} title="Wo starten Sie?" />
		<ChoiceGroup
			legend="Wo starten Sie?"
			hideLegend
			name="start"
			columns={2}
			bind:value={draft.startMode}
			choices={[
				{ value: 'here', label: 'Hier, wo\nich bin', icon: Navigation },
				{ value: 'address', label: 'An einer\nAdresse', icon: MapPin }
			]}
		/>
		{#if draft.startMode === 'address'}
			<PlaceSearch label="Startpunkt" placeholder="z. B. Ihre Straße und Hausnummer" bind:value={draft.startPlace} />
		{/if}
	</section>

	<section class="sheet" aria-labelledby="return-title">
		<StepHeader id="return-title" number={3} icon={Repeat} title="Und zurück?" />
		<ChoiceGroup
			legend="Und zurück?"
			hideLegend
			name="return"
			columns={2}
			bind:value={draft.returnMode}
			choices={[
				{ value: 'one-way', label: 'Nur hin\n\u00a0', icon: ArrowRight },
				{ value: 'other-way', label: 'Hin und zurück\nals Runde', icon: Repeat }
			]}
		/>
	</section>

	<!-- Knopf bleibt beim Scrollen unten über der Leiste stehen (wie auf „Eine schöne Runde drehen“); die Fehlermeldung steht im selben Block -->
	<div class="cta">
		<p class="problem" role="alert">{problem}</p>

		<button type="submit" class="find" disabled={busy}>
			<Sparkles size={26} strokeWidth={2.25} aria-hidden="true" />
			<span class="find-text">
				<strong>{busy ? 'Standort wird bestimmt …' : 'Schönsten Weg finden'}</strong>
				<span>{summary}</span>
			</span>
			<span class="trailing" aria-hidden="true"><ChevronRight size={28} strokeWidth={2.5} /></span>
		</button>
	</div>
</form>

<style>
	/* die erste Karte ragt über den unteren Rand des Titelbilds */
	.over {
		position: relative;
		z-index: 1;
	}

	/* festgesetzt: bleibt beim Scrollen knapp über der unteren Leiste sichtbar (gleich wie „Eine schöne Runde drehen“) */
	.cta {
		position: sticky;
		bottom: calc(var(--bottom-bar-height) + env(safe-area-inset-bottom));
		z-index: 5;
		margin: 0 -1rem 1rem;
		padding: 0.625rem 1rem;
		background: var(--color-bg);
		border-top: 1px solid var(--color-border);
	}

	.cta .problem {
		margin-bottom: 0.5rem;
	}

	.find-text {
		display: grid;
		justify-items: center;
		gap: 0.0625rem;
		min-width: 0;
	}

	.find-text span {
		font-size: var(--text-small);
		font-weight: 400;
		color: #fff;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.problem {
		margin: 0 0 1rem;
		color: var(--color-orange-dark);
		font-weight: 700;
	}

	.problem:empty {
		display: none;
	}

	/* Hauptknopf: Terrakotta wie jede Hauptaktion – weiße Schrift 5 : 1 */
	.find {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 4.25rem;
		padding: 0.5rem 3rem 0.5rem 1rem;
		border: 2px solid transparent;
		border-radius: var(--radius);
		background: var(--color-orange);
		box-shadow: 0 3px 0 var(--color-orange-dark);
		color: #fff;
		font-family: var(--font-text);
		font-size: var(--text-large);
		font-weight: 700;
		line-height: 1.25;
		cursor: pointer;
	}

	.find:hover {
		background: var(--color-orange-dark);
	}

	.find:focus-visible {
		outline: 3px solid var(--color-green);
		outline-offset: 3px;
	}

	.find:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.find :global(svg) {
		flex: none;
	}

	.trailing {
		position: absolute;
		right: 1rem;
		display: grid;
		place-items: center;
	}
</style>
