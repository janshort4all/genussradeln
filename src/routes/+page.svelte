<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/components/Button.svelte';
	import ChoiceGroup from '$lib/components/ChoiceGroup.svelte';

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
	<p class="brand">Genuss-Radeln</p>
	<h1>Worauf haben Sie heute Lust?</h1>
</header>

<form onsubmit={submit}>
	<ChoiceGroup
		legend="Wo starten Sie?"
		name="start"
		bind:value={start}
		choices={[
			{ value: 'here', label: 'Hier, wo ich bin' },
			{ value: 'address', label: 'An einer Adresse' }
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
			{ value: 'round', label: 'Rundtour' },
			{ value: 'destination', label: 'Zu einem Ziel' }
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
				{ value: '1h', label: '1 Std.' },
				{ value: '2h', label: '2 Std.' },
				{ value: 'half-day', label: 'Halber Tag' }
			]}
		/>
	{:else}
		<ChoiceGroup
			legend="Wie weit möchten Sie fahren?"
			name="distance"
			bind:value={distance}
			choices={[
				{ value: '15', label: '15 km' },
				{ value: '30', label: '30 km' },
				{ value: '50', label: '50 km' }
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
			{ value: 'easy', label: 'Gemütlich' },
			{ value: 'sporty', label: 'Sportlicher' }
		]}
	/>

	<ChoiceGroup
		legend="Was möchten Sie sehen? (mehrere möglich)"
		name="landscape"
		multiple
		bind:value={landscape}
		choices={[
			{ value: 'green', label: 'Grün' },
			{ value: 'water', label: 'Wasser' },
			{ value: 'forest', label: 'Wald' },
			{ value: 'view', label: 'Aussicht' }
		]}
	/>

	<label class="field">
		<span class="field-label">Oder sagen Sie es in eigenen Worten</span>
		<textarea rows="2" bind:value={freeText} placeholder="z. B. 20 km durchs Grüne zum Biergarten"></textarea>
		<span class="field-hint">Tipp: Tippen Sie auf das Mikrofon Ihrer Tastatur und sprechen Sie einfach.</span>
	</label>

	<Button variant="primary" type="submit">Touren vorschlagen</Button>
</form>

<style>
	.intro {
		padding-top: 1rem;
		margin-bottom: 1.25rem;
	}

	.brand {
		margin: 0 0 0.25rem;
		font-family: var(--font-title);
		font-weight: 700;
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
