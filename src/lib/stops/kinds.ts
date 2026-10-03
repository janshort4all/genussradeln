/**
 * Arten von Stopps unterwegs (F9) und ihre Merkmale.
 * Wird auch von scripts/fetch-pois.ts benutzt – Reihenfolge der Arten nicht ändern (Index steht in pois.json).
 */

export const STOP_KINDS = ['cafe', 'eis', 'biergarten', 'toilette', 'aussicht', 'rast', 'bank', 'laden'] as const;
export type StopKind = (typeof STOP_KINDS)[number];

export const STOP_LABELS: Record<StopKind, string> = {
	cafe: 'Café',
	eis: 'Eiscafé',
	biergarten: 'Biergarten',
	toilette: 'Toilette',
	aussicht: 'Aussicht',
	rast: 'Rastplatz',
	bank: 'Bank',
	laden: 'E-Bike-Ladepunkt'
};

/** Merkmale eines Stopps als Bits (kompakt in pois.json) */
export const FLAG = {
	/** Sitzplätze draußen / Biergarten */
	outdoor: 1,
	/** Website bekannt – Zeichen für einen aktiven Betrieb */
	website: 2,
	/** Öffnungszeiten eingetragen */
	hours: 4,
	/** rollstuhlgerecht bzw. barrierefreie Toilette */
	wheelchair: 8,
	/** Bank mit Lehne */
	backrest: 16,
	/** überdacht */
	covered: 32
} as const;

export function hasFlag(flags: number, flag: number): boolean {
	return (flags & flag) !== 0;
}
