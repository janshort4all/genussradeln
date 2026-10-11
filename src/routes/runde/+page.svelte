<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Check from '@lucide/svelte/icons/check';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Dices from '@lucide/svelte/icons/dices';
	import Heart from '@lucide/svelte/icons/heart';
	import InfinityIcon from '@lucide/svelte/icons/infinity';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Minus from '@lucide/svelte/icons/minus';
	import Navigation from '@lucide/svelte/icons/navigation';
	import Plus from '@lucide/svelte/icons/plus';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Trees from '@lucide/svelte/icons/trees';
	import Waves from '@lucide/svelte/icons/waves';
	import Waypoints from '@lucide/svelte/icons/waypoints';
	import Wheat from '@lucide/svelte/icons/wheat';
	import ChoiceGroup from '$lib/components/ChoiceGroup.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PlaceSearch from '$lib/components/PlaceSearch.svelte';
	import type { SceneKind } from '$lib/components/Scene.svelte';
	import StepHeader from '$lib/components/StepHeader.svelte';
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
	// Aufbau nach dem Entwurf von Jan (14.10.2026): vier nummerierte Schritte mit Bildkacheln.
	const effort: Effort = 'easy';

	/** Auswahl bis 50 km als Kacheln; darüber „Länger“ mit Plus und Minus (Tagestouren) */
	const LENGTHS = [10, 15, 20, 30, 40, 50];
	const LONG_MIN = 60;
	const LONG_MAX = 150;
	const LONG_STEP = 10;
	const LONG_START = 70;
	const SCENES: Record<number, SceneKind> = { 10: 'bench', 15: 'hills', 20: 'meadow', 30: 'forest', 40: 'river', 50: 'trail' };
	const choices = [
		...LENGTHS.map((value) => ({
			value: String(value),
			label: `${value} km`,
			// Fahrzeit auf der Kachel, gemütlich gefahren – ein Richtwert
			// (feste Leerzeichen: „40 Min.“ bricht nicht mitten auseinander)
			sub: `ca. ${formatDuration(rideMinutes(value * 1000, 0, effort)).replace(/(\d) (Std\.|Min\.)/g, '$1 $2')}`,
			art: SCENES[value]
		})),
		{ value: 'more', label: 'Länger als 50 km', icon: InfinityIcon, wide: true, chevron: true }
	];

	/** „Worauf haben Sie Lust?“ – die App sucht die Runde dann mehr am Wasser, im Wald oder durch Felder und Dörfer */
	const wishes = [
		{ value: 'water', label: 'Am Wasser', icon: Waves, art: 'water' as SceneKind, photo: true },
		{ value: 'forest', label: 'Durch den Wald', icon: Trees, art: 'woods' as SceneKind, photo: true },
		{ value: 'fields', label: 'Durch Felder und Dörfer', icon: Wheat, art: 'fields' as SceneKind, photo: true },
		{ value: 'any', label: 'Überrasche mich', icon: Dices, tall: true }
	];

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
			round: { km, seed, ...(draft.wish !== 'any' ? { wish: draft.wish } : {}) }
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
		<StepHeader
			id="start-title"
			number={1}
			icon={MapPin}
			title="Wo starten Sie?"
			hint="Wählen Sie Ihren Startpunkt."
		/>
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
		{:else}
			<p class="hint">Beim Suchen fragt Ihr Handy kurz, ob die App Ihren Standort nutzen darf – bitte mit „Erlauben“ antworten.</p>
		{/if}
	</section>

	<section class="sheet" aria-labelledby="length-title">
		<StepHeader
			id="length-title"
			number={2}
			icon={Waypoints}
			title="Wie lang soll die Runde sein?"
			hint="Wählen Sie eine ungefähre Länge."
		/>
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
			<p class="note">
				<span>{km} km sind gemütlich gefahren ca. {duration}. Das ist eine Tagestour – bitte planen Sie Pausen ein und denken Sie an den Akku.</span>
			</p>
		{/if}
	</section>

	<section class="sheet" aria-labelledby="wish-title">
		<StepHeader
			id="wish-title"
			number={3}
			icon={Heart}
			title="Worauf haben Sie Lust?"
			hint="Wählen Sie, was Ihnen gefällt."
		/>
		<ChoiceGroup legend="Worauf haben Sie Lust?" hideLegend name="wish" columns={2} bind:value={draft.wish} choices={wishes} />
	</section>

	<!-- Schluss: gleich der Knopf, ohne eigene Karte mit demselben Titel (Marketing-Prüfung, 14.10.2026) – weniger Scrollen, ein klarer Schritt -->
	<div class="finish">
		<p class="problem" role="alert">{problem}</p>

		<button type="submit" class="find" disabled={busy}>
			<!-- sanfte Hügel am unteren Rand, nur Schmuck – bewusst nichts hinter Symbol und Schrift -->
			<svg class="find-art" viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
				<path d="M0 52 Q50 44 100 51 T200 50 T300 49 V60 H0 Z" fill="#8e4425" opacity="0.55" />
			</svg>
			<Sparkles size={26} strokeWidth={2.25} aria-hidden="true" />
			<span>{busy ? 'Standort wird bestimmt …' : 'Schöne Runden finden'}</span>
			<span class="trailing" aria-hidden="true"><ChevronRight size={28} strokeWidth={2.5} /></span>
		</button>
		<p class="reassure">
			<Check size={22} strokeWidth={3} aria-hidden="true" />
			<span><strong>Kostenlos und ohne Anmeldung.</strong><br />Die Ergebnisse wählen Sie danach in Ruhe aus.</span>
		</p>
	</div>
</form>

<style>
	/* die erste Karte ragt über den unteren Rand des Titelbilds */
	.over {
		position: relative;
		z-index: 1;
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
		margin: 0 0 0.5rem;
		padding: 0.75rem 1rem;
		border-radius: var(--radius);
		background: var(--color-sun-light);
		color: var(--color-text);
		font-weight: 700;
	}

	/* Hinweis unter „Hier, wo ich bin“ */
	.hint {
		margin: 0 0 0.25rem;
		color: var(--color-text-muted);
		text-wrap: pretty;
	}

	.finish {
		margin: 0 0 1.5rem;
	}

	.reassure {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		gap: 0.5rem;
		margin: 0.875rem 0.5rem 0;
		color: var(--color-text);
		text-align: left;
		text-wrap: pretty;
	}

	.reassure :global(svg) {
		flex: none;
		margin-top: 0.1875rem;
		color: var(--color-green);
	}

	.problem {
		margin: 0 0 1rem;
		color: var(--color-orange-dark);
		font-weight: 700;
	}

	.problem:empty {
		display: none;
	}

	/* Hauptknopf: Terrakotta wie jede Hauptaktion (Jan, 14.10.2026: ging in Dunkelgrün unter) – weiße Schrift 5 : 1 */
	.find {
		position: relative;
		isolation: isolate;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 4.5rem;
		padding: 0.75rem 3rem 0.75rem 1rem;
		overflow: hidden;
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

	.find-art {
		position: absolute;
		inset: 0;
		z-index: -1;
		width: 100%;
		height: 100%;
	}

	.find :global(svg:not(.find-art)) {
		flex: none;
	}

	.trailing {
		position: absolute;
		right: 1rem;
		display: grid;
		place-items: center;
	}
</style>
