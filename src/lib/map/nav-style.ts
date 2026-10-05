/**
 * Ruhiger Kartenstil für die Navigation: nur Wege, Wasser, Wald/Grün und wenige große Namen.
 * Keine Gebäude, keine Symbole, keine Hausnummern – man soll beim kurzen Hinschauen sofort verstehen.
 * „dunkel“ (Standard, spart auf OLED-Bildschirmen Strom) und „hell“ (für pralle Sonne).
 * Daten: OpenFreeMap (OpenMapTiles-Schema), © OpenStreetMap-Mitwirkende.
 */
import type { StyleSpecification } from 'maplibre-gl';

export type NavTheme = 'dark' | 'light';

const PALETTE = {
	dark: {
		background: '#000000',
		water: '#1d4a5e',
		green: '#173a24',
		minor: '#6b787e',
		major: '#a3aeb3',
		label: '#CFD8DC',
		halo: '#000000',
		route: '#F1B34C',
		routeCasing: '#000000'
	},
	light: {
		background: '#F7F2E5',
		water: '#AFC6D1',
		green: '#DCE3C4',
		minor: '#CDBF99',
		major: '#A8956A',
		label: '#243539',
		halo: '#F7F2E5',
		route: '#B0552F',
		routeCasing: '#FDFBF5'
	}
} as const;

export function navColors(theme: NavTheme) {
	return PALETTE[theme];
}

const MAJOR = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];
const MINOR = ['minor', 'service', 'track', 'path', 'cycleway', 'pedestrian', 'bridleway'];
const NAME = ['coalesce', ['get', 'name:de'], ['get', 'name']];

export function navStyle(theme: NavTheme): StyleSpecification {
	const c = PALETTE[theme];
	return {
		version: 8,
		glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
		sources: {
			openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' }
		},
		layers: [
			{ id: 'background', type: 'background', paint: { 'background-color': c.background } },
			{
				id: 'green',
				type: 'fill',
				source: 'openmaptiles',
				'source-layer': 'landcover',
				filter: ['match', ['get', 'class'], ['wood', 'grass'], true, false],
				paint: { 'fill-color': c.green }
			},
			{
				id: 'park',
				type: 'fill',
				source: 'openmaptiles',
				'source-layer': 'park',
				paint: { 'fill-color': c.green }
			},
			{
				id: 'water',
				type: 'fill',
				source: 'openmaptiles',
				'source-layer': 'water',
				paint: { 'fill-color': c.water }
			},
			{
				id: 'waterway',
				type: 'line',
				source: 'openmaptiles',
				'source-layer': 'waterway',
				filter: ['match', ['get', 'class'], ['river', 'canal'], true, false],
				paint: { 'line-color': c.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 8] }
			},
			{
				id: 'roads-minor',
				type: 'line',
				source: 'openmaptiles',
				'source-layer': 'transportation',
				filter: ['match', ['get', 'class'], MINOR, true, false],
				layout: { 'line-cap': 'round', 'line-join': 'round' },
				paint: { 'line-color': c.minor, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 17, 5] }
			},
			{
				id: 'roads-major',
				type: 'line',
				source: 'openmaptiles',
				'source-layer': 'transportation',
				filter: ['match', ['get', 'class'], MAJOR, true, false],
				layout: { 'line-cap': 'round', 'line-join': 'round' },
				paint: { 'line-color': c.major, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 9] }
			},
			{
				id: 'street-names',
				type: 'symbol',
				source: 'openmaptiles',
				'source-layer': 'transportation_name',
				minzoom: 15,
				layout: {
					'symbol-placement': 'line',
					'symbol-spacing': 400,
					'text-field': NAME as never,
					'text-font': ['Noto Sans Bold'],
					'text-size': 16,
					'text-max-angle': 30
				},
				paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 2 }
			},
			{
				id: 'places',
				type: 'symbol',
				source: 'openmaptiles',
				'source-layer': 'place',
				filter: ['match', ['get', 'class'], ['city', 'town', 'village', 'suburb'], true, false],
				maxzoom: 15,
				layout: { 'text-field': NAME as never, 'text-font': ['Noto Sans Bold'], 'text-size': 18 },
				paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 2 }
			}
		]
	};
}
