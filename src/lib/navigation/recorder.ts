/**
 * Fahrt aufzeichnen (Testbetrieb): Jede Standortmeldung mit dem, was die App daraus gemacht hat (Stelle auf der Strecke, Abstand,
 * Entfernung zur nächsten Abzweigung), dazu Ereignisse wie Ansagen, „Strecke verlassen“, Bildschirm aus/an und Lücken in den
 * Meldungen. So lässt sich nachher nachvollziehen, was gefahren wurde und warum die Anzeige gesprungen ist.
 * Die Aufzeichnung bleibt auf dem Gerät, bis die Person die Datei selbst weitergibt.
 */
import type { Fix, NavView } from './guidance';

export interface RideSample {
	/** Zeitpunkt der Messung (ms seit 1970) */
	t: number;
	lon: number;
	lat: number;
	/** Genauigkeit laut GPS (m) */
	acc?: number;
	/** Tempo (m/s) und Richtung (Grad) laut GPS */
	spd?: number;
	hdg?: number;
	/** Stelle auf der Strecke (m ab Start), die die App angezeigt hat */
	along?: number;
	/** Abstand der Messung zur Strecke (m), nur wenn die App neben der Strecke war */
	off?: number;
	/** Entfernung zur nächsten Abzweigung (m), wie angezeigt */
	next?: number;
	/** Messung war zu ungenau und wurde nicht benutzt */
	weak?: boolean;
}

export interface RideEvent {
	t: number;
	text: string;
}

export interface RideRecord {
	id: string;
	startedAt: number;
	endedAt?: number;
	tourId: string;
	title: string;
	/** Länge der Tour in Metern */
	meters: number;
	samples: RideSample[];
	events: RideEvent[];
	/** Browser/Gerät, für die Fehlersuche (z. B. „Android Chrome“) */
	device?: string;
	/** geplante Strecke [lon, lat], zum Vergleichen in Kartenprogrammen */
	planned?: [number, number][];
}

/** Ab so vielen Sekunden ohne Meldung gilt es als Lücke und wird als Ereignis notiert */
const GAP_SECONDS = 5;

export class RideRecorder {
	readonly record: RideRecord;
	private lastFixTime: number | undefined;

	constructor(meta: { tourId: string; title: string; meters: number; planned?: [number, number][]; device?: string }, now = Date.now()) {
		this.record = {
			id: `fahrt-${now.toString(36)}`,
			startedAt: now,
			tourId: meta.tourId,
			title: meta.title,
			meters: meta.meters,
			samples: [],
			events: [],
			device: meta.device,
			planned: meta.planned
		};
	}

	event(text: string, t = Date.now()) {
		this.record.events.push({ t, text });
	}

	/** Eine Standortmeldung und das, was die App daraus angezeigt hat */
	fix(fix: Fix & { speed?: number | null; heading?: number | null }, view: NavView | undefined) {
		const t = fix.time ?? Date.now();
		if (this.lastFixTime !== undefined && t - this.lastFixTime > GAP_SECONDS * 1000) {
			this.event(`Lücke: ${Math.round((t - this.lastFixTime) / 1000)} s ohne Standortmeldung`, t);
		}
		this.lastFixTime = t;
		const round = (v: number | null | undefined, digits = 0) => (v === null || v === undefined || !Number.isFinite(v) ? undefined : Number(v.toFixed(digits)));
		this.record.samples.push({
			t,
			lon: Number(fix.lngLat[0].toFixed(6)),
			lat: Number(fix.lngLat[1].toFixed(6)),
			acc: round(fix.accuracy),
			spd: round(fix.speed, 1),
			hdg: round(fix.heading),
			along: round(view?.state.along),
			off: view?.offRoute ? round(view.offRoute.meters) : undefined,
			next: round(view?.distance),
			weak: view?.weak ? true : undefined
		});
		if (view) {
			for (const a of view.speak) this.event(`Ansage: ${a.text}`, t);
		}
	}

	finish(now = Date.now()) {
		this.record.endedAt = now;
	}

	get fixCount(): number {
		return this.record.samples.length;
	}
}

