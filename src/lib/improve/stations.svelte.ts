/**
 * Zustand der Stationen eines Tourdetails: welche Stationen es gibt, welche gewählt ist, welche Alternativen es dazu gibt und
 * welche davon angesehen wird. Wird von der Liste unter der Karte (Stations.svelte) und vom Fenster in der großen Karte
 * (StationSheet.svelte) gemeinsam benutzt.
 */
import { RoutingUnavailableError } from '$lib/routing/graphhopper';
import type { PlanDeps } from '$lib/routing/plan';
import type { PlannedTour } from '$lib/tour/model';
import { loadPlanDeps } from './deps';
import { applyOffer } from './offers';
import { stationOptions, stationsOf, type Station, type StationOption } from './stations';

export class StationsController {
	stations: Station[] = $state([]);
	selectedId: string | undefined = $state();
	options: StationOption[] = $state([]);
	chosenId: string | undefined = $state();
	status: 'loading' | 'ready' | 'none' = $state('loading');
	optionsStatus: 'idle' | 'searching' | 'done' | 'unavailable' = $state('idle');

	readonly selected = $derived(this.stations.find((s) => s.id === this.selectedId));
	readonly chosen = $derived(this.options.find((o) => o.id === this.chosenId));
	/** Vorschau für die Karte: bisheriges Stück und neuer Weg der gewählten Alternative */
	readonly preview = $derived(
		this.chosen && this.selected
			? { oldLine: this.chosen.offer.oldLine, newLine: this.chosen.offer.newLine, extraMeters: this.chosen.offer.extraMeters }
			: undefined
	);

	private tour: PlannedTour | undefined;
	private deps: PlanDeps | undefined;
	private search: AbortController | undefined;
	private version = 0;

	/** `onchange`: die Tour hat sich geändert (Übernehmen); `text` beschreibt die Änderung für „Rückgängig“ */
	constructor(private readonly onchange: (tour: PlannedTour, text: string) => void) {}

	/** Neue oder geänderte Tour: Stationen neu bestimmen */
	async setTour(tour: PlannedTour): Promise<void> {
		this.tour = tour;
		const version = ++this.version;
		this.close();
		this.status = 'loading';
		try {
			this.deps ??= await loadPlanDeps();
			if (version !== this.version) return;
			this.stations = this.deps.names ? stationsOf(tour, this.deps.names) : [];
			this.status = this.stations.length ? 'ready' : 'none';
		} catch (error) {
			console.warn('Stationen nicht verfügbar:', error);
			if (version === this.version) this.status = 'none';
		}
	}

	number(station: Station): number {
		return this.stations.indexOf(station) + 1;
	}

	/** Station wählen (nochmal dieselbe: schließen) und Alternativen suchen */
	select(id: string): void {
		if (id === this.selectedId) {
			this.close();
			return;
		}
		const station = this.stations.find((s) => s.id === id);
		if (!station || !this.tour || !this.deps?.names) return;
		this.close();
		this.selectedId = id;
		this.optionsStatus = 'searching';
		const controller = new AbortController();
		this.search = controller;
		stationOptions(this.tour, station, this.deps.names, { ...this.deps, signal: controller.signal })
			.then((found) => {
				if (controller.signal.aborted) return;
				this.options = found;
				this.chosenId = found[0]?.id;
				this.optionsStatus = 'done';
			})
			.catch((error) => {
				if (controller.signal.aborted || (error as Error).name === 'AbortError') return;
				console.warn('Alternativen nicht verfügbar:', error);
				this.optionsStatus = error instanceof RoutingUnavailableError ? 'unavailable' : 'done';
			});
	}

	choose(id: string): void {
		this.chosenId = id;
	}

	/** Auswahl schließen, ohne etwas zu ändern */
	close(): void {
		this.search?.abort();
		this.search = undefined;
		this.selectedId = undefined;
		this.options = [];
		this.chosenId = undefined;
		this.optionsStatus = 'idle';
	}

	/** Die gewählte Alternative übernehmen */
	accept(): void {
		if (!this.chosen || !this.selected || !this.tour || !this.deps) return;
		const text = `${this.chosen.title} (statt „${this.selected.name}“)`;
		this.onchange(applyOffer(this.tour, this.chosen.offer, this.deps), text);
	}
}
