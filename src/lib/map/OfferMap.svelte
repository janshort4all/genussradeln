<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import { onMount } from 'svelte';
	import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
	import { boundsOf, distanceToLine, resample, type LngLat } from '$lib/geo/geo';

	/**
	 * Vorschau eines schöneren Umwegs: die ganze Tour blass, das Stück, das ersetzt würde, orange („Bisher“),
	 * der neue Weg grün gestrichelt („Neu“). Beschriftet in Worten – die Farben allein sagen nichts.
	 */
	interface Props {
		/** die ganze Tour (blass im Hintergrund) */
		tour: LngLat[];
		/** das Stück, das ersetzt würde */
		oldLine: LngLat[];
		/** der neue Weg */
		newLine: LngLat[];
		/** Schild am neuen Weg, z. B. „Neu · +1,8 km“ */
		newLabel: string;
		label: string;
	}

	let { tour, oldLine, newLine, newLabel, label }: Props = $props();

	const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
	// unten rechts die Zoom-Knöpfe, unten links der Quellenhinweis, oben Platz für die Schilder
	const PADDING = { top: 64, bottom: 64, left: 40, right: 40 };
	// Wegfarben aus dem Logo: Terrakotta (abgedunkelt), Olivgrün (abgedunkelt), Taubenblau für den Rest der Tour
	const OLD_COLOR = '#B0552F';
	const NEW_COLOR = '#4B5A22';
	const TOUR_COLOR = '#32596F';

	let container: HTMLDivElement;
	let map: MapLibreMap | undefined = $state();
	let loaded = $state(false);
	let failed = $state(false);
	let maplibre: typeof import('maplibre-gl') | undefined;
	let markers: Marker[] = [];

	/**
	 * Wo das Schild hingehört: der Punkt von `line`, der am weitesten von `other` entfernt ist – dort unterscheiden sich
	 * die beiden Wege am deutlichsten. Liegen sie überall beieinander, die Mitte.
	 */
	function labelPoint(line: LngLat[], other: LngLat[]): LngLat {
		let best = line[Math.floor(line.length / 2)];
		let bestDistance = 40;
		for (const p of resample(line, 40)) {
			const d = distanceToLine(p, other);
			if (d > bestDistance) {
				bestDistance = d;
				best = p;
			}
		}
		return best;
	}

	function fit(m: MapLibreMap) {
		const b = boundsOf([oldLine, newLine]);
		if (Number.isFinite(b.west)) m.fitBounds([b.west, b.south, b.east, b.north], { padding: PADDING, duration: 0, maxZoom: 16 });
	}

	onMount(() => {
		let destroyed = false;
		(async () => {
			try {
				maplibre = await import('maplibre-gl');
				if (destroyed) return;
				maplibre.setWorkerUrl(workerUrl);
				const b = boundsOf([oldLine, newLine]);
				const instance = new maplibre.Map({
					container,
					style: STYLE_URL,
					bounds: Number.isFinite(b.west) ? [b.west, b.south, b.east, b.north] : undefined,
					fitBoundsOptions: { padding: PADDING, maxZoom: 16 },
					attributionControl: { compact: true },
					cooperativeGestures: true,
					locale: {
						'CooperativeGesturesHandler.WindowsHelpText': 'Zum Zoomen Strg-Taste halten und scrollen',
						'CooperativeGesturesHandler.MacHelpText': 'Zum Zoomen ⌘-Taste halten und scrollen',
						'CooperativeGesturesHandler.MobileHelpText': 'Karte mit zwei Fingern verschieben',
						'NavigationControl.ZoomIn': 'Vergrößern',
						'NavigationControl.ZoomOut': 'Verkleinern',
						'NavigationControl.ResetBearing': 'Nach Norden ausrichten'
					}
				});
				instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'bottom-right');
				instance.on('error', (event) => console.warn('Karte:', event.error?.message));
				instance.once('style.load', () => (loaded = true));
				instance.once('load', () => (loaded = true));
				map = instance;
			} catch (error) {
				console.warn('Karte kann nicht angezeigt werden:', error);
				failed = true;
			}
		})();
		return () => {
			destroyed = true;
			map?.remove();
		};
	});

	const line = (coordinates: LngLat[]) =>
		({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }) as const;

	// Linien eintragen bzw. bei einem anderen Vorschlag austauschen
	$effect(() => {
		if (!map || !loaded || !maplibre) return;
		const m = map;
		const sources: Record<string, LngLat[]> = { 'offer-tour': tour, 'offer-old': oldLine, 'offer-new': newLine };
		for (const [id, coordinates] of Object.entries(sources)) {
			const source = m.getSource(id) as import('maplibre-gl').GeoJSONSource | undefined;
			if (source) source.setData(line(coordinates));
			else m.addSource(id, { type: 'geojson', data: line(coordinates), tolerance: 1.5 });
		}
		if (!m.getLayer('offer-tour')) {
			const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
			m.addLayer({
				id: 'offer-tour',
				type: 'line',
				source: 'offer-tour',
				layout: round,
				paint: { 'line-color': TOUR_COLOR, 'line-width': 4, 'line-opacity': 0.55 }
			});
			m.addLayer({
				id: 'offer-old-casing',
				type: 'line',
				source: 'offer-old',
				layout: round,
				paint: { 'line-color': '#FDFBF5', 'line-width': 11 }
			});
			m.addLayer({
				id: 'offer-old',
				type: 'line',
				source: 'offer-old',
				layout: round,
				paint: { 'line-color': OLD_COLOR, 'line-width': 7 }
			});
			m.addLayer({
				id: 'offer-new-casing',
				type: 'line',
				source: 'offer-new',
				layout: round,
				paint: { 'line-color': '#FDFBF5', 'line-width': 11 }
			});
			// gestrichelt: so unterscheidet man den neuen Weg auch ohne Farben vom alten
			m.addLayer({
				id: 'offer-new',
				type: 'line',
				source: 'offer-new',
				layout: { 'line-join': 'round', 'line-cap': 'butt' },
				paint: { 'line-color': NEW_COLOR, 'line-width': 7, 'line-dasharray': [1.6, 1.1] }
			});
		}
		m.resize();
		fit(m);

		// Schilder
		for (const marker of markers) marker.remove();
		markers = [];
		// „Neu“ über dem Weg, „Bisher“ darunter – so überdecken sich die Schilder nicht
		const pill = (text: string, kind: 'old' | 'new', at: LngLat) => {
			const element = document.createElement('div');
			element.className = `offer-pill ${kind}`;
			element.textContent = text;
			const above = kind === 'new';
			markers.push(
				new maplibre!.Marker({ element, anchor: above ? 'bottom' : 'top', offset: [0, above ? -8 : 8] }).setLngLat(at).addTo(m)
			);
		};
		pill('Bisher', 'old', labelPoint(oldLine, newLine));
		pill(newLabel, 'new', labelPoint(newLine, oldLine));
	});
