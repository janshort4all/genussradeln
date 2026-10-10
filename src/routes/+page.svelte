<script lang="ts">
	import { goto } from '$app/navigation';
	import { asset, resolve } from '$app/paths';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import LocateFixed from '@lucide/svelte/icons/locate-fixed';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import Button from '$lib/components/Button.svelte';
	import ChoiceGroup from '$lib/components/ChoiceGroup.svelte';
	import ModeSwitch from '$lib/components/ModeSwitch.svelte';
	import PlaceSearch from '$lib/components/PlaceSearch.svelte';
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
	<title>Genuss-Radeln – Wohin möchten Sie?</title>
</svelte:head>

<ModeSwitch />

<header class="intro">
	<img class="logo" src={asset('/logo.webp')} alt="Genuss-Radeln" width="640" height="640" />
	<h1>Wohin möchten Sie?</h1>
	<p class="lead">Wir bauen Ihnen den schönsten Weg dorthin.</p>
</header>

<form onsubmit={submit} novalidate>
	<PlaceSearch
		label="Ihr Ziel"
		placeholder="z. B. Burg Linn oder eine Adresse"
		hint="Ort, Ausflugsziel oder Adresse eingeben und dann in der Liste antippen."
		bind:value={draft.destination}
		near={draft.startPlace?.lngLat}
		prominent
	/>

	<ChoiceGroup
		legend="Wo starten Sie?"
		name="start"
		bind:value={draft.startMode}
		choices={[
			{ value: 'here', label: 'Hier, wo ich bin', icon: LocateFixed },
			{ value: 'address', label: 'An einer Adresse', icon: MapPin }
		]}
	/>
	{#if draft.startMode === 'address'}
		<PlaceSearch label="Startpunkt" placeholder="z. B. Ihre Straße und Hausnummer" bind:value={draft.startPlace} />
	{/if}

	<ChoiceGroup
		legend="Und zurück?"
		name="return"
		bind:value={draft.returnMode}
		choices={[
			{ value: 'one-way', label: 'Nur hin', icon: ArrowRight },
			{ value: 'other-way', label: 'Hin und zurück als Runde', icon: Undo2 }
		]}
	/>

	<p class="problem" role="alert">{problem}</p>

	<Button variant="primary" type="submit" icon={Sparkles} disabled={busy}>
		{busy ? 'Standort wird bestimmt …' : 'Schönsten Weg finden'}
	</Button>
</form>

<style>
	.intro {
		margin-bottom: 1.5rem;
	}

	/* Logo-Hintergrund ist dieselbe Creme-Farbe wie die Seite → wirkt randlos */
	.logo {
		display: block;
		width: min(9rem, 45%);
		height: auto;
		margin: 0 auto 0.5rem;
	}

	.lead {
		color: var(--color-text-muted);
		margin: 0;
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
