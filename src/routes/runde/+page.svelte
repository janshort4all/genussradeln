<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
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
			// Fahrzeit auf der Kachel, gemütlich gefahren – immer in einer Zeile, in der Schreibweise der Tour-Seite („40 Min.“, „1:20 Std.“)
			sub: clockText(rideMinutes(value * 1000, 0, effort)),
			art: SCENES[value]
		})),
		{ value: 'more', label: 'Länger als 50 km', icon: InfinityIcon, wide: true, chevron: true }
	];

	/** „Worauf haben Sie Lust?“ – die App sucht die Runde dann mehr am Wasser, im Wald oder durch Felder und Dörfer */
	const wishes = [
		{ value: 'water', label: 'Am\nWasser', icon: Waves, art: 'water' as SceneKind, photo: true },
		{ value: 'forest', label: 'Durch den\nWald', icon: Trees, art: 'woods' as SceneKind, photo: true },
		{ value: 'fields', label: 'Durch Felder\nund Dörfer', icon: Wheat, art: 'fields' as SceneKind, photo: true },
		{ value: 'any', label: 'Überrasche\nmich', icon: Dices, tall: true }
	];

	/** „1:20 Std.“ bzw. „40 Min.“ (auf 5 Minuten gerundet) – wie auf der Tour-Seite */
	function clockText(minutes: number): string {
		const rounded = Math.round(minutes / 5) * 5;
		const hours = Math.floor(rounded / 60);
		const rest = rounded % 60;
		return hours ? `${hours}:${String(rest).padStart(2, '0')} Std.` : `${rest} Min.`;
	}

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

	// Der Knopf unten bleibt beim Scrollen stehen und zeigt in einer zweiten Zeile, was gewählt ist („20 km · überrasche mich“): Wer ihn früh
	// drückt, sieht, dass es Länge und Wunsch gibt – ohne zusätzlichen Hinweistext (Jan, 14.10.2026: der Hinweis über dem Knopf sah schlecht aus).
	const WISH_WORDS = { water: 'am Wasser', forest: 'durch den Wald', fields: 'durch Felder und Dörfer', any: 'überrasche mich' } as const;

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
	title="Eine schöne Runde drehen"
	lead="Entspannt und in Ihrer Nähe."
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
		/>
		<ChoiceGroup
			legend="Wo starten Sie?"
			hideLegend
			name="start"
			columns={2}
			bind:value={draft.startMode}
			choices={[
				// feste Zeilenumbrüche: beide Kacheln gleich aufgebaut (zwei Zeilen)
				{ value: 'here', label: 'Hier, wo\nich bin', icon: Navigation },
				{ value: 'address', label: 'An einer\nAdresse', icon: MapPin }
			]}
		/>
		{#if draft.startMode === 'address'}
			<PlaceSearch label="Startpunkt" placeholder="z. B. Ihre Straße und Hausnummer" bind:value={draft.startPlace} />
		{/if}
	</section>

	<section class="sheet" aria-labelledby="length-title">
		<StepHeader
			id="length-title"
			number={2}
			icon={Waypoints}
			title="Wie lang soll die Runde sein?"
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
		/>
		<ChoiceGroup legend="Worauf haben Sie Lust?" hideLegend name="wish" columns={2} bind:value={draft.wish} choices={wishes} />
	</section>

	<!-- Schluss: gleich der Knopf, ohne eigene Karte mit demselben Titel (Marketing-Prüfung, 14.10.2026) – weniger Scrollen, ein klarer Schritt.
	     Der Knopf bleibt beim Scrollen unten über der Leiste stehen (Jan: „festsetzen“); er muss dafür direkt im Formular sitzen, nicht in einem
	     kleinen Block am Seitenende. Die Fehlermeldung steht im selben Block, damit sie nicht außer Sicht erscheint. -->
	<div class="cta">
		<p class="problem" role="alert">{problem}</p>

		<button type="submit" class="find" disabled={busy}>
			<Sparkles size={26} strokeWidth={2.25} aria-hidden="true" />
			<span class="find-text">
				<strong>{busy ? 'Standort wird bestimmt …' : 'Schöne Runden finden'}</strong>
				<span>{km} km · {WISH_WORDS[draft.wish]}</span>
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

	/* festgesetzt: bleibt beim Scrollen knapp über der unteren Leiste sichtbar, am Seitenende steht er an seinem Platz.
	   Ein Verlauf dahinter, damit Kacheln nicht unter dem Knopf durchscheinen. */
	.cta {
		position: sticky;
		bottom: calc(var(--bottom-bar-height) + env(safe-area-inset-bottom));
		z-index: 5;
		margin: 0 -1rem 1rem;
		padding: 0.625rem 1rem;
		/* eine ruhige, durchgehende Fläche direkt über der unteren Leiste – nichts scheint darunter durch */
		background: var(--color-bg);
		border-top: 1px solid var(--color-border);
	}

	.cta .problem {
		margin-bottom: 0.5rem;
	}

	/* zwei Zeilen im Knopf: oben die Aktion, darunter die gewählte Auswahl */
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
		min-height: 4.25rem;
		padding: 0.5rem 3rem 0.5rem 1rem;
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
