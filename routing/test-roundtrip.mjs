/**
 * Testet Rundtouren gegen den lokalen GraphHopper (http://localhost:8989).
 * Zeigt je Tour Länge, Höhenmeter und Anteile (Radnetz, Radweg/Wirtschaftsweg, große Straßen, schlechter Belag)
 * und speichert jede Tour als GPX-Datei in routing/test-output/.
 * Zusätzlich entsteht routing/test-output/karte.html: alle Touren auf einer Karte zum Vergleichen
 * (im Browser öffnen; braucht Internet für Kartenhintergrund und MapLibre).
 *
 * Aufruf (im Projektordner):
 *   node routing/test-roundtrip.mjs                       30 km ab Duisburg-Innenhafen, 6 Varianten
 *   node routing/test-roundtrip.mjs --km 20 --gemuetlich  Steigungen zusätzlich meiden
 *   node routing/test-roundtrip.mjs --start 51.4596,6.6228 --vergleich   Start Moers, zusätzlich Profil „bike“
 */
import { mkdir, writeFile } from 'node:fs/promises';
// dieselbe „gemütlich“-Regel wie in der App (Node 24 lädt TypeScript direkt)
import { GEMUETLICH_MODEL } from '../src/lib/routing/custom-models.ts';

const GRAPHHOPPER = process.env.GRAPHHOPPER_URL ?? 'http://localhost:8989';
const args = parseArgs(process.argv.slice(2));
const km = Number(args.km ?? 30);
const [lat, lon] = (args.start ?? '51.4386,6.7623').split(',').map(Number); // Duisburg-Innenhafen
const variants = Number(args.anzahl ?? 6);
const profiles = args.vergleich ? ['genuss', 'bike'] : ['genuss'];

const gemuetlich = args.gemuetlich ? GEMUETLICH_MODEL : undefined;

const MAJOR_ROADS = new Set(['trunk', 'primary', 'secondary']);
const QUIET_WAYS = new Set(['cycleway', 'track', 'living_street', 'path']);
const BAD_SURFACES = new Set(['sand', 'grass', 'dirt', 'ground', 'cobblestone', 'gravel']);

await mkdir(new URL('./test-output/', import.meta.url), { recursive: true });

console.log(
	`Rundtouren ${km} km ab ${lat}, ${lon}${gemuetlich ? ' · gemütlich' : ''} – ${variants} Varianten\n`
);
console.log('Profil   Var.    km   Höhenm.  Radnetz  ruhige Wege  große Str.  schl. Belag  Rechenzeit');

/** Alle berechneten Touren für die Kartenseite */
const tours = [];