const escapeXml = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const coord = (v: number) => v.toFixed(6);
const iso = (t: number) => new Date(t).toISOString();

/**
 * GPX 1.1: die gefahrene Spur mit Zeit, Genauigkeit, Tempo und dem, was die App angezeigt hat (Namensraum `gr`), dazu die geplante
 * Strecke als zweite Spur und die Ereignisse als Wegpunkte. Öffnet sich in jedem Kartenprogramm und ist leicht auszuwerten.
 */
export function rideToGpx(record: RideRecord): string {
	const lines: string[] = [];
	lines.push('<?xml version="1.0" encoding="UTF-8"?>');
	lines.push(
		'<gpx version="1.1" creator="Genuss-Radeln" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gr="https://janshort4all.github.io/genussradeln/gpx">'
	);
	lines.push(
		`  <metadata><name>${escapeXml(record.title)}</name><desc>${escapeXml(
			`Aufgezeichnete Fahrt, Tour ${record.tourId}, ${(record.meters / 1000).toFixed(1)} km geplant${record.device ? `, ${record.device}` : ''}`
		)}</desc><time>${iso(record.startedAt)}</time></metadata>`
	);
	// Ereignisse an der letzten bekannten Position
	let samplesSeen = 0;
	const samples = record.samples;
	for (const e of record.events) {
		while (samplesSeen + 1 < samples.length && samples[samplesSeen + 1].t <= e.t) samplesSeen++;
		const at = samples[samplesSeen];
		if (!at) continue;
		lines.push(
			`  <wpt lat="${coord(at.lat)}" lon="${coord(at.lon)}"><time>${iso(e.t)}</time><name>${escapeXml(e.text.slice(0, 120))}</name></wpt>`
		);
	}
	lines.push('  <trk>');
	lines.push(`    <name>Gefahren: ${escapeXml(record.title)}</name>`);
	lines.push('    <type>cycling</type>');
	lines.push('    <trkseg>');
	for (const s of samples) {
		const ext = [
			s.acc !== undefined ? `<gr:acc>${s.acc}</gr:acc>` : '',
			s.spd !== undefined ? `<gr:spd>${s.spd}</gr:spd>` : '',
			s.hdg !== undefined ? `<gr:hdg>${s.hdg}</gr:hdg>` : '',
			s.along !== undefined ? `<gr:along>${s.along}</gr:along>` : '',
			s.off !== undefined ? `<gr:off>${s.off}</gr:off>` : '',
			s.next !== undefined ? `<gr:next>${s.next}</gr:next>` : '',
			s.weak ? '<gr:weak>1</gr:weak>' : ''
		].join('');
		lines.push(
			`      <trkpt lat="${coord(s.lat)}" lon="${coord(s.lon)}"><time>${iso(s.t)}</time>${ext ? `<extensions>${ext}</extensions>` : ''}</trkpt>`
		);
	}
	lines.push('    </trkseg>');
	lines.push('  </trk>');
	if (record.planned?.length) {
		lines.push('  <trk>');
		lines.push(`    <name>Geplant: ${escapeXml(record.title)}</name>`);
		lines.push('    <trkseg>');
		for (const [lon, lat] of record.planned) lines.push(`      <trkpt lat="${coord(lat)}" lon="${coord(lon)}"/>`);
		lines.push('    </trkseg>');
		lines.push('  </trk>');
	}
	lines.push('</gpx>', '');
	return lines.join('\n');
}

/** Dateiname: „Fahrt 2026-10-13 14-30 Am Rhein entlang.gpx“ */
export function rideFileName(record: RideRecord): string {
	const d = new Date(record.startedAt);
	const pad = (n: number) => String(n).padStart(2, '0');
	const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`;
	const title = record.title.replace(/[\\/:*?"<>|„“]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
	return `Fahrt ${day} ${title || 'Tour'}.gpx`;
}

/** Dauer der Aufzeichnung in Minuten */
export function rideMinutesRecorded(record: RideRecord): number {
	const end = record.endedAt ?? record.samples.at(-1)?.t ?? record.startedAt;
	return Math.max(0, Math.round((end - record.startedAt) / 60000));
}
