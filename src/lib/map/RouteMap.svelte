<script lang="ts" module>
	import type { LngLat } from '$lib/geo/geo';
	import type { StopKind } from '$lib/stops/kinds';

	export interface MapRoute {
		id: string;
		coordinates: LngLat[];
		color: string;
		/** Nummer im Schild auf dem Weg (ohne Nummer kein Schild) */
		number?: number;
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

	/** Vorschau eines Tauschs: bisheriges Stück (orange) und neuer Weg (grün, gestrichelt) */
	export interface MapPreview {
		oldLine: LngLat[];
		newLine: LngLat[];
		/** Mehrweg in Metern (für das Schild „Neu · +1,8 km“) */
		extraMeters: number;
	}

	/** Highlight in der Nähe (spannender Umweg): Symbol mit Namen, nur in der großen Karte */
	export interface MapHighlight {
		id: string;
		lngLat: LngLat;
		/** Wasser (See, Fluss) oder Grün (Wald, Park) */
		water: boolean;
		label: string;
	}
</script>

<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	// MapLibre rechnet Kartendaten in einem Worker; Vite baut ihn als eigenes Modul (siehe vite.config.ts → worker)
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import { onMount, type Snippet } from 'svelte';
	import { pushState } from '$app/navigation';
	import { page } from '$app/state';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Trees from '@lucide/svelte/icons/trees';
	import Waves from '@lucide/svelte/icons/waves';
	import X from '@lucide/svelte/icons/x';
	import type { Map as MapLibreMap, Marker, MarkerOptions } from 'maplibre-gl';
	import { stopIcons } from '$lib/components/icons';
	import { boundsOf, distance, distanceToLine, resample } from '$lib/geo/geo';
	import { badgeSpots } from './badges';

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
		/** Highlights in der Nähe (nur in der großen Karte zu sehen) */
		highlights?: MapHighlight[];
		/** gewähltes Highlight (hervorgehoben) */
		selectedHighlightId?: string;
		/** Highlight angetippt */
		onhighlight?: (id: string) => void;
		/** Vorschau eines Tauschs, wird auf der Karte eingezeichnet */
		preview?: MapPreview;
		/** Fenster am unteren Rand der großen Karte (spannende Umwege) */
		sheet?: Snippet;
		/** Infofenster über der Karte, klein und groß (z. B. der angetippte Weg mit „Tour ansehen“) */
		popup?: Snippet;
		/** Beschreibung für Screenreader */
		label: string;
	}

	let {
		routes,
		markers = [],
		selectedId,
		onselect,
		stops = [],
		focusStopId,
		highlights = [],
		selectedHighlightId,
		onhighlight,
		preview,
		sheet,
		popup,
		label
	}: Props = $props();

	let createMarker: ((element: HTMLElement, lngLat: LngLat, options?: MarkerOptions) => Marker) | undefined = $state();
	const stopElements: Record<string, HTMLElement> = $state({});
	const stopMarkers = new Map<string, Marker>();
	const highlightElements: Record<string, HTMLElement> = $state({});
	let sheetSlot: HTMLDivElement | undefined = $state();
	const highlightMarkers = new Map<string, Marker>();
	const badgeElements: Record<string, HTMLElement> = $state({});
	const activeId = $derived(routes.some((r) => r.id === selectedId) ? selectedId : routes[0]?.id);

	const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
	// rechts Platz für die Zoom-Knöpfe, unten für den Quellenhinweis
	const PADDING = { top: 40, bottom: 50, left: 40, right: 80 };
	const LINE_WIDTH = 5;
	const ARROW_SPACING = 160;

	/**
	 * Richtungszeichen: runde Scheibe in der Wegfarbe mit hellem Rand und weißem Pfeil „>“ (doppelte Auflösung).
	 * Der Pfeil zeigt nach rechts – MapLibre dreht ihn entlang der Linie in Fahrtrichtung.
	 */
	function arrowImage(color: string): ImageData {
		const size = 36;
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = size;
		const c = canvas.getContext('2d')!;
		c.beginPath();
		c.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
		c.fillStyle = color;
		c.fill();
		c.lineWidth = 3;
		c.strokeStyle = '#FDFBF5';
		c.stroke();
		c.beginPath();
		c.moveTo(14, 10);
		c.lineTo(22, 18);
		c.lineTo(14, 26);
		c.lineCap = 'round';
		c.lineJoin = 'round';
		c.lineWidth = 4;
		c.strokeStyle = '#FFFFFF';
		c.stroke();
		return c.getImageData(0, 0, size, size);
	}

	const arrowName = (color: string) => `route-arrow-${color}`;

	let container: HTMLDivElement;
	let map: MapLibreMap | undefined = $state();
	let loaded = $state(false);
	let failed = $state(false);
	let shownRouteIds: string[] = [];

	// „Große Karte“: füllt den Bildschirm. Läuft über den Browser-Verlauf, damit die Zurück-Taste sie schließt.
	const mapId = $props.id();
	const expanded = $derived(page.state.mapOpen === mapId);

	function openLarge() {
		pushState('', { mapOpen: mapId });
	}

	/** „Spannende Umwege suchen“ auf der Tour-Seite öffnet die große Karte, in der die Umwege erscheinen */
	export function openLargeMap() {
		if (!expanded) openLarge();
	}

	function closeLarge() {
		if (expanded) history.back();
	}

	/**
	 * Alle Wege einpassen. In der großen Karte mit mehreren Wegen nur den gewählten (Jan, 14.10.2026: „im Detail ansehen“) –
	 * unten bleibt Platz für das Infofenster.
	 */
	function fitRoutes(m: MapLibreMap) {
		const detail = expanded && routes.length > 1 && activeId !== undefined;
		const lines = detail ? routes.filter((r) => r.id === activeId).map((r) => r.coordinates) : routes.map((r) => r.coordinates);
		const b = boundsOf(lines);
		const padding = detail && popup ? { ...PADDING, bottom: 230, top: 90, left: 50, right: 50 } : PADDING;
		if (Number.isFinite(b.west)) m.fitBounds([b.west, b.south, b.east, b.north], { padding, duration: 0 });
	}

	// große Karte: wird ein anderer Weg gewählt, die Ansicht auf ihn setzen
	$effect(() => {
		void activeId;
		if (!map || !expanded || routes.length < 2) return;
		const m = map;
		setTimeout(() => {
			m.resize();
			fitRoutes(m);
		}, 60);
	});

	$effect(() => {
		const large = expanded;
		if (!map) return;
		const m = map;
		// große Karte: mit einem Finger verschieben; kleine Karte: zwei Finger, damit die Seite scrollbar bleibt
		if (large) m.cooperativeGestures.disable();
		else m.cooperativeGestures.enable();
		document.body.style.overflow = large ? 'hidden' : '';
		requestAnimationFrame(() => {
			m.resize();
			if (!focusStopId) fitRoutes(m);
		});
		return () => {
			document.body.style.overflow = '';
		};
	});

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
				// Start und Ziel als beschriftetes Schild mit Spitze („Start“, „Ziel“, bei Runden „Start und Ziel“) – kein farbiger Punkt, den man für
					// einen Weg halten könnte (Jan, 14.10.2026)
					const start = markers.find((m) => m.kind === 'start');
					const goal = markers.find((m) => m.kind === 'destination');
					const together = !!start && !!goal && distance(start.lngLat, goal.lngLat) < 300;
					const signs = together ? [{ lngLat: start!.lngLat, text: 'Start und Ziel' }] : markers.map((m) => ({ lngLat: m.lngLat, text: m.kind === 'start' ? 'Start' : 'Ziel' }));
					for (const sign of signs) {
						const element = document.createElement('div');
						element.className = 'map-marker';
						element.textContent = sign.text;
						element.setAttribute('aria-hidden', 'true');
						// die Spitze unter dem Schild zeigt auf den Punkt
						new maplibre.Marker({ element, anchor: 'bottom', offset: [0, 10] }).setLngLat(sign.lngLat).addTo(instance);
					}
				createMarker = (element, lngLat, options) =>
					new maplibre.Marker({ element, ...options }).setLngLat(lngLat).addTo(instance);
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
				for (const layer of [`route-${id}-arrows`, `route-${id}`, `route-${id}-casing`]) {
					if (m.getLayer(layer)) m.removeLayer(layer);
				}
				if (m.getSource(`route-${id}`)) m.removeSource(`route-${id}`);
			}
			for (const r of routes) {
				if (!m.hasImage(arrowName(r.color))) m.addImage(arrowName(r.color), arrowImage(r.color), { pixelRatio: 2 });
			}
			for (const r of routes) {
				m.addSource(`route-${r.id}`, {
					type: 'geojson',
					data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.coordinates } },
					// stärker vereinfachen als üblich: winzige Zacken ergeben mit dem seitlichen Versatz sonst Beulen
					tolerance: 1.5
				});
			}
			// erst alle hellen Ränder, dann alle Linien, dann die Pfeile – so verdeckt kein Rand eine Nachbarlinie
			routes.forEach((r) =>
				m.addLayer({
					id: `route-${r.id}-casing`,
					type: 'line',
					source: `route-${r.id}`,
					layout: { 'line-join': 'round', 'line-cap': 'round' },
					paint: { 'line-color': '#FDFBF5', 'line-width': LINE_WIDTH + 4 }
				})
			);
			routes.forEach((r) => {
				m.addLayer({
					id: `route-${r.id}`,
					type: 'line',
					source: `route-${r.id}`,
					layout: { 'line-join': 'round', 'line-cap': 'round' },
					paint: { 'line-color': r.color, 'line-width': LINE_WIDTH }
				});
				m.on('click', `route-${r.id}`, () => onselect?.(r.id));
				m.on('mouseenter', `route-${r.id}`, () => (m.getCanvas().style.cursor = 'pointer'));
				m.on('mouseleave', `route-${r.id}`, () => (m.getCanvas().style.cursor = ''));
			});
			// Fahrtrichtung: Pfeile auf der Linie
			routes.forEach((r) =>
				m.addLayer({
					id: `route-${r.id}-arrows`,
					type: 'symbol',
					source: `route-${r.id}`,
					layout: {
						'symbol-placement': 'line',
						'symbol-spacing': ARROW_SPACING,
						'icon-image': arrowName(r.color),
						'icon-rotation-alignment': 'map',
						'icon-allow-overlap': true,
						'icon-ignore-placement': true
					}
				})
			);
			shownRouteIds = ids;
			fitRoutes(m);
		}

		// Mehrere Wege: alle zu sehen, jeder in seiner Farbe; der gewählte kräftig und oben, mit Pfeilen in Fahrtrichtung,
		// die anderen etwas dünner. Solange eine Vorschau offen ist: die Tour blass, ohne Pfeile
		// (sonst ist grün neben grün nicht zu unterscheiden).
		const active = activeId;
		const multi = routes.length > 1;
		const dim = !!preview;
		for (const r of routes) {
			const chosen = r.id === active || !multi;
			const width = multi ? (chosen ? LINE_WIDTH + 1 : LINE_WIDTH - 1) : LINE_WIDTH;
			const opacity = dim ? 0.3 : chosen ? 1 : 0.85;
			m.setLayoutProperty(`route-${r.id}`, 'visibility', 'visible');
			m.setLayoutProperty(`route-${r.id}-casing`, 'visibility', 'visible');
			m.setPaintProperty(`route-${r.id}`, 'line-width', width);
			m.setPaintProperty(`route-${r.id}-casing`, 'line-width', width + 4);
			m.setPaintProperty(`route-${r.id}`, 'line-opacity', opacity);
			m.setPaintProperty(`route-${r.id}-casing`, 'line-opacity', opacity);
			m.setLayoutProperty(`route-${r.id}-arrows`, 'visibility', dim || !chosen ? 'none' : 'visible');
		}
		if (active && m.getLayer(`route-${active}`)) {
			m.moveLayer(`route-${active}-casing`);
			m.moveLayer(`route-${active}`);
			m.moveLayer(`route-${active}-arrows`);
		}
	});

	// Nummernschilder der Wege: je Weg an einer Stelle, die von den anderen Wegen weit weg liegt
	let badgeMarkers: Marker[] = [];
	$effect(() => {
		if (!createMarker) return;
		const numbered = preview ? [] : routes.filter((r) => r.number !== undefined && r.coordinates.length > 1);
		const spots = badgeSpots(numbered.map((r) => r.coordinates));
		numbered.forEach((r, i) => {
			const element = badgeElements[r.id];
			if (element) badgeMarkers.push(createMarker!(element, spots[i]));
		});
		return () => {
			for (const marker of badgeMarkers) marker.remove();
			badgeMarkers = [];
		};
	});

	// Stopp-Symbole: Svelte zeichnet die Elemente (unten), MapLibre setzt sie an ihre Stelle auf der Karte
	$effect(() => {
		if (!createMarker) return;
		const wanted = new Set(preview ? [] : stops.map((s) => s.id));
		for (const [id, marker] of stopMarkers) {
			if (!wanted.has(id)) {
				marker.remove();
				stopMarkers.delete(id);
			}
		}
		for (const stop of stops) {
			const element = stopElements[stop.id];
			if (wanted.has(stop.id) && element && !stopMarkers.has(stop.id)) stopMarkers.set(stop.id, createMarker(element, stop.lngLat));
		}
	});

	// Highlights: Symbole mit Namen – nur in der großen Karte (die kleine bleibt ruhig)
	$effect(() => {
		if (!createMarker) return;
		const shown = preview ? [] : highlights;
		const wanted = new Set(expanded ? shown.map((h) => h.id) : []);
		for (const [id, marker] of highlightMarkers) {
			if (!wanted.has(id)) {
				marker.remove();
				highlightMarkers.delete(id);
			}
		}
		for (const h of highlights) {
			const element = highlightElements[h.id];
			if (wanted.has(h.id) && element && !highlightMarkers.has(h.id))
				highlightMarkers.set(h.id, createMarker(element, h.lngLat, { anchor: 'bottom', offset: [0, -4] }));
		}
	});

	// Vorschau eines Tauschs: Linien und Schilder „Bisher“ / „Neu“, die Karte zeigt die Stelle
	let previewMarkers: Marker[] = [];
	$effect(() => {
		if (!map || !loaded || !createMarker) return;
		const m = map;
		const draw = preview;
		const ids = ['preview-old-casing', 'preview-old', 'preview-new-casing', 'preview-new'];
		for (const marker of previewMarkers) marker.remove();
		previewMarkers = [];
		for (const id of ids) if (m.getLayer(id)) m.removeLayer(id);
		for (const id of ['preview-old', 'preview-new']) if (m.getSource(id)) m.removeSource(id);
		if (!draw) return;
		const feature = (coordinates: LngLat[]) =>
			({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }) as const;
		m.addSource('preview-old', { type: 'geojson', data: feature(draw.oldLine), tolerance: 1.5 });
		m.addSource('preview-new', { type: 'geojson', data: feature(draw.newLine), tolerance: 1.5 });
		const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
		m.addLayer({ id: 'preview-old-casing', type: 'line', source: 'preview-old', layout: round, paint: { 'line-color': '#FDFBF5', 'line-width': 12 } });
		m.addLayer({ id: 'preview-old', type: 'line', source: 'preview-old', layout: round, paint: { 'line-color': '#B0552F', 'line-width': 8 } });
		m.addLayer({ id: 'preview-new-casing', type: 'line', source: 'preview-new', layout: round, paint: { 'line-color': '#FDFBF5', 'line-width': 12 } });
		m.addLayer({
			id: 'preview-new',
			type: 'line',
			source: 'preview-new',
			layout: { 'line-join': 'round', 'line-cap': 'butt' },
			paint: { 'line-color': '#4B5A22', 'line-width': 8, 'line-dasharray': [1.6, 1.1] }
		});
		// Schilder: dort, wo sich die beiden Wege am deutlichsten unterscheiden
		const far = (line: LngLat[], other: LngLat[]): LngLat => {
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
		};
		const pill = (text: string, kind: 'old' | 'new', at: LngLat) => {
			const element = document.createElement('div');
			element.className = `preview-pill ${kind}`;
			element.textContent = text;
			// neben der Linie statt darauf: „Neu“ oberhalb, „Bisher“ unterhalb
			const above = kind === 'new';
			previewMarkers.push(
				createMarker!(element, at, { anchor: above ? 'bottom' : 'top', offset: [0, above ? -10 : 10] })
			);
		};
		const sign = draw.extraMeters >= 100 ? `+${(draw.extraMeters / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km` : draw.extraMeters <= -100 ? `${(-draw.extraMeters / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km kürzer` : 'gleich lang';
		pill('Bisher', 'old', far(draw.oldLine, draw.newLine));
		pill(`Neu · ${sign}`, 'new', far(draw.newLine, draw.oldLine));
		const b = boundsOf([draw.oldLine, draw.newLine]);
		if (Number.isFinite(b.west)) {
			// in der großen Karte bleibt die untere Hälfte für das Fenster frei
			// kurz warten, bis das Fenster seine Höhe hat (setTimeout statt requestAnimationFrame: läuft auch, wenn die Seite im Hintergrund ist)
			setTimeout(() => {
				// unten bleibt Platz für das Fenster (höchstens gut die Hälfte der Karte, sonst bliebe fast nichts zum Ansehen)
				m.resize(); // die Größe der Karte stimmt sonst nicht, wenn sie gerade erst groß geworden ist
				const height = m.getContainer().clientHeight;
				const bottom = expanded ? Math.min((sheetSlot?.offsetHeight ?? height * 0.5) + 16, height * 0.55) : 50;
				const top = expanded ? Math.min(90, height * 0.15) : 90;
				m.fitBounds([b.west, b.south, b.east, b.north], { padding: { top, bottom, left: 60, right: 60 }, duration: 0, maxZoom: 16 });
			}, 60);
		}
		return () => {
			for (const marker of previewMarkers) marker.remove();
			previewMarkers = [];
		};
	});

	// Zum gewählten Stopp springen (ohne Animation, wenn der Nutzer weniger Bewegung wünscht)
	$effect(() => {
		const stop = stops.find((s) => s.id === focusStopId);
		if (!map || !stop) return;
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		map.easeTo({ center: stop.lngLat, zoom: Math.max(map.getZoom(), 15), duration: reduce ? 0 : 600 });
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && closeLarge()} />

<div class="route-map" class:expanded>
	<div class="canvas" bind:this={container} role="img" aria-label={label}></div>
	{#if failed}
		<p class="fallback">Die Karte kann auf diesem Gerät leider nicht angezeigt werden. Alle Angaben finden Sie unten.</p>
	{:else if expanded}
		<button type="button" class="map-button close" onclick={closeLarge}>
			<X size={24} strokeWidth={2.5} aria-hidden="true" /> Karte schließen
		</button>
	{:else}
		<button type="button" class="map-button open" onclick={openLarge}>
			<Maximize2 size={22} strokeWidth={2.5} aria-hidden="true" /> Karte vergrößern
		</button>
	{/if}
	{#if expanded && sheet}
		<div class="sheet-slot" bind:this={sheetSlot}>{@render sheet()}</div>
	{/if}
	{#if popup}
		<div class="popup-slot">{@render popup()}</div>
	{/if}
	<!-- Vorlagen für die Stopp-Symbole; MapLibre hängt sie in die Karte um -->
	<div class="stop-pool" aria-hidden="true">
		{#each routes as r (r.id)}
			{#if r.number !== undefined}
				<button
					type="button"
					bind:this={badgeElements[r.id]}
					class="route-badge"
					class:selected={r.id === activeId}
					style:--badge-color={r.color}
					aria-label="Weg {r.number} zeigen"
					onclick={() => onselect?.(r.id)}
				>
					<span>{r.number}</span>
				</button>
			{/if}
		{/each}
		{#each highlights as h (h.id)}
			<button
				type="button"
				bind:this={highlightElements[h.id]}
				class="highlight-marker"
				class:water={h.water}
				class:selected={h.id === selectedHighlightId}
				onclick={() => onhighlight?.(h.id)}
			>
				<span class="highlight-icon">
					{#if h.water}<Waves size={20} strokeWidth={2.25} />{:else}<Trees size={20} strokeWidth={2.25} />{/if}
				</span>
				<span class="highlight-label">{h.label}</span>
			</button>
		{/each}
		{#each stops as stop (stop.id)}
			{@const style = stopIcons[stop.kind]}
			<div
				bind:this={stopElements[stop.id]}
				class="stop-marker"
				class:focused={stop.id === focusStopId}
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

	/* große Karte: ganzer Bildschirm, über allem (auch über der unteren Leiste) */
	.route-map.expanded {
		position: fixed;
		inset: 0;
		z-index: 50;
		border-radius: 0;
		border: 0;
	}

	.map-button {
		position: absolute;
		top: 0.625rem;
		left: 0.625rem;
		z-index: 2;
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		min-height: var(--tap);
		padding: 0.5rem 0.875rem;
		border: 2px solid var(--color-green);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-green);
		font-weight: 700;
		box-shadow: 0 1px 4px rgb(36 53 57 / 0.25);
		cursor: pointer;
	}

	.map-button.close {
		top: max(0.75rem, env(safe-area-inset-top));
		background: var(--color-green);
		color: var(--color-surface);
		font-size: var(--text-large);
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

	/* Start- und Zielschild: helle Fläche, dunkelgrüner Rand und Schrift, Spitze nach unten – deutlich etwas anderes als die farbigen Nummernschilder der Wege */
	.route-map :global(.map-marker) {
		/* (nicht position ändern: MapLibre setzt das Schild selbst absolut auf den Punkt) */
		padding: 0.125rem 0.625rem;
		border: 3px solid var(--color-green);
		border-radius: 0.75rem;
		background: var(--color-surface);
		color: var(--color-green);
		font-size: var(--text-small);
		font-weight: 700;
		line-height: 1.2;
		white-space: nowrap;
		box-shadow: 0 1px 4px rgb(36 53 57 / 0.4);
	}

	.route-map :global(.map-marker::after) {
		content: '';
		position: absolute;
		left: 50%;
		top: 100%;
		margin-left: -0.5rem;
		border: 0.5rem solid transparent;
		border-top-color: var(--color-green);
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
		background: var(--color-orange);
		color: var(--color-surface);
		box-shadow: 0 1px 4px rgb(36 53 57 / 0.35);
	}

	/* Fenster am unteren Rand der großen Karte */
	.sheet-slot {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 3;
		max-height: 58%;
		overflow-y: auto;
		border-radius: 1.5rem 1.5rem 0 0;
	}

	/* Infofenster über der Karte: unten, auf der ganzen Breite */
	.popup-slot {
		position: absolute;
		left: 0.5rem;
		right: 0.5rem;
		bottom: 0.5rem;
		z-index: 4;
	}

	.route-map.expanded .popup-slot {
		left: 0.75rem;
		right: 0.75rem;
		bottom: max(0.75rem, env(safe-area-inset-bottom));
	}

	/* Schilder „Bisher“ / „Neu“ der Vorschau */
	.route-map :global(.preview-pill) {
		padding: 0.125rem 0.625rem;
		border-radius: 999px;
		border: 2px solid var(--color-surface);
		color: #fff;
		font-size: var(--text-small);
		font-weight: 700;
		white-space: nowrap;
		box-shadow: 0 1px 4px rgb(36 53 57 / 0.4);
	}

	.route-map :global(.preview-pill.old) {
		background: #b0552f;
	}

	.route-map :global(.preview-pill.new) {
		background: #4b5a22;
	}

	/* Highlight: Symbol (Wasser blau, Grün dunkelgrün) mit Namen, antippbar (≥ 44 px), gewähltes orange */
	.route-map :global(.highlight-marker) {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-height: 2.75rem;
		padding: 0.25rem 0.75rem 0.25rem 0.25rem;
		border: 2px solid var(--color-surface);
		border-radius: 999px;
		background: var(--color-green);
		color: var(--color-surface);
		font: inherit;
		font-size: var(--text-small);
		font-weight: 700;
		white-space: nowrap;
		box-shadow: 0 1px 6px rgb(36 53 57 / 0.45);
		cursor: pointer;
	}

	.route-map :global(.highlight-marker.water) {
		background: var(--color-blue);
	}

	.route-map :global(.highlight-marker.selected) {
		background: var(--color-orange);
		z-index: 2;
	}

	.route-map :global(.highlight-icon) {
		display: grid;
		place-items: center;
		width: 2.125rem;
		height: 2.125rem;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.2);
	}

	.route-map :global(.highlight-label) {
		max-width: 11rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Nummernschild eines Wegs: Tap-Fläche 48 px, sichtbar eine Scheibe in der Wegfarbe, der gewählte größer mit Ring */
	.route-map :global(.route-badge) {
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		padding: 0;
		border: 0;
		background: transparent;
		cursor: pointer;
	}

	.route-map :global(.route-badge span) {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border: 3px solid var(--color-surface);
		border-radius: 50%;
		background: var(--badge-color);
		color: #fff;
		font-size: var(--text-base);
		font-weight: 700;
		box-shadow: 0 1px 4px rgb(36 53 57 / 0.5);
	}

	.route-map :global(.route-badge.selected) {
		z-index: 2;
	}

	.route-map :global(.route-badge.selected span) {
		width: 2.5rem;
		height: 2.5rem;
		font-size: var(--text-large);
		box-shadow:
			0 0 0 3px var(--badge-color),
			0 1px 6px rgb(36 53 57 / 0.5);
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
