/** Worte für Mehrweg und Fahrzeit (Umwege und Stationen) */

/** „1,8“ – Kilometer mit einer Nachkommastelle, ohne Vorzeichen */
export function kmText(meters: number): string {
	return (Math.abs(meters) / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

/** „+1,8 km“, „gleich lang“, „0,3 km kürzer“ */
export function plusText(meters: number): string {
	if (Math.abs(meters) < 100) return 'gleich lang';
	return meters > 0 ? `+${kmText(meters)} km` : `${kmText(meters)} km kürzer`;
}

/** „+7 Min.“, „3 Min. weniger“, „gleiche Fahrzeit“ */
export function minutesText(minutes: number): string {
	if (minutes === 0) return 'gleiche Fahrzeit';
	return minutes > 0 ? `+${minutes} Min.` : `${-minutes} Min. weniger`;
}

/** „2:50 Std.“ bzw. „45 Min.“ (auf 5 Minuten gerundet) */
export function clockText(minutes: number): string {
	const rounded = Math.round(minutes / 5) * 5;
	const hours = Math.floor(rounded / 60);
	const rest = rounded % 60;
	return hours ? `${hours}:${String(rest).padStart(2, '0')} Std.` : `${rest} Min.`;
}
