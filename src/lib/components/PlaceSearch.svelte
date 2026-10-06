<script lang="ts">
	import MapPin from '@lucide/svelte/icons/map-pin';
	import X from '@lucide/svelte/icons/x';
	import type { LngLat } from '$lib/geo/geo';
	import { asset } from '$app/paths';
	import { onMount } from 'svelte';
	import { distance } from '$lib/geo/geo';
	import { loadLocalPlaces, matchLocalPlaces } from '$lib/geocode/local';
	import { searchPlaces } from '$lib/geocode/photon';
	import { loadStreets, parseAddress, streetPlaces } from '$lib/geocode/streets';
	import type { Place } from '$lib/tour/model';

	/**
	 * Suchfeld für Orte und Adressen mit Vorschlägen beim Tippen (eigene Verzeichnisse sofort, Photon ergänzt).
	 * Vorschläge sind echte Knöpfe – groß, mit Ort zur Unterscheidung.
	 */
	interface Props {
		label: string;
		placeholder?: string;
		hint?: string;
		/** gewählter Ort */
		value?: Place;
		/** Treffer in der Nähe bevorzugen */
		near?: LngLat;
		/** größere Schrift für die Hauptfrage */
		prominent?: boolean;
	}

	let { label, placeholder, hint, value = $bindable(), near, prominent = false }: Props = $props();

	const id = $props.id();
	let query = $state(value?.name ?? '');
	let results: Place[] = $state([]);
	let status: 'idle' | 'searching' | 'empty' | 'error' = $state('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | undefined;
	let box: HTMLDivElement | undefined = $state();
	/** solange gesucht wird: Platz unter dem Feld, damit es sich ganz nach oben rollen lässt */
	let active = $state(false);
	let blurTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Am Handy liegt die Tastatur über der unteren Bildschirmhälfte – die Vorschläge unter dem Feld wären
	 * verdeckt. Daher das Feld nach oben rollen, sobald man hineintippt und sobald Vorschläge da sind.
	 */
	function scrollIntoReach() {
		if (!box || !window.matchMedia('(pointer: coarse)').matches) return;
		clearTimeout(blurTimer);
		active = true;
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		// kurz warten, bis die Tastatur offen ist und der sichtbare Bereich kleiner geworden ist
		setTimeout(() => box?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }), 350);
	}

	// Ortsliste schon beim Öffnen laden – dann erscheinen Orte beim Tippen sofort;
	// das größere Straßenverzeichnis erst, wenn jemand ins Feld tippt
	onMount(() => void loadLocalPlaces(asset('/data/places.json')).catch(() => {}));
	function preloadStreets() {
		void loadStreets(STREETS_URL).catch(() => {});
	}

	/** Gleicher Ort aus eigener Liste und Photon (gleicher Name, nah beieinander) nur einmal zeigen */
	function merge(local: Place[], remote: Place[]): Place[] {
		const fresh = remote.filter((r) => !local.some((l) => l.name === r.name && distance(l.lngLat, r.lngLat) < 3000));
		return [...local, ...fresh].slice(0, 6);
	}

	const STREETS_URL = asset('/data/search/streets.json');
	const NUMBERS_URL = asset('/data/search/addr');

	/**
	 * Sofort-Vorschläge aus den eigenen Verzeichnissen: Orte und Straßen (mit Hausnummer, wenn getippt).
	 * Mit Hausnummer stehen die Adressen vorn, sonst die Orte.
	 */
	async function localMatches(q: string): Promise<Place[]> {
		const [places, streets] = await Promise.all([
			loadLocalPlaces(asset('/data/places.json'))
				.then((all) => matchLocalPlaces(q, all, near))
				.catch(() => [] as Place[]),
			loadStreets(STREETS_URL)
				.then((all) => streetPlaces(q, all, NUMBERS_URL, near))
				.catch(() => [] as Place[])
		]);
		const list = parseAddress(q).number ? [...streets, ...places] : [...places, ...streets];
		return list.slice(0, 6);
	}

	async function onInput() {
		value = undefined;
		clearTimeout(timer);
		controller?.abort();
		const q = query.trim();
		// sofort: Orte und Straßen aus den eigenen Verzeichnissen (der Suchdienst braucht 2–4 s)
		const local = await localMatches(q);
		if (q !== query.trim()) return; // inzwischen weitergetippt
		results = local;
		status = 'idle';
		if (local.length) scrollIntoReach();
		if (q.length < 3) return;
		// Ausflugsziele und weitere Adressen: Suchdienst, sobald kurz nicht getippt wird (schont den Dienst)
		timer = setTimeout(async () => {
			controller = new AbortController();
			if (!local.length) status = 'searching';
			try {
				const remote = await searchPlaces(q, near, controller.signal);
				results = merge(local, remote);
				status = results.length ? 'idle' : 'empty';
				scrollIntoReach();
			} catch (error) {
				if ((error as Error).name === 'AbortError') return;
				// Suchdienst nicht erreichbar: die Orte aus der eigenen Liste bleiben stehen
				if (!local.length) status = 'error';
			}
		}, 250);
	}

	/** Platz erst später wegnehmen – sonst verrutscht die Liste, während man einen Vorschlag antippt */
	function onBlur() {
		blurTimer = setTimeout(() => (active = false), 400);
	}

	function choose(place: Place) {
		active = false;
		value = place;
		query = place.name;
		results = [];
		status = 'idle';
	}

	function clear() {
		value = undefined;
		query = '';
		results = [];
		status = 'idle';
	}
