<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import LocateFixed from '@lucide/svelte/icons/locate-fixed';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Route from '@lucide/svelte/icons/route';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import BackLink from '$lib/components/BackLink.svelte';
	import Button from '$lib/components/Button.svelte';
	import ChoiceGroup from '$lib/components/ChoiceGroup.svelte';
	import PlaceSearch from '$lib/components/PlaceSearch.svelte';
	import { currentPosition, PositionError } from '$lib/geo/position';
	import { inRegion } from '$lib/geocode/photon';
	import type { Effort } from '$lib/routing/graphhopper';
	import { rideMinutes } from '$lib/tour/duration';
	import type { Place } from '$lib/tour/model';
	import { formatDuration } from '$lib/tour/sample';
	import { session } from '$lib/tour/session.svelte';

	// Rundtour-Wunsch (F2): Start und Länge – die App schlägt fünf schöne Runden vor, bei jeder Suche andere.
	const last = session.request?.round ? session.request : undefined;
	let startMode: 'here' | 'address' = $state(last && last.start.name !== 'Ihr Standort' ? 'address' : 'here');
	let startPlace: Place | undefined = $state(last && last.start.name !== 'Ihr Standort' ? last.start : undefined);
	let km = $state(String(last?.round?.km ?? 20));
	const effort: Effort = 'easy';

	const LENGTHS = [10, 15, 20, 30, 40, 50];
	const choices = LENGTHS.map((value) => ({ value: String(value), label: `${value} km`, icon: Route }));
	const duration = $derived(formatDuration(rideMinutes(Number(km) * 1000, 0, effort)));

	let busy = $state(false);
	let problem = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		problem = '';
		let start: Place;
		if (startMode === 'address') {
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
				startMode = 'address';
				return;
			} finally {
				busy = false;
			}
			if (!inRegion(start.lngLat)) {
				problem =
					'Sie sind gerade außerhalb der Testregion (Niederrhein / Düsseldorf). Bitte geben Sie einen Startpunkt in der Region ein.';
				startMode = 'address';
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
			round: { km: Number(km), seed }
		});
		goto(resolve('/vorschlaege'));
	}
</script>

<svelte:head>
	<title>Genuss-Radeln – Eine Runde drehen</title>
</svelte:head>

<BackLink href={resolve('/')} label="Zur Zielsuche" />

<header class="intro">
	<h1>Eine schöne Runde drehen</h1>
	<p class="lead">Wir schlagen Ihnen bis zu fünf schöne Runden vor – bei jeder Suche neue.</p>
</header>

<form onsubmit={submit} novalidate>
	<ChoiceGroup
		legend="Wo starten Sie?"
		name="start"
		bind:value={startMode}
		choices={[
			{ value: 'here', label: 'Hier, wo ich bin', icon: LocateFixed },
			{ value: 'address', label: 'An einer Adresse', icon: MapPin }
		]}
	/>
	{#if startMode === 'address'}
		<PlaceSearch label="Startpunkt" placeholder="z. B. Ihre Straße und Hausnummer" bind:value={startPlace} />
	{/if}

	<ChoiceGroup legend="Wie lang soll die Runde sein?" name="length" bind:value={km} {choices} />
	<p class="duration muted">{km} km sind gemütlich gefahren ca. {duration}.</p>

	<p class="problem" role="alert">{problem}</p>

	<Button variant="primary" type="submit" icon={Sparkles} disabled={busy}>
		{busy ? 'Standort wird bestimmt …' : 'Schöne Runden finden'}
	</Button>
</form>

<style>
	.intro {
		margin-bottom: 1.5rem;
	}

	.lead {
		color: var(--color-text-muted);
		margin: 0;
	}

	.duration {
		margin: -0.5rem 0 1.5rem;
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
