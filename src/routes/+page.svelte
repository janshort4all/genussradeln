<script lang="ts">
	import { goto } from '$app/navigation';
	import { asset, resolve } from '$app/paths';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Feather from '@lucide/svelte/icons/feather';
	import LocateFixed from '@lucide/svelte/icons/locate-fixed';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Repeat from '@lucide/svelte/icons/repeat';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Sprout from '@lucide/svelte/icons/sprout';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import Button from '$lib/components/Button.svelte';
	import ChoiceGroup from '$lib/components/ChoiceGroup.svelte';
	import PlaceSearch from '$lib/components/PlaceSearch.svelte';
	import { distance } from '$lib/geo/geo';
	import { currentPosition, PositionError } from '$lib/geo/position';
	import { inRegion } from '$lib/geocode/photon';
	import type { Effort } from '$lib/routing/graphhopper';
	import type { DetourLevel } from '$lib/scoring/weights';
	import type { Place, ReturnMode } from '$lib/tour/model';
	import { session } from '$lib/tour/session.svelte';

	// Zieltour-Wunsch (F1, F3). Vorbelegt mit dem letzten Wunsch, falls man zurückkommt.
	const last = session.request;
	let destination: Place | undefined = $state(last?.destination);
	let startMode: 'here' | 'address' = $state(last && last.start.name !== 'Ihr Standort' ? 'address' : 'here');
	let startPlace: Place | undefined = $state(last && last.start.name !== 'Ihr Standort' ? last.start : undefined);
	let detour: DetourLevel = $state(last?.detour ?? 'nicer');
	let returnMode: ReturnMode = $state(last?.returnMode ?? 'one-way');
	let effort: Effort = $state(last?.effort ?? 'easy');

	let busy = $state(false);
	let problem = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		problem = '';
		if (!destination) {
			problem = 'Bitte suchen Sie zuerst Ihr Ziel und tippen Sie es in der Liste an.';
			return;
		}
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
		if (distance(start.lngLat, destination.lngLat) < 300) {
			problem = 'Start und Ziel liegen sehr nah beieinander. Bitte wählen Sie ein anderes Ziel.';
			return;
		}
		session.setRequest({ start, destination, detour, effort, returnMode });
		goto(resolve('/vorschlaege'));
	}
</script>

<svelte:head>
	<title>Genuss-Radeln – Wohin möchten Sie?</title>
</svelte:head>

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
		bind:value={destination}
		near={startPlace?.lngLat}
		prominent
	/>

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

	<ChoiceGroup
		legend="Wie viel Umweg für mehr Schönheit?"
		name="detour"
		bind:value={detour}
		choices={[
			{ value: 'direct', label: 'Direkt', icon: ArrowRight },
			{ value: 'nicer', label: 'Etwas schöner', icon: Sprout },
			{ value: 'nicest', label: 'Am schönsten', icon: Sparkles }
		]}
	/>

	<ChoiceGroup
		legend="Und zurück?"
		name="return"
		bind:value={returnMode}
		choices={[
			{ value: 'one-way', label: 'Nur hin', icon: ArrowRight },
			{ value: 'other-way', label: 'Auf anderem Weg zurück', icon: Undo2 }
		]}
	/>

	<ChoiceGroup
		legend="Wie anstrengend?"
		name="effort"
		bind:value={effort}
		choices={[
			{ value: 'easy', label: 'Gemütlich', icon: Feather },
			{ value: 'sporty', label: 'Sportlicher', icon: TrendingUp }
		]}
	/>

	<p class="problem" role="alert">{problem}</p>

	<Button variant="primary" type="submit" icon={Sparkles} disabled={busy}>
		{busy ? 'Standort wird bestimmt …' : 'Schönsten Weg finden'}
	</Button>
</form>

<aside class="round-trip">
	<p>Kein bestimmtes Ziel?</p>
	<a href={resolve('/runde')}>
		<Repeat size={22} aria-hidden="true" />
		Einfach eine schöne Runde drehen
	</a>
</aside>

<style>
	.intro {
		margin-bottom: 1.5rem;
	}

	/* Logo-Hintergrund ist dieselbe Creme-Farbe wie die Seite → wirkt randlos */
	.logo {
		display: block;
		width: min(13rem, 60%);
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

	.round-trip {
		margin-top: 2rem;
		padding: 1rem 1.125rem;
		border-radius: var(--radius);
		background: var(--color-green-light);
	}

	.round-trip p {
		margin: 0 0 0.25rem;
		color: var(--color-text-muted);
	}

	.round-trip a {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: var(--tap);
		color: var(--color-green);
		font-weight: 700;
	}
</style>