</script>

<div class="place-search" class:prominent class:active bind:this={box}>
	<label class="field-label" for="{id}-input">{label}</label>
	<div class="input-row">
		<input
			id="{id}-input"
			type="search"
			bind:value={query}
			oninput={onInput}
			onfocus={() => {
				preloadStreets();
				scrollIntoReach();
			}}
			onblur={onBlur}
			{placeholder}
			autocomplete="off"
			enterkeyhint="search"
			aria-describedby={hint ? `${id}-hint` : undefined}
			aria-controls="{id}-results"
		/>
		{#if query}
			<button type="button" class="clear" onclick={clear} aria-label="Eingabe löschen">
				<X size={24} aria-hidden="true" />
			</button>
		{/if}
	</div>
	{#if hint}<span class="field-hint" id="{id}-hint">{hint}</span>{/if}

	<div id="{id}-results" aria-live="polite">
		{#if value}
			<p class="chosen">
				<MapPin size={22} aria-hidden="true" />
				<span><strong>{value.name}</strong>{#if value.detail}<br /><span class="muted">{value.detail}</span>{/if}</span>
			</p>
		{:else if status === 'searching'}
			<p class="status muted">Suche läuft …</p>
		{:else if status === 'empty'}
			<p class="status muted">Nichts gefunden. Versuchen Sie es mit Ort und Straße, z. B. „Krefeld Rheinstraße“.</p>
		{:else if status === 'error'}
			<p class="status muted">Die Suche ist gerade nicht erreichbar. Bitte versuchen Sie es gleich noch einmal.</p>
		{:else if results.length}
			<ul class="results">
				{#each results as place (place.name + place.detail + place.lngLat.join())}
					<li>
						<button type="button" onclick={() => choose(place)}>
							<MapPin size={22} aria-hidden="true" />
							<span><strong>{place.name}</strong>{#if place.detail}<br /><span class="muted">{place.detail}</span>{/if}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<style>
	.place-search {
		margin: 0 0 1.75rem;
		/* beim Hochrollen etwas Luft über dem Feld lassen */
		scroll-margin-top: 0.75rem;
	}

	.place-search.active {
		padding-bottom: 70vh;
	}

	.prominent .field-label {
		font-family: var(--font-title);
		font-size: var(--text-h2);
		line-height: 1.15;
		margin-bottom: 0.75rem;
	}

	.input-row {
		position: relative;
	}

	input {
		display: block;
		width: 100%;
		min-height: 3.5rem;
		padding: 0.75rem 3.5rem 0.75rem 0.875rem;
		border: 2px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		font-size: var(--text-large);
	}

	.prominent input {
		border-color: var(--color-green);
	}

	input::placeholder {
		color: var(--color-text-muted);
		opacity: 1;
	}

	/* eigenes Löschen-Kreuz statt des kleinen Browser-Kreuzes */
	input::-webkit-search-cancel-button {
		display: none;
	}

	.clear {
		position: absolute;
		top: 50%;
		right: 0.25rem;
		translate: 0 -50%;
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		border: 0;
		border-radius: var(--radius);
		background: none;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.results {
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
		border: 2px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		overflow: hidden;
	}

	.results li + li {
		border-top: 1px solid var(--color-border);
	}

	.results button {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		width: 100%;
		min-height: 3.5rem;
		padding: 0.625rem 0.875rem;
		border: 0;
		background: none;
		text-align: left;
		line-height: 1.35;
		cursor: pointer;
	}

	.results button:hover {
		background: var(--color-green-light);
	}

	.results :global(svg),
	.chosen :global(svg) {
		flex: none;
		margin-top: 0.1rem;
		color: var(--color-olive);
	}

	.chosen {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		margin: 0.5rem 0 0;
		padding: 0.625rem 0.875rem;
		border-radius: var(--radius);
		background: var(--color-green-light);
		line-height: 1.35;
	}

	.chosen :global(svg) {
		color: var(--color-green);
	}

	.status {
		margin: 0.5rem 0 0;
	}
</style>
