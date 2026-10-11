<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import { onMount } from 'svelte';
	import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
	import { boundsOf, type LngLat } from '$lib/geo/geo';
	import TurnArrow from '$lib/navigation/TurnArrow.svelte';
	import type { ArrowKind } from '$lib/navigation/wording';
	import { navColors, navStyle, type NavTheme } from './nav-style';

	/**
	 * Karte für die Navigation: ruhiger eigener Stil, dreht sich mit der Fahrtrichtung (vorne ist oben),
	 * folgt dem Standort ohne Animation (spart Strom) und lässt sich nicht verschieben (kein Fehlgriff unterwegs).
	 * Mit `overview` zeigt sie die ganze Strecke (Norden oben) und lässt sich verschieben und zoomen – für den Überblick.
	 *
	 * Die Strecke ist in drei Teile geteilt (Jan, 13.10.2026: am Start liefen Hin- und Rückweg beide auf den Standort zu):
	 * `ahead` – das Stück, das jetzt vor Ihnen liegt (hell, mit Richtungspfeilen) –, `behind` – schon gefahren (blass, nur
	 * in der Übersicht) – und `rest` – der weitere Verlauf (nur in der Übersicht, mit Richtungspfeilen). In der Fahrtansicht
	 * sieht man nur `ahead`: so ist am Start eindeutig, wohin es geht, und der Rückweg stört nicht.
	 */
	interface Props {
		behind: LngLat[];
		ahead: LngLat[];
		rest: LngLat[];
		position?: LngLat;
		/** nächste Abzweigung als Zeichen auf der Karte: Ort, Pfeilart und Richtung, aus der man kommt (Grad) */
		turn?: { lngLat: LngLat; kind: ArrowKind; bearing: number };
		/** Fahrtrichtung in Grad – die Karte dreht sich so, dass sie nach oben zeigt */
		heading: number;
		zoom: number;
		theme: NavTheme;
		stops?: LngLat[];
		/** Schilder (Start, Ziel, Hinweg, Rückweg) – nur in der Übersicht */
		labels?: { lngLat: LngLat; text: string }[];
		/** ganze Strecke zum Einpassen der Übersicht */
		whole: LngLat[];
		/** Übersicht über die ganze Strecke (verschieb- und zoombar) statt der Fahrtansicht */
		overview?: boolean;
		/** die Person hat die Übersicht angefasst (für den Zeitgeber „zurück zur Fahrt“) */
		oninteract?: () => void;
		label: string;
	}

	let {
		behind,
		ahead,
		rest,
		position,
		turn,
		heading,
		zoom,
		theme,
		stops = [],
		labels = [],
		whole,
		overview = false,
		oninteract,
		label
	}: Props = $props();

	let container: HTMLDivElement;
	let map: MapLibreMap | undefined = $state();
	let ready = $state(false);
	let marker: Marker | undefined;
	let labelMarkers: Marker[] = [];
	let turnElement: HTMLDivElement | undefined = $state();
	let turnMarker: Marker | undefined;
	let createMarker: ((element: HTMLElement, lngLat: LngLat) => Marker) | undefined;
	let shownTheme: NavTheme | undefined;
	let styleToken = 0;

	/** Verschieben und Zoomen an/aus (Drehen und Kippen bleiben immer aus: Norden oben) */
	function setHandlers(m: MapLibreMap, on: boolean) {
		for (const h of [m.dragPan, m.scrollZoom, m.doubleClickZoom, m.touchZoomRotate, m.keyboard]) on ? h.enable() : h.disable();
		m.dragRotate.disable();
		m.touchPitch.disable();
		m.boxZoom.disable();
		m.touchZoomRotate.disableRotation();
	}

	const feature = (coordinates: LngLat[]) =>
		({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }) as const;

	/** Richtungspfeil: Scheibe in der Streckenfarbe mit „>“ – MapLibre dreht ihn entlang der Linie in Fahrtrichtung */
	function arrowImage(t: NavTheme): ImageData {
		const c = navColors(t);
		const size = 40;
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = size;
		const g = canvas.getContext('2d')!;
		g.beginPath();
		g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
		g.fillStyle = c.route;
		g.fill();
		g.lineWidth = 3;
		g.strokeStyle = c.routeCasing;
		g.stroke();
		g.beginPath();
		g.moveTo(15, 11);
		g.lineTo(25, 20);
		g.lineTo(15, 29);
		g.lineCap = 'round';
		g.lineJoin = 'round';
		g.lineWidth = 5;
		g.strokeStyle = t === 'dark' ? '#000000' : '#FFFFFF';
		g.stroke();
		return g.getImageData(0, 0, size, size);
	}

	function addOverlays(m: MapLibreMap, t: NavTheme) {
		if (m.getSource('ahead')) return;
		const c = navColors(t);
		const round = { 'line-cap': 'round', 'line-join': 'round' } as const;
		const wide = (a: number, b: number) => ['interpolate', ['linear'], ['zoom'], 8, a, 12, a, 17, b] as unknown as number;
		m.addSource('behind', { type: 'geojson', data: feature(behind) });
		m.addSource('rest', { type: 'geojson', data: feature(rest) });
		m.addSource('ahead', { type: 'geojson', data: feature(ahead) });
		// schon gefahren: blass, dünn – nur in der Übersicht
		m.addLayer({
			id: 'behind',
			type: 'line',
			source: 'behind',
			layout: { ...round, visibility: 'none' },
			paint: { 'line-color': c.routeBehind, 'line-width': wide(3, 7) }
		});
		// weiterer Verlauf: nur in der Übersicht
		m.addLayer({
			id: 'rest-casing',
			type: 'line',
			source: 'rest',
			layout: { ...round, visibility: 'none' },
			paint: { 'line-color': c.routeCasing, 'line-width': wide(6, 14) }
		});
		m.addLayer({
			id: 'rest',
			type: 'line',
			source: 'rest',
			layout: { ...round, visibility: 'none' },
			paint: { 'line-color': c.route, 'line-width': wide(3.5, 10) }
		});
		// das Stück direkt vor Ihnen
		m.addLayer({
			id: 'ahead-casing',
			type: 'line',
			source: 'ahead',
			layout: round,
			paint: { 'line-color': c.routeCasing, 'line-width': wide(8, 16) }
		});
		m.addLayer({
			id: 'ahead',
			type: 'line',
			source: 'ahead',
			layout: round,
			paint: { 'line-color': c.route, 'line-width': wide(5, 11) }
		});
		// Richtungspfeile auf dem, was vor Ihnen liegt (Übersicht: auch auf dem weiteren Verlauf)
		const imageName = `nav-arrow-${t}`;
		if (!m.hasImage(imageName)) m.addImage(imageName, arrowImage(t), { pixelRatio: 2 });
		for (const id of ['ahead', 'rest']) {
			m.addLayer({
				id: `${id}-arrows`,
				type: 'symbol',
				source: id,
				layout: {
					'symbol-placement': 'line',
					'symbol-spacing': id === 'ahead' ? 110 : 90,
					'icon-image': imageName,
					'icon-rotation-alignment': 'map',
					'icon-allow-overlap': true,
					'icon-ignore-placement': true,
					visibility: id === 'ahead' ? 'visible' : 'none'
				}
			});
		}
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
		applyView(m, overview);
	}

	/** Fahrtansicht: nur das Stück vor Ihnen; Übersicht: alles */
	function applyView(m: MapLibreMap, on: boolean) {
		for (const id of ['behind', 'rest-casing', 'rest', 'rest-arrows'] as const) {
			if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
		}
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
				center: position ?? ahead[0] ?? whole[0],
				zoom,
				bearing: heading,
				// bedienbar, aber alles ausgeschaltet: nur in der Übersicht darf man verschieben und zoomen (siehe unten)
				interactive: true,
				attributionControl: { compact: true },
				fadeDuration: 0
			});
			instance.on('error', (event) => console.warn('Karte:', event.error?.message));
			setHandlers(instance, false);
			for (const type of ['touchstart', 'mousedown', 'wheel'] as const) instance.on(type, () => oninteract?.());
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
			marker = new maplibre.Marker({ element }).setLngLat(position ?? ahead[0] ?? whole[0]).addTo(instance);
			createMarker = (el, lngLat) => new maplibre.Marker({ element: el }).setLngLat(lngLat).addTo(instance);
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

	// Strecke aktualisieren, wenn sich das Stück vor Ihnen ändert
	$effect(() => {
		const a = ahead;
		const b = behind;
		const r = rest;
		if (!map || !ready) return;
		const set = (id: string, coords: LngLat[]) =>
			(map!.getSource(id) as import('maplibre-gl').GeoJSONSource | undefined)?.setData(feature(coords));
		set('ahead', a);
		set('behind', b);
		set('rest', r);
	});

	// Übersicht ein/aus: ganze Strecke, Norden oben, verschiebbar, mit Schildern – oder zurück zur Fahrtansicht
	$effect(() => {
		const on = overview;
		const signs = labels;
		if (!map) return;
		const m = map;
		setHandlers(m, on);
		if (ready) applyView(m, on);
		for (const l of labelMarkers) l.remove();
		labelMarkers = [];
		if (on) {
			const b = boundsOf([whole]);
			if (Number.isFinite(b.west))
				m.fitBounds([b.west, b.south, b.east, b.north], { padding: { top: 60, bottom: 90, left: 40, right: 40 }, bearing: 0, duration: 0 });
			for (const sign of signs) {
				const el = document.createElement('div');
				el.className = 'nav-sign';
				el.textContent = sign.text;
				labelMarkers.push(createMarker!(el, sign.lngLat));
			}
		}
	});

	// Zeichen an der nächsten Abzweigung: dreht mit der Karte, der Pfeil zeigt von der Fahrtrichtung dort aus
	$effect(() => {
		const t = turn;
		if (!map || !createMarker || !turnElement) return;
		if (!t || overview) {
			turnMarker?.remove();
			turnMarker = undefined;
			return;
		}
		if (!turnMarker) {
			turnMarker = createMarker(turnElement, t.lngLat);
			turnMarker.setRotationAlignment('map');
		}
		turnMarker.setLngLat(t.lngLat).setRotation(t.bearing);
	});

	// Standort folgen: ohne Animation, Standort im unteren Drittel, damit man mehr vom Weg vor sich sieht
	// (in der Übersicht bleibt die Karte, wie sie ist – nur der Punkt wandert weiter)
	$effect(() => {
		if (!map || !position) return;
		marker?.setLngLat(position);
		if (overview) return;
		const height = container.clientHeight;
		map.jumpTo({ center: position, bearing: heading, zoom, padding: { top: height * 0.35, bottom: 0, left: 0, right: 0 } });
	});
