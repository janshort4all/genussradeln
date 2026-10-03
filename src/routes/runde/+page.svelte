<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Binoculars from '@lucide/svelte/icons/binoculars';
	import Clock3 from '@lucide/svelte/icons/clock-3';
	import Feather from '@lucide/svelte/icons/feather';
	import LocateFixed from '@lucide/svelte/icons/locate-fixed';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Mic from '@lucide/svelte/icons/mic';
	import Route from '@lucide/svelte/icons/route';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Sprout from '@lucide/svelte/icons/sprout';
	import Sun from '@lucide/svelte/icons/sun';
	import Timer from '@lucide/svelte/icons/timer';
	import Trees from '@lucide/svelte/icons/trees';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import WavesHorizontal from '@lucide/svelte/icons/waves-horizontal';
	import BackLink from '$lib/components/BackLink.svelte';
	import Button from '$lib/components/Button.svelte';
	import ChoiceGroup from '$lib/components/ChoiceGroup.svelte';

	// Rundtour-Wunsch (F2, F5) – wird in M5 an die Rundtour-Berechnung übergeben; bis dahin Beispieltouren
	let start = $state('here');
	let address = $state('');
	let measure = $state<'duration' | 'distance'>('duration');
	let duration = $state('2h');
	let distance = $state('30');
	let effort = $state('easy');
	let landscape = $state<string[]>(['green']);
	let freeText = $state('');

	function submit(event: SubmitEvent) {
		event.preventDefault();
		goto(resolve('/runde/vorschlaege'));
	}
</script>

<svelte:head>
	<title>Genuss-Radeln – Eine Runde drehen</title>
</svelte:head>

<BackLink href={resolve('/')} label="Zur Zielsuche" />

<header class="intro">
	<h1>Eine schöne Runde drehen</h1>
	<p class="lead">
		Rundtouren berechnet die App in einem späteren Schritt. Bis dahin sehen Sie hier Beispiele.
	</p>
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

	<Button variant="primary" type="submit" icon={Sparkles}>Beispiel-Runden zeigen</Button>
</form>

<style>
	.intro {
		margin-bottom: 1.5rem;
	}

	.lead {
		color: var(--color-text-muted);
		margin: 0;
	}

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
		color: var(--color-olive);
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