</script>

<div class="offer-map">
	<div class="canvas" bind:this={container} role="img" aria-label={label}></div>
	{#if failed}
		<p class="fallback">Die Karte kann auf diesem Gerät leider nicht angezeigt werden. Die Angaben stehen darunter.</p>
	{/if}
</div>

<style>
	.offer-map {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 14rem;
		border-radius: 1rem;
		overflow: hidden;
		border: 1px solid var(--color-border);
		background: var(--color-green-light);
	}

	.canvas {
		position: absolute;
		inset: 0;
	}

	.fallback {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		padding: 1rem;
		text-align: center;
		color: var(--color-text-muted);
	}

	.offer-map :global(.offer-pill) {
		padding: 0.25rem 0.75rem;
		border-radius: 999px;
		border: 2px solid var(--color-surface);
		color: #fff;
		font-size: 1rem;
		font-weight: 700;
		white-space: nowrap;
		box-shadow: 0 1px 4px rgb(36 53 57 / 0.4);
	}

	.offer-map :global(.offer-pill.old) {
		background: #b0552f;
	}

	.offer-map :global(.offer-pill.new) {
		background: #4b5a22;
	}

	.offer-map :global(.maplibregl-ctrl-group button) {
		width: var(--tap);
		height: var(--tap);
	}
</style>
