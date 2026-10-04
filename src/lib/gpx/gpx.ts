/**
 * GPX-Export (F12): Tour als Datei für andere Navi-Apps und Fahrradcomputer.
 * GPX 1.1 – ein Track mit Höhen, dazu die Einkehr-Stopps als Wegpunkte.
 */

export interface GpxWaypoint {
	lngLat: [number, number];
	name: string;
	/** z. B. „Biergarten“ */
	type?: string;
}

export interface GpxInput {
	name: string;
	/** [Länge, Breite, Höhe in m] – Höhe darf fehlen */
	track: ([number, number] | [number, number, number])[];
	waypoints?: GpxWaypoint[];
}

function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/** 6 Nachkommastellen ≈ 10 cm – genauer braucht es niemand */
const coord = (value: number) => value.toFixed(6);

export function toGpx({ name, track, waypoints = [] }: GpxInput): string {
	const title = escapeXml(name);
	const wpts = waypoints.map(
		(w) =>
			`  <wpt lat="${coord(w.lngLat[1])}" lon="${coord(w.lngLat[0])}">\n` +
			`    <name>${escapeXml(w.name)}</name>\n` +
			(w.type ? `    <type>${escapeXml(w.type)}</type>\n` : '') +
			`  </wpt>`
	);
	const points = track.map(([lon, lat, ele]) =>
		ele === undefined || !Number.isFinite(ele)
			? `      <trkpt lat="${coord(lat)}" lon="${coord(lon)}"/>`
			: `      <trkpt lat="${coord(lat)}" lon="${coord(lon)}"><ele>${ele.toFixed(1)}</ele></trkpt>`
	);
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<gpx version="1.1" creator="Genuss-Radeln" xmlns="http://www.topografix.com/GPX/1/1">',
		`  <metadata><name>${title}</name></metadata>`,
		...wpts,
		'  <trk>',
		`    <name>${title}</name>`,
		'    <type>cycling</type>',
		'    <trkseg>',
		...points,
		'    </trkseg>',
		'  </trk>',
		'</gpx>',
		''
	].join('\n');
}

/** Dateiname aus dem Tourtitel: „Am Rhein entlang über Meerbusch“ → „Genuss-Radeln Am Rhein entlang über Meerbusch.gpx“ */
export function gpxFileName(title: string): string {
	const clean = title
		.replace(/[\\/:*?"<>|„“]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
	return `Genuss-Radeln ${clean || 'Tour'}.gpx`;
}

/** Datei im Browser herunterladen (Handy: landet im Ordner „Downloads“) */
export function downloadGpx(input: GpxInput): void {
	const blob = new Blob([toGpx(input)], { type: 'application/gpx+xml' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = gpxFileName(input.name);
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
