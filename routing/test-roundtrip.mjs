/**
 * Testet Rundtouren gegen den lokalen GraphHopper (http://localhost:8989).
 * Zeigt je Tour Länge, Höhenmeter und Anteile (Radnetz, Radweg/Wirtschaftsweg, große Straßen, schlechter Belag)
 * und speichert jede Tour als GPX-Datei in routing/test-output/.
 *
 * Aufruf (im Projektordner):
 *   node routing/test-roundtrip.mjs                       30 km ab Duisburg-Innenhafen, 6 Varianten
 *   node routing/test-roundtrip.mjs --km 20 --gemuetlich  Steigungen zusätzlich meiden
 *   node routing/test-roundtrip.mjs --start 51.4596,6.6228 --vergleich   Start Moers, zusätzlich Profil „bike“
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const GRAPHHOPPER = process.env.GRAPHHOPPER_URL ?? 'http://localhost:8989';
const args = parseArgs(process.argv.slice(2));
const km = Number(args.km ?? 30);
const [lat, lon] = (args.start ?? '51.4386,6.7623').split(',').map(Number); // Duisburg-Innenhafen
const variants = Number(args.anzahl ?? 6);
const profiles = args.vergleich ? ['genuss', 'bike'] : ['genuss'];

const gemuetlich = args.gemuetlich
	? JSON.parse(stripComments(await readFile(new URL('./custom_models/gemuetlich.json', import.meta.url), 'utf8')))
	: undefined;

const MAJOR_ROADS = new Set(['trunk', 'primary', 'secondary']);
const QUIET_WAYS = new Set(['cycleway', 'track', 'living_street', 'path']);
const BAD_SURFACES = new Set(['sand', 'grass', 'dirt', 'ground', 'cobblestone', 'gravel']);

await mkdir(new URL('./test-output/', import.meta.url), { recursive: true });

console.log(
	`Rundtouren ${km} km ab ${lat}, ${lon}${gemuetlich ? ' · gemütlich' : ''} – ${variants} Varianten\n`
);
console.log('Profil   Var.    km   Höhenm.  Radnetz  ruhige Wege  große Str.  schl. Belag  Rechenzeit');

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

		const row = [
			profile.padEnd(8),
			String(seed).padStart(4),
			(path.distance / 1000).toFixed(1).padStart(7),
			String(Math.round(path.ascend)).padStart(8),
			pct(share('bike_network', (v) => v !== 'missing')).padStart(8),
			pct(share('road_class', (v) => QUIET_WAYS.has(v))).padStart(12),
			pct(share('road_class', (v) => MAJOR_ROADS.has(v))).padStart(11),
			pct(share('surface', (v) => BAD_SURFACES.has(v))).padStart(12),
			`${((Date.now() - started) / 1000).toFixed(1)} s`.padStart(11)
		];
		console.log(row.join(' '));

		const name = `rundtour-${km}km-${profile}${gemuetlich ? '-gemuetlich' : ''}-${seed}`;
		await writeFile(new URL(`./test-output/${name}.gpx`, import.meta.url), toGpx(name, coords));
	}
}

console.log('\nGPX-Dateien: routing/test-output/ (z. B. auf https://gpx.studio ansehen)');

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

function stripComments(text) {
	return text.replace(/^\s*\/\/.*$/gm, '');
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