</script>

<div class="nav-map" bind:this={container} role="img" aria-label={label}></div>
<!-- Vorlage für das Abbiege-Zeichen; MapLibre hängt es in die Karte um -->
<div class="turn-pool" aria-hidden="true">
	<div class="nav-turn" bind:this={turnElement}>
		{#if turn}<TurnArrow kind={turn.kind} size={38} />{/if}
	</div>
</div>

<style>
	.nav-map {
		position: absolute;
		inset: 0;
	}

	.turn-pool {
		display: none;
	}

	.nav-map :global(.nav-turn) {
		display: grid;
		place-items: center;
		width: 3.5rem;
		height: 3.5rem;
		border: 3px solid #000;
		border-radius: 50%;
		background: #f1b34c;
		color: #000;
		box-shadow: 0 1px 6px rgb(0 0 0 / 0.6);
		pointer-events: none;
	}

	.nav-map :global(.nav-position) {
		filter: drop-shadow(0 1px 3px rgb(0 0 0 / 0.5));
	}

	/* Schilder in der Übersicht: Start, Ziel, Hinweg, Rückweg */
	.nav-map :global(.nav-sign) {
		padding: 0.25rem 0.75rem;
		border: 2px solid #000;
		border-radius: 999px;
		background: #f1b34c;
		color: #000;
		font-size: 1.0625rem;
		font-weight: 700;
		white-space: nowrap;
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.5);
	}
</style>
