/**
 * Öffnungszeiten aus OpenStreetMap (Merkmal `opening_hours`) auswerten – nur die gängigen Schreibweisen:
 *   „Mo-Fr 08:00-18:00; Sa 08:00-13:00; Su off“, „Mo,We 10:00-12:00,14:00-18:00“, „24/7“, „Mo-Su 11:30-22:00“.
 * Alles andere (Monate, Wochen, Sonnenauf-/untergang, „open end“ …) gilt als unbekannt – lieber nichts behaupten.
 * Feiertage (PH) werden nicht berücksichtigt.
 */

export type OpenState = 'open' | 'closed' | 'unknown';

export interface OpenInfo {
	state: OpenState;
	/** „18:00“ – bis wann geöffnet (nur bei `open`) */
	closesAt?: string;
	/** „11:00“ – ab wann heute geöffnet (nur bei `closed`, wenn heute noch geöffnet wird) */
	opensAt?: string;
}

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

interface Range {
	from: number;
	to: number;
}

function minutes(text: string): number | undefined {
	const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
	if (!m) return undefined;
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (h > 24 || min > 59) return undefined;
	return h * 60 + min;
}

/** „Mo-Fr“, „Mo,We,Fr“, „Sa,Su“ → Tage (0 = Montag); `undefined` bei etwas Unbekanntem; `[]` für nur Feiertage */
function weekdays(text: string): number[] | undefined {
	const out = new Set<number>();
	for (const part of text.split(',')) {
		const p = part.trim();
		if (p === 'PH') continue;
		const range = /^([A-Z][a-z])(?:-([A-Z][a-z]))?$/.exec(p);
		if (!range) return undefined;
		const a = DAYS.indexOf(range[1]);
		const b = range[2] ? DAYS.indexOf(range[2]) : a;
		if (a < 0 || b < 0) return undefined;
		for (let d = a; ; d = (d + 1) % 7) {
			out.add(d);
			if (d === b) break;
		}
	}
	return [...out];
}

/** Uhrzeiten eines Tages: „08:00-12:00,14:00-18:00“, „off“, „closed“ */
function ranges(text: string): Range[] | undefined {
	const t = text.trim();
	if (t === 'off' || t === 'closed') return [];
	if (t === '') return undefined;
	const out: Range[] = [];
	for (const part of t.split(',')) {
		const m = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(part.trim());
		if (!m) return undefined;
		const from = minutes(m[1]);
		let to = minutes(m[2]);
		if (from === undefined || to === undefined) return undefined;
		if (to <= from) to += 24 * 60; // über Mitternacht
		out.push({ from, to });
	}
	return out;
}

/** Wochentag eines Datums mit Montag = 0 */
const dayOf = (date: Date) => (date.getDay() + 6) % 7;

const hhmm = (min: number) => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Ist der Ort zu diesem Zeitpunkt (Ortszeit des Geräts) geöffnet? */
export function openAt(hours: string | undefined, when: Date): OpenInfo {
	if (!hours) return { state: 'unknown' };
	const text = hours.trim();
	if (text === '24/7') return { state: 'open' };
	const day = dayOf(when);
	let today: Range[] | undefined;
	for (const rule of text.split(';')) {
		const r = rule.trim();
		if (!r) continue;
		// Wochentage vorn (alles bis zur ersten Ziffer bzw. „off“/„closed“)
		const m = /^([A-Za-z,\- ]*?)\s*((?:\d|off$|closed$).*)$/.exec(r);
		if (!m) return { state: 'unknown' };
		const selector = m[1].trim();
		let days: number[] | undefined;
		if (selector === '') days = [0, 1, 2, 3, 4, 5, 6];
		else days = weekdays(selector.replace(/\s+/g, ''));
		const parsed = ranges(m[2]);
		if (!days || !parsed) return { state: 'unknown' };
		if (days.includes(day)) today = parsed;
	}
	if (!today) return { state: 'closed' };
	const now = when.getHours() * 60 + when.getMinutes();
	for (const range of today) {
		if (now >= range.from && now < range.to) return { state: 'open', closesAt: hhmm(range.to) };
	}
	const next = today.find((range) => range.from > now);
	return next ? { state: 'closed', opensAt: hhmm(next.from) } : { state: 'closed' };
}
