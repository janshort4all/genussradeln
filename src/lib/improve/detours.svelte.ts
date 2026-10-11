/**
 * Zustand der spannenden Umwege im Tourdetail: erst auf Knopfdruck suchen („Spannende Umwege suchen“), dann die
 * gefundenen Highlights auf der großen Karte zeigen; eins antippen → Vorschau auf der Karte, Übernehmen / Nein, danke.
 */
import { RoutingUnavailableError } from '$lib/routing/graphhopper';
import type { PlanDeps } from '$lib/routing/plan';
import type { PlannedTour } from '$lib/tour/model';
import { loadPlanDeps } from './deps';
import { findDetours, type Detour } from './highlights';
import { applyOffer } from './offers';

export class DetoursController {
	status: 'idle' | 'searching' | 'ready' | 'none' | 'unavailable' | 'error' = $state('idle');
	detours: Detour[] = $state([]);
	selectedId: string | undefined = $state();

	readonly selected = $derived(this.detours.find((d) => d.highlight.id === this.selectedId));
	/** Vorschau für die Karte: wegfallendes Stück und neuer Weg */
	readonly preview = $derived(
		this.selected
			? { oldLine: this.selected.offer.oldLine, newLine: this.selected.offer.newLine, extraMeters: this.selected.offer.extraMeters }
			: undefined
	);

	private tour: PlannedTour | undefined;
	private deps: PlanDeps | undefined;
	private search: AbortController | undefined;

	/** `onchange`: die Tour hat sich geändert (Übernehmen); `text` beschreibt die Änderung für „Rückgängig“ */
	constructor(private readonly onchange: (tour: PlannedTour, text: string) => void) {}

	/** Neue oder geänderte Tour: alte Ergebnisse gelten nicht mehr */
	setTour(tour: PlannedTour): void {
		if (tour === this.tour) return;
		this.tour = tour;
		this.reset();
	}

	reset(): void {
		this.search?.abort();
		this.search = undefined;
		this.status = 'idle';
		this.detours = [];
		this.selectedId = undefined;
	}

	/** „Spannende Umwege suchen“ */
	async find(): Promise<void> {
		const tour = this.tour;
		if (!tour || this.status === 'searching') return;
		this.search?.abort();
		const controller = new AbortController();
		this.search = controller;
		this.status = 'searching';
		this.selectedId = undefined;
		try {
			this.deps ??= await loadPlanDeps();
			const found = await findDetours(tour, { ...this.deps, signal: controller.signal });
			if (controller.signal.aborted) return;
			this.detours = found;
			this.status = found.length ? 'ready' : 'none';
		} catch (error) {
			if (controller.signal.aborted || (error as Error).name === 'AbortError') return;
			console.warn('Spannende Umwege nicht verfügbar:', error);
			this.status = error instanceof RoutingUnavailableError ? 'unavailable' : 'error';
		}
	}

	/** Highlight antippen (nochmal: abwählen) */
	select(id: string): void {
		this.selectedId = id === this.selectedId ? undefined : id;
	}

	/** Den gewählten Umweg übernehmen */
	accept(): void {
		const chosen = this.selected;
		if (!chosen || !this.tour || !this.deps) return;
		const text = `${chosen.offer.title} (+${(chosen.offer.extraMeters / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km)`;
		this.onchange(applyOffer(this.tour, chosen.offer, this.deps), text);
	}
}
