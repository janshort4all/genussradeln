<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Bike from '@lucide/svelte/icons/bike';
	import Binoculars from '@lucide/svelte/icons/binoculars';
	import Clock3 from '@lucide/svelte/icons/clock-3';
	import Feather from '@lucide/svelte/icons/feather';
	import Flag from '@lucide/svelte/icons/flag';
	import LocateFixed from '@lucide/svelte/icons/locate-fixed';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Mic from '@lucide/svelte/icons/mic';
	import Repeat from '@lucide/svelte/icons/repeat';
	import Route from '@lucide/svelte/icons/route';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Sprout from '@lucide/svelte/icons/sprout';
	import Sun from '@lucide/svelte/icons/sun';
	import Timer from '@lucide/svelte/icons/timer';
	import Trees from '@lucide/svelte/icons/trees';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import WavesHorizontal from '@lucide/svelte/icons/waves-horizontal';
	import Button from '$lib/components/Button.svelte';
	import ChoiceGroup from '$lib/components/ChoiceGroup.svelte';
	import HeroLandscape from '$lib/components/illustrations/HeroLandscape.svelte';

	// Tourwunsch (F1, F2, F3, F5) – wird ab M2 an die Tourberechnung übergeben
	let start = $state('here');
	let address = $state('');
	let tourType = $state('round');
	let destination = $state('');
	let returnWay = $state('other-way');
	let measure = $state<'duration' | 'distance'>('duration');
	let duration = $state('2h');
	let distance = $state('30');
	let effort = $state('easy');
	let landscape = $state<string[]>(['green']);
	let freeText = $state('');

	function submit(event: SubmitEvent) {
		event.preventDefault();
		goto(resolve('/vorschlaege'));
	}
</script>

<svelte:head>
	<title>Genuss-Radeln – Tour finden</title>
</svelte:head>

<header class="intro">
	<div class="hero">
		<HeroLandscape />
		<p class="brand"><Bike size={26} strokeWidth={2.25} aria-hidden="true" /> Genuss-Radeln</p>
	</div>
	<h1>Worauf haben Sie heute Lust?</h1>
	<p class="lead">Sagen Sie uns Ihren Wunsch – wir schlagen Ihnen drei schöne Touren vor.</p>
</header>

<form onsubmit={submit}>
	<ChoiceGroup
		legend="Wo starten Sie?"
		name="start"
		bind:value={start}
		choices={[
			{ value: 'here', label: 'Hier, wo ich bin', icon: LocateFixed },
			{ value: 'address', label: 'An einer Adresse', icon: MapPin }
		]}
	/>
	{#if start === 'address'}
		<label class="field">
			<span class="field-label">Adresse oder Ort</span>
			<input type="text" bind:value={address} placeholder="z. B. Duisburg-Baerl" autocomplete="street-address" />
		</label>
	{/if}

	<ChoiceGroup
		legend="Was für eine Tour?"
		name="tour-type"
		bind:value={tourType}
		choices={[
			{ value: 'round', label: 'Rundtour', icon: Repeat },
			{ value: 'destination', label: 'Zu einem Ziel', icon: Flag }
		]}
	/>
	{#if tourType === 'destination'}
		<label class="field">
			<span class="field-label">Wohin möchten Sie?</span>
			<input type="text" bind:value={destination} placeholder="z. B. ein Biergarten" />
			<span class="field-hint">Eine Art von Ort („ein Café“) oder ein bestimmter Ort („Biergarten am See“).</span>
		</label>
		<ChoiceGroup
			legend="Und zurück?"
			name="return-way"
			bind:value={returnWay}
			choices={[
				{ value: 'other-way', label: 'Auf anderem Weg zurück' },
				{ value: 'one-way', label: 'Nur hin' }
			]}
		/>
	{/if}

	{#if measure === 'duration'}
		<ChoiceGroup
			legend="Wie lange möchten Sie fahren?"
			name="duration"
			bind:value={duration}
			choices={[
				{ value: '1h', label: '1 Std.', icon: Timer },
				{ value: '2h', label: '2 Std.', icon: Clock3 },
				{ value: 'half-day', label: 'Halber Tag', icon: Sun }
			]}
		/>
	{:else}
		<ChoiceGroup
			legend="Wie weit möchten Sie fahren?"
			name="distance"
			bind:value={distance}
			choices={[
				{ value: '15', label: '15 km', icon: Route },
				{ value: '30', label: '30 km', icon: Route },
				{ value: '50', label: '50 km', icon: Route }
			]}
		/>
	{/if}
	<button
		type="button"
		class="switch-measure"
		onclick={() => (measure = measure === 'duration' ? 'distance' : 'duration')}
	>
		{measure === 'duration' ? 'Lieber in Kilometern angeben' : 'Lieber als Dauer angeben'}
	</button>

	<ChoiceGroup
		legend="Wie anstrengend?"
		name="effort"
		bind:value={effort}
		choices={[
			{ value: 'easy', label: 'Gemütlich', icon: Feather },
			{ value: 'sporty', label: 'Sportlicher', icon: TrendingUp }
		]}
	/>

	<ChoiceGroup
		legend="Was möchten Sie sehen? (mehrere möglich)"
		name="landscape"
		multiple
		bind:value={landscape}
		choices={[
			{ value: 'green', label: 'Grün', icon: Sprout },
			{ value: 'water', label: 'Wasser', icon: WavesHorizontal },
			{ value: 'forest', label: 'Wald', icon: Trees },
			{ value: 'view', label: 'Aussicht', icon: Binoculars }
		]}
	/>

	<label class="field free-text">
		<span class="field-label">Oder sagen Sie es in eigenen Worten</span>
		<textarea rows="2" bind:value={freeText} placeholder="z. B. 20 km durchs Grüne zum Biergarten"></textarea>
		<span class="field-hint mic-hint">
			<Mic size={20} aria-hidden="true" />
			Tipp: Tippen Sie auf das Mikrofon Ihrer Tastatur und sprechen Sie einfach.
		</span>
	</label>

	<Button variant="primary" type="submit" icon={Sparkles}>Touren vorschlagen</Button>
</form>

<style>
	.intro {
		margin-bottom: 1.5rem;
	}

	/* Titelbild bis an den Bildschirmrand, unten sanft abgerundet */
	.hero {
		position: relative;
		height: 11.5rem;
		margin: -0.5rem -1rem 1.25rem;
		border-radius: 0 0 1.5rem 1.5rem;
		overflow: hidden;
	}

	.brand {
		position: absolute;
		top: 0.875rem;
		left: 1rem;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0.25rem 0.875rem 0.25rem 0.625rem;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.85);
		font-family: var(--font-title);
		font-size: var(--text-large);
		font-weight: 700;
		color: var(--color-green);
	}

	.lead {
		color: var(--color-text-muted);
		margin: 0;
	}

	/* Freitext als eigener, leicht hervorgehobener Bereich */
	.free-text {
		padding: 1rem;
		border-radius: var(--radius);
		background: var(--color-green-light);
	}

	.mic-hint {
		display: flex;
		align-items: flex-start;
		gap: 0.375rem;
	}

	.mic-hint :global(svg) {
		flex: none;
		margin-top: 0.15em;
		color: var(--color-green);
	}

	.switch-measure {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		margin: -1rem 0 1.25rem;
		padding: 0.5rem 0;
		border: 0;
		background: none;
		color: var(--color-green);
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 0.15em;
		cursor: pointer;
	}
</style>
