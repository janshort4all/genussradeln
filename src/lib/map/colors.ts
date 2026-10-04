/** Farben der Wege auf der Karte (Logo-Farben, kräftig genug auf hellem Kartenhintergrund) */
export const ROUTE_COLORS = ['#B0552F', '#32596F', '#5F6E33', '#A0711A'] as const;

export function routeColor(index: number): string {
	return ROUTE_COLORS[index % ROUTE_COLORS.length];
}
