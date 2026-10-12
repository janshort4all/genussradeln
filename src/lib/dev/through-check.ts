/**
 * Nur Entwicklung: „Durch statt vorbei“ (through.ts) vorher/nachher vergleichen. Im Browser auf localhost:5173:
 *   const m = await import('/src/lib/dev/through-check.ts'); await m.compareThrough([[6.63, 51.45]], { roundKm: 25 })
 * Plant jede Runde bzw. jeden Zielweg einmal ohne und einmal mit dem Schritt und meldet Länge, Schönheit, Anteil mitten
 * im Wald und am Ufer sowie die Rechenzeit. Startpunkte werden nicht gespeichert.
 */
import type { LngLat } from '$lib/geo/geo';
import { loadPlanDeps } from '$lib/routing/plan-deps';
import { planTours } from '$lib/routing/plan';
import { planRound } from '$lib/routing/round';
import { beautyScore } from '$lib/scoring/score';
import { THROUGH } from '$lib/scoring/weights';
import type { PlannedTour, TourRequest } from '$lib/tour/model';

const URLS = {
	landscape: ['/data/landscape.json', '/data/landscape.png'] as [string, string],
	names: ['/data/landmarks.json', '/data/places.json'] as [string, string],
	roads: ['/data/roads.json', '/data/roads.bin'] as [string, string],
	fine: ['/data/fine.json', '/data/fine.bin'] as [string, string],
	streams: '/data/streams.json'
};

const summary = (tours: PlannedTour[]) =>
	tours.map((t) => ({
		title: t.title,
		km: Math.round(t.stats.distance / 100) / 10,
		beauty: Math.round(beautyScore(t.stats) * 100) / 100,
		forestIn: Math.round((t.stats.forestThrough ?? 0) * 100),
		greenIn: Math.round((t.stats.greenThrough ?? 0) * 100),
		shore: Math.round((t.stats.shoreWater ?? 0) * 100)
	}));

export async function compareThrough(
	starts: LngLat[],
	options: { roundKm?: number; destination?: LngLat; seeds?: number[] } = {}
): Promise<unknown[]> {
	const deps = await loadPlanDeps(URLS);
	const out: unknown[] = [];
	// „vorher“ = ohne den Schritt
	const switchable = THROUGH as { maxStretches: number };
	const keep = switchable.maxStretches;
	for (const start of starts) {
		for (const seed of options.seeds ?? [1]) {
			const request: TourRequest = {
				start: { name: 'Start', lngLat: start },
				destination: { name: 'Ziel', lngLat: options.destination ?? start },
				effort: 'easy',
				returnMode: 'one-way',
				...(options.roundKm ? { round: { km: options.roundKm, seed } } : {})
			};
			const plan = () => (request.round ? planRound(request, deps) : planTours(request, deps));
			try {
				switchable.maxStretches = 0;
				let t0 = performance.now();
				const before = await plan();
				const msBefore = Math.round(performance.now() - t0);
				switchable.maxStretches = keep;
				t0 = performance.now();
				const after = await plan();
				const msAfter = Math.round(performance.now() - t0);
				out.push({ seed, msBefore, msAfter, before: summary(before), after: summary(after), tours: { before, after } });
			} catch (error) {
				out.push({ seed, error: String(error) });
			} finally {
				switchable.maxStretches = keep;
			}
		}
	}
	return out;
}
