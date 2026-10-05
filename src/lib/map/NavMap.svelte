<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import { onMount } from 'svelte';
	import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
	import type { LngLat } from '$lib/geo/geo';
	import { navColors, navStyle, type NavTheme } from './nav-style';

	/**
	 * Karte für die Navigation: ruhiger eigener Stil, dreht sich mit der Fahrtrichtung (vorne ist oben),
	 * folgt dem Standort ohne Animation (spart Strom) und lässt sich nicht verschieben (kein Fehlgriff unterwegs).
	 */
	interface Props {
		line: LngLat[];
		position?: LngLat;
		/** Fahrtrichtung in Grad – die Karte dreht sich so, dass sie nach oben zeigt */
		heading: number;
		zoom: number;
		theme: NavTheme;
		stops?: LngLat[];
		label: string;
	}

	let { line, position, heading, zoom, theme, stops = [], label }: Props = $props();

	let container: HTMLDivElement;
	let map: MapLibreMap | undefined = $state();
	let ready = $state(false);
	let marker: Marker | undefined;
	let shownTheme: NavTheme | undefined;
	let styleToken = 0;

	function addOverlays(m: MapLibreMap, t: NavTheme) {
		if (m.getSource('route')) return;
		const c = navColors(t);
		m.addSource('route', {
			type: 'geojson',
			data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } }
		});
		m.addLayer({
			id: 'route-casing',
			type: 'line',
			source: 'route',
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: { 'line-color': c.routeCasing, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 8, 17, 16] }
		});
		m.addLayer({
			id: 'route',
			type: 'line',
			source: 'route',
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: { 'line-color': c.route, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 17, 11] }
		});
		m.addSource('stops', {
			type: 'geojson',
			data: {
				type: 'FeatureCollection',
				features: stops.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }))
			}
		});
		m.addLayer({
			id: 'stops',
			type: 'circle',
			source: 'stops',
			paint: { 'circle-radius': 9, 'circle-color': '#B0552F', 'circle-stroke-color': '#FDFBF5', 'circle-stroke-width': 3 }
		});
	}

	onMount(() => {
		let destroyed = false;
		(async () => {
			const maplibre = await import('maplibre-gl');
			if (destroyed) return;
			maplibre.setWorkerUrl(workerUrl);
			const instance = new maplibre.Map({
				container,
				style: navStyle(theme),
				center: position ?? line[0],
				zoom,
				bearing: heading,
				interactive: false,
				attributionControl: { compact: true },
				fadeDuration: 0
			});
			instance.on('error', (event) => console.warn('Karte:', event.error?.message));
			instance.once('style.load', () => {
				addOverlays(instance, theme);
				shownTheme = theme;
				ready = true;
			});
			const element = document.createElement('div');
			element.className = 'nav-position';
			element.setAttribute('aria-hidden', 'true');
			element.innerHTML =
				'<svg viewBox="0 0 40 40" width="44" height="44"><circle cx="20" cy="20" r="18" fill="#FDFBF5" stroke="#000" stroke-width="2"/><path d="M20 7 L29 30 L20 25 L11 30 Z" fill="#000"/></svg>';
			marker = new maplibre.Marker({ element }).setLngLat(position ?? line[0]).addTo(instance);
			map = instance;
		})();
		// Die Höhe der Karte ändert sich mit der Anweisung darüber – dann die Zeichenfläche anpassen
		const resize = new ResizeObserver(() => map?.resize());
		resize.observe(container);
		return () => {
			destroyed = true;
			resize.disconnect();
			map?.remove();
		};
	});

	// Hell/Dunkel umschalten: neuer Stil, Strecke und Stopps neu eintragen
	$effect(() => {
		const t = theme;
		if (!map || !ready || t === shownTheme) return;
		const m = map;
		shownTheme = t;
		// ohne „diff“: der Stil wird komplett neu geladen, danach Strecke und Stopps wieder eintragen
		// (bei schnellem Hin- und Herschalten nur für den zuletzt gewählten Stil)
		const token = ++styleToken;
		m.once('style.load', () => {
			if (token === styleToken) addOverlays(m, t);
		});
		m.setStyle(navStyle(t), { diff: false });
	});

	// Standort folgen: ohne Animation, Standort im unteren Drittel, damit man mehr vom Weg vor sich sieht
	$effect(() => {
		if (!map || !position) return;
		const height = container.clientHeight;
		map.jumpTo({ center: position, bearing: heading, zoom, padding: { top: height * 0.35, bottom: 0, left: 0, right: 0 } });
		marker?.setLngLat(position);
	});
</script>

<div class="nav-map" bind:this={container} role="img" aria-label={label}></div>

<style>
	.nav-map {
		position: absolute;
		inset: 0;
	}

	.nav-map :global(.nav-position) {
		filter: drop-shadow(0 1px 3px rgb(0 0 0 / 0.5));
	}
</style>