for (const profile of profiles) {
	for (let seed = 0; seed < variants; seed++) {
		const started = Date.now();
		const body = {
			profile,
			points: [[lon, lat]],
			algorithm: 'round_trip',
			'round_trip.distance': km * 1000,
			'round_trip.seed': seed,
			'ch.disable': true,
			elevation: true,
			points_encoded: false,
			instructions: false,
			details: ['road_class', 'bike_network', 'surface']
		};
		if (gemuetlich && profile === 'genuss') body.custom_model = gemuetlich;

		const response = await fetch(`${GRAPHHOPPER}/route`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const result = await response.json();
		if (!response.ok) {
			console.log(`${profile.padEnd(8)} ${String(seed).padStart(4)}   Fehler: ${result.message}`);
			continue;
		}

		const path = result.paths[0];
		const coords = path.points.coordinates;
		const segmentLengths = coords.slice(1).map((c, i) => haversine(coords[i], c));
		const share = (detail, predicate) => {
			let sum = 0;
			for (const [from, to, value] of path.details[detail]) {
				if (!predicate(value)) continue;
				for (let i = from; i < to; i++) sum += segmentLengths[i];
			}
			return sum / path.distance;
		};

		const stats = {
			km: path.distance / 1000,
			ascend: Math.round(path.ascend),
			network: share('bike_network', (v) => v !== 'missing'),
			quiet: share('road_class', (v) => QUIET_WAYS.has(v)),
			major: share('road_class', (v) => MAJOR_ROADS.has(v)),
			badSurface: share('surface', (v) => BAD_SURFACES.has(v))
		};
		const row = [
			profile.padEnd(8),
			String(seed).padStart(4),
			stats.km.toFixed(1).padStart(7),
			String(stats.ascend).padStart(8),
			pct(stats.network).padStart(8),
			pct(stats.quiet).padStart(12),
			pct(stats.major).padStart(11),
			pct(stats.badSurface).padStart(12),
			`${((Date.now() - started) / 1000).toFixed(1)} s`.padStart(11)
		];
		console.log(row.join(' '));

		const name = `rundtour-${km}km-${profile}${gemuetlich ? '-gemuetlich' : ''}-${seed}`;
		await writeFile(new URL(`./test-output/${name}.gpx`, import.meta.url), toGpx(name, coords));

		// Strecke vereinfachen (jeden 3. Punkt), damit die Kartenseite klein bleibt
		const line = coords.filter((_, i) => i % 3 === 0 || i === coords.length - 1).map(([x, y]) => [x, y]);
		tours.push({ name, profile, seed, stats, line, majorSegments: segmentsOf(path, coords, 'road_class', MAJOR_ROADS) });
	}
}

const title = `Rundtouren ${km} km${gemuetlich ? ' · gemütlich' : ''}`;
await writeFile(
	new URL('./test-output/karte.html', import.meta.url),
	toMapPage(title, [lon, lat], tours)
);

console.log('\nKarte mit allen Touren: routing/test-output/karte.html (im Browser öffnen)');
console.log('GPX-Dateien:           routing/test-output/*.gpx');

/** Abschnitte, deren Detailwert in `values` liegt, als Linienstücke (für rote Markierung „große Straße“) */
function segmentsOf(path, coords, detail, values) {
	return path.details[detail]
		.filter(([, , value]) => values.has(value))
		.map(([from, to]) => coords.slice(from, to + 1).map(([x, y]) => [x, y]));
}

function toMapPage(title, start, tours) {
	// Farben aus dem Logo; Vergleichsprofil „bike“ gestrichelt
	const colors = ['#DD8258', '#32596F', '#768641', '#F1B34C', '#283C30', '#8FAFBE', '#CEB37B', '#243539'];
	const data = tours.map((t, i) => ({ ...t, color: colors[t.seed % colors.length], index: i }));
	return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} – Genuss-Radeln Test</title>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.css">
<style>
  body { margin: 0; font: 16px/1.4 system-ui, sans-serif; color: #243539; background: #F7F2E5; display: flex; height: 100vh; }
  #map { flex: 1; }
  aside { width: 22rem; overflow-y: auto; padding: 1rem; box-sizing: border-box; }
  h1 { font-size: 1.3rem; margin: 0 0 .25rem; }
  p.hint { margin: 0 0 1rem; color: #32596F; font-size: .95rem; }
  label { display: flex; gap: .6rem; align-items: flex-start; padding: .6rem; margin-bottom: .5rem; border-radius: .6rem; background: #FDFBF5; border: 2px solid #DDD2B5; cursor: pointer; }
  label:has(input:checked) { border-color: #283C30; }
  .swatch { width: 1.4rem; height: .5rem; border-radius: .25rem; margin-top: .5rem; flex: none; }
  .dashed { background: repeating-linear-gradient(90deg, currentColor 0 6px, transparent 6px 10px) !important; }
  small { color: #32596F; display: block; }
  button { font: inherit; padding: .4rem .8rem; margin: 0 .4rem .8rem 0; border-radius: .5rem; border: 2px solid #283C30; background: #FDFBF5; cursor: pointer; }
  @media (max-width: 700px) { body { flex-direction: column; } aside { width: auto; max-height: 45vh; } }
</style>
</head>
<body>
<aside>
  <h1>${title}</h1>
  <p class="hint">Tour anklicken = ein-/ausblenden. <span style="color:#B0552F;font-weight:700">Rot</span> markiert = große Straße (Bundes-/Landes-/Kreisstraße).${data.some((t) => t.profile === 'bike') ? ' Gestrichelt = normales Fahrradprofil zum Vergleich.' : ''}</p>
  <button id="all">Alle</button><button id="none">Keine</button>
  <div id="list"></div>
</aside>
<div id="map"></div>
<script type="module">
  import { Map, NavigationControl, Marker } from 'https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs';
  const tours = ${JSON.stringify(data)};
  const pct = (v) => Math.round(v * 100) + ' %';
  const list = document.getElementById('list');
  for (const t of tours) {
    const label = document.createElement('label');
    label.innerHTML = \`<input type="checkbox" checked data-i="\${t.index}">
      <span class="swatch \${t.profile === 'bike' ? 'dashed' : ''}" style="background:\${t.color};color:\${t.color}"></span>
      <span><strong>\${t.profile} · Variante \${t.seed}</strong> – \${t.stats.km.toFixed(1)} km
      <small>Radnetz \${pct(t.stats.network)} · ruhige Wege \${pct(t.stats.quiet)} · große Straßen \${pct(t.stats.major)} · schlechter Belag \${pct(t.stats.badSurface)}</small></span>\`;
    list.append(label);
  }
  const map = new Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/liberty', center: ${JSON.stringify(start)}, zoom: 11 });
  map.addControl(new NavigationControl());
  new Marker({ color: '#283C30' }).setLngLat(${JSON.stringify(start)}).addTo(map);
  // Ausschnitt so wählen, dass alle Touren ganz zu sehen sind
  const xs = tours.flatMap((t) => t.line.map((p) => p[0])), ys = tours.flatMap((t) => t.line.map((p) => p[1]));
  if (xs.length) map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 30, duration: 0 });
  map.on('load', () => {
    for (const t of tours) {
      map.addSource('t' + t.index, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: t.line } } });
      map.addLayer({ id: 't' + t.index, type: 'line', source: 't' + t.index,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': t.color, 'line-width': 5, 'line-opacity': 0.9, ...(t.profile === 'bike' ? { 'line-dasharray': [2, 1.5] } : {}) } });
      map.addSource('m' + t.index, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: t.majorSegments } } });
      map.addLayer({ id: 'm' + t.index, type: 'line', source: 'm' + t.index,
        paint: { 'line-color': '#B0552F', 'line-width': 2.5 } });
    }
    const set = (i, on) => ['t' + i, 'm' + i].forEach((id) => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
    list.addEventListener('change', (e) => set(e.target.dataset.i, e.target.checked));
    document.getElementById('all').onclick = () => list.querySelectorAll('input').forEach((c) => { c.checked = true; set(c.dataset.i, true); });
    document.getElementById('none').onclick = () => list.querySelectorAll('input').forEach((c) => { c.checked = false; set(c.dataset.i, false); });
  });
</script>
</body>
</html>
`;
}

function parseArgs(list) {
	const out = {};
	for (let i = 0; i < list.length; i++) {
		if (!list[i].startsWith('--')) continue;
		const key = list[i].slice(2);
		const next = list[i + 1];
		out[key] = next && !next.startsWith('--') ? (i++, next) : true;
	}
	return out;
}

function haversine([lon1, lat1], [lon2, lat2]) {
	const rad = Math.PI / 180;
	const a =
		Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
		Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
	return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

function pct(value) {
	return `${Math.round(value * 100)} %`;
}

function toGpx(name, coords) {
	const points = coords
		.map(([lon, lat, ele]) => `      <trkpt lat="${lat}" lon="${lon}">${ele != null ? `<ele>${ele.toFixed(1)}</ele>` : ''}</trkpt>`)
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Genuss-Radeln Test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}
