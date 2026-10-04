<script lang="ts" module>
	import type { LngLat } from '$lib/geo/geo';
	import type { StopKind } from '$lib/stops/kinds';

	export interface MapRoute {
		id: string;
		coordinates: LngLat[];
		color: string;
	}

	export interface MapMarker {
		lngLat: LngLat;
		kind: 'start' | 'destination';
	}

	export interface MapStop {
		id: string;
		lngLat: LngLat;
		kind: StopKind;
	}
</script>

<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	// MapLibre rechnet Kartendaten in einem Worker; Vite baut ihn als eigenes Modul (siehe vite.config.ts → worker)
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import { onMount } from 'svelte';
	import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
	import { stopIcons } from '$lib/components/icons';
	import { boundsOf } from '$lib/geo/geo';

	/**
	 * Karte mit einem oder mehreren Wegen (MapLibre + OpenFreeMap).
	 * Die Karte ergänzt die Liste – alle Infos stehen auch als Text daneben.
	 */
	interface Props {
		routes: MapRoute[];
		markers?: MapMarker[];
		selectedId?: string;
		onselect?: (id: string) => void;
		/** Stopps unterwegs als Symbole (nur Anzeige – bedient wird über die Liste) */
		stops?: MapStop[];
		/** Stopp, zu dem die Karte springen soll */
		focusStopId?: string;
		/** Beschreibung für Screenreader */
		label: string;
	}

	let { routes, markers = [], selectedId, onselect, stops = [], focusStopId, label }: Props = $props();

	let createMarker: ((element: HTMLElement, lngLat: LngLat) => Marker) | undefined = $state();
	const stopElements: Record<string, HTMLElement> = $state({});
	const stopMarkers = new Map<string, Marker>();

	const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
	// rechts Platz für die Zoom-Knöpfe, unten für den Quellenhinweis
	const PADDING = { top: 40, bottom: 50, left: 40, right: 80 };

	let container: HTMLDivElement;
	let map: MapLibreMap | undefined = $state();
	let loaded = $state(false);
	let failed = $state(false);
	let shownRouteIds: string[] = [];

	onMount(() => {
		let destroyed = false;
		(async () => {
			try {
				const maplibre = await import('maplibre-gl');
				if (destroyed) return;
				maplibre.setWorkerUrl(workerUrl);
				const b = boundsOf(routes.map((r) => r.coordinates));
				const instance = new maplibre.Map({
					container,
					style: STYLE_URL,
					bounds: Number.isFinite(b.west) ? [b.west, b.south, b.east, b.north] : undefined,
					fitBoundsOptions: { padding: PADDING },
					attributionControl: { compact: true },
					// Auf dem Handy: Seite scrollt mit einem Finger, Karte verschiebt sich mit zwei
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
				instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
				instance.on('error', (event) => console.warn('Karte:', event.error?.message));
				// Wege zeichnen, sobald der Kartenstil da ist – nicht erst, wenn alle Kacheln geladen sind
				instance.once('style.load', () => (loaded = true));
				instance.once('load', () => (loaded = true));
				for (const marker of markers) {
					const element = document.createElement('div');
					element.className = `map-marker ${marker.kind}`;
					element.setAttribute('aria-hidden', 'true');
					new maplibre.Marker({ element }).setLngLat(marker.lngLat).addTo(instance);
				}
				createMarker = (element, lngLat) => new maplibre.Marker({ element }).setLngLat(lngLat).addTo(instance);
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

	// Wege eintragen bzw. aktualisieren, sobald Karte und Stil geladen sind
	$effect(() => {
		if (!map || !loaded) return;
		const m = map;
		const ids = routes.map((r) => r.id);
		const changed = ids.join() !== shownRouteIds.join();

		if (changed) {
			for (const id of shownRouteIds) {
				for (const layer of [`route-${id}`, `route-${id}-casing`]) if (m.getLayer(layer)) m.removeLayer(layer);
				if (m.getSource(`route-${id}`)) m.removeSource(`route-${id}`);
			}
			for (const r of routes) {
				m.addSource(`route-${r.id}`, {
					type: 'geojson',
					data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.coordinates } }
				});
				m.addLayer({
					id: `route-${r.id}-casing`,
					type: 'line',
					source: `route-${r.id}`,
					layout: { 'line-join': 'round', 'line-cap': 'round' },
					paint: { 'line-color': '#FDFBF5', 'line-width': 10 }
				});
				m.addLayer({
					id: `route-${r.id}`,
					type: 'line',
					source: `route-${r.id}`,
					layout: { 'line-join': 'round', 'line-cap': 'round' },
					paint: { 'line-color': r.color, 'line-width': 6 }
				});
				m.on('click', `route-${r.id}`, () => onselect?.(r.id));
				m.on('mouseenter', `route-${r.id}`, () => (m.getCanvas().style.cursor = 'pointer'));
				m.on('mouseleave', `route-${r.id}`, () => (m.getCanvas().style.cursor = ''));
			}
			shownRouteIds = ids;
			const b = boundsOf(routes.map((r) => r.coordinates));
			if (Number.isFinite(b.west)) m.fitBounds([b.west, b.south, b.east, b.north], { padding: PADDING, duration: 0 });
		}

		// Ausgewählten Weg hervorheben und nach oben legen
		for (const r of routes) {
			const selected = !selectedId || r.id === selectedId;
			m.setPaintProperty(`route-${r.id}`, 'line-opacity', selected ? 1 : 0.45);
			m.setPaintProperty(`route-${r.id}`, 'line-width', r.id === selectedId ? 8 : 6);
			m.setPaintProperty(`route-${r.id}-casing`, 'line-opacity', selected ? 1 : 0.45);
		}
		if (selectedId && m.getLayer(`route-${selectedId}`)) {
			m.moveLayer(`route-${selectedId}-casing`);
			m.moveLayer(`route-${selectedId}`);
		}
	});

	// Stopp-Symbole: Svelte zeichnet die Elemente (unten), MapLibre setzt sie an ihre Stelle auf der Karte
	$effect(() => {
		if (!createMarker) return;
		const wanted = new Set(stops.map((s) => s.id));
		for (const [id, marker] of stopMarkers) {
			if (!wanted.has(id)) {
				marker.remove();
				stopMarkers.delete(id);
			}
		}
		for (const stop of stops) {
			const element = stopElements[stop.id];
			if (element && !stopMarkers.has(stop.id)) stopMarkers.set(stop.id, createMarker(element, stop.lngLat));
		}
	});

	// Zum gewählten Stopp springen (ohne Animation, wenn der Nutzer weniger Bewegung wünscht)
	$effect(() => {
		const stop = stops.find((s) => s.id === focusStopId);
		if (!map || !stop) return;
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		map.easeTo({ center: stop.lngLat, zoom: Math.max(map.getZoom(), 15), duration: reduce ? 0 : 600 });
	});
</script>

<div class="route-map" role="img" aria-label={label}>
	<div class="canvas" bind:this={container}></div>
	{#if failed}
		<p class="fallback">Die Karte kann auf diesem Gerät leider nicht angezeigt werden. Alle Angaben finden Sie unten.</p>
	{/if}
	<!-- Vorlagen für die Stopp-Symbole; MapLibre hängt sie in die Karte um -->
	<div class="stop-pool" aria-hidden="true">
		{#each stops as stop (stop.id)}
			{@const style = stopIcons[stop.kind]}
			<div
				bind:this={stopElements[stop.id]}
				class="stop-marker"
				class:focused={stop.id === focusStopId}
				style:color={style.color}
				style:background={style.background}
			>
				<style.icon size={18} strokeWidth={2.25} />
			</div>
		{/each}
	</div>
</div>

<style>
	.route-map {
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

	/* Start- und Zielmarkierung */
	.route-map :global(.map-marker) {
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		border: 3px solid var(--color-surface);
		box-shadow: 0 1px 4px rgb(36 53 57 / 0.4);
	}

	.route-map :global(.map-marker.start) {
		background: var(--color-green);
	}

	.route-map :global(.map-marker.destination) {
		width: 1.75rem;
		height: 1.75rem;
		background: var(--color-orange);
	}

	.stop-pool {
		display: none;
	}

	.route-map :global(.stop-marker) {
		display: grid;
		place-items: center;
		width: 1.875rem;
		height: 1.875rem;
		border-radius: 50%;
		border: 2px solid var(--color-surface);
		box-shadow: 0 1px 4px rgb(36 53 57 / 0.35);
	}

	.route-map :global(.stop-marker.focused) {
		width: 2.5rem;
		height: 2.5rem;
		border-color: var(--color-green);
		z-index: 2;
	}

	/* Bedienelemente der Karte groß genug für Finger */
	.route-map :global(.maplibregl-ctrl-group button) {
		width: var(--tap);
		height: var(--tap);
	}
</style>
