// Gleiche Anfragen an einen GraphHopper schicken und Zeiten messen: node bench-gh.mjs <port> <name>
const port = process.argv[2];
const name = process.argv[3] ?? port;
const url = `http://localhost:${port}/route`;

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const DETAILS = ['road_class', 'bike_network', 'surface', 'smoothness', 'street_name', 'average_slope', 'road_environment', 'max_speed'];
// Duisburg / Moers / Krefeld / Kempen: im Gebiet, das beide Graphen kennen
const pt = () => [6.4 + rnd() * 0.5, 51.3 + rnd() * 0.25];
const km = (a, b) => Math.hypot((a[0] - b[0]) * 69.5, (a[1] - b[1]) * 111);
const pair = () => {
	for (;;) {
		const a = pt(), b = pt();
		const d = km(a, b);
		if (d > 8 && d < 25) return [a, b];
	}
};
const ring = (c, r) => Array.from({ length: 12 }, (_, i) => [c[0] + (Math.cos((i / 12) * 6.283) * r) / 69.5, c[1] + (Math.sin((i / 12) * 6.283) * r) / 111]);

const reqs = [];
for (let i = 0; i < 12; i++) {
	const [a, b] = pair();
	reqs.push({ kind: 'direkt', body: { points: [a, b] } });
}
for (let i = 0; i < 6; i++) {
	const [a, b] = pair();
	reqs.push({ kind: 'alternativen', body: { points: [a, b], algorithm: 'alternative_route', 'alternative_route.max_paths': 3, 'alternative_route.max_weight_factor': 1.4, 'alternative_route.max_share_factor': 0.7 } });
}
for (let i = 0; i < 12; i++) {
	const [a, b] = pair();
	const v = [(a[0] + b[0]) / 2 + (rnd() - 0.5) * 0.1, (a[1] + b[1]) / 2 + (rnd() - 0.5) * 0.06];
	reqs.push({ kind: 'ueber Punkt', body: { points: [a, v, b], pass_through: true } });
}
for (let i = 0; i < 8; i++) {
	const [a, b] = pair();
	const c = [(a[0] + b[0]) / 2 + (rnd() - 0.5) * 0.08, (a[1] + b[1]) / 2 + (rnd() - 0.5) * 0.05];
	const features = [{ type: 'Feature', id: 'schoen0', properties: {}, geometry: { type: 'Polygon', coordinates: [[...ring(c, 4), ring(c, 4)[0]]] } }];
	reqs.push({ kind: 'mit Gebiet', body: { points: [a, b], custom_model: { priority: [{ if: '!in_schoen0', multiply_by: '0.12' }], areas: { type: 'FeatureCollection', features } } } });
}

async function one(r) {
	const body = { profile: 'genuss', 'ch.disable': true, elevation: true, points_encoded: false, instructions: true, locale: 'de', details: DETAILS, ...r.body };
	const t = performance.now();
	const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
	const text = await res.text();
	const ms = performance.now() - t;
	let km = 0;
	try { km = JSON.parse(text).paths?.[0]?.distance / 1000 || 0; } catch {}
	return { ms, bytes: text.length, ok: res.ok, km };
}

const stat = (xs) => {
	const s = [...xs].sort((a, b) => a - b);
	return { med: s[Math.floor(s.length / 2)], p90: s[Math.floor(s.length * 0.9)], sum: s.reduce((a, b) => a + b, 0) };
};

// Aufwärmen
for (const r of reqs.slice(0, 6)) await one(r);
// einzeln nacheinander, 2 Durchgänge
const byKind = {};
let fails = 0;
let kmSum = 0;
for (let round = 0; round < 2; round++)
	for (const r of reqs) {
		const x = await one(r);
		if (!x.ok) fails++;
		(byKind[r.kind] ??= []).push(x.ms);
		if (round === 0) kmSum += x.km;
	}
console.log(`== ${name} (Port ${port}) – ${reqs.length} Anfragen × 2, nacheinander`);
let all = [];
for (const [k, v] of Object.entries(byKind)) {
	const s = stat(v);
	all = all.concat(v);
	console.log(`${k.padEnd(14)} Median ${s.med.toFixed(0)} ms  p90 ${s.p90.toFixed(0)} ms  (${v.length})`);
}
const s = stat(all);
console.log(`alle           Median ${s.med.toFixed(0)} ms  p90 ${s.p90.toFixed(0)} ms  Summe ${(s.sum / 1000).toFixed(1)} s  Fehler ${fails}  Länge Σ ${kmSum.toFixed(0)} km`);

// vier gleichzeitig (so arbeitet die App)
const t0 = performance.now();
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => { while (next < reqs.length) await one(reqs[next++]); }));
console.log(`4 gleichzeitig: ${reqs.length} Anfragen in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
