import { boundsOf, distance, distanceToLine, resample, type LngLat } from '$lib/geo/geo';

/**
 * Wo die Nummernschilder der Wege auf der Karte sitzen: je Weg an einer Stelle, die möglichst weit von den anderen
 * Wegen entfernt liegt (sonst verdecken sich die Schilder und man weiß nicht, welche Linie welche ist), und die
 * Schilder halten Abstand zueinander. Alle Maße richten sich nach der Größe der Karte, nicht nach festen Metern.
 */
export function badgeSpots(lines: LngLat[][]): LngLat[] {
	const b = boundsOf(lines);
	const diagonal = Number.isFinite(b.west) ? distance([b.west, b.south], [b.east, b.north]) : 0;
	const farCap = diagonal * 0.08;
	const apart = diagonal * 0.1;
	const candidates = lines.map((line) => resample(line, Math.max(30, diagonal / 120)));
	const others = lines.map((_, i) => lines.flatMap((line, j) => (j === i ? [] : [resample(line, Math.max(30, diagonal / 250))])));
	const taken: LngLat[] = [];

	return candidates.map((points, i) => {
		if (points.length === 0) return lines[i][0];
		let best = points[Math.floor(points.length / 2)];
		let bestScore = -Infinity;
		for (let k = 0; k < points.length; k++) {
			const p = points[k];
			// weit von den anderen Wegen (bis zu einem Deckel – darüber hinaus ist es egal), nahe der Mitte des Wegs bevorzugt
			let far = farCap;
			for (const other of others[i]) far = Math.min(far, distanceToLine(p, other));
			let score = far - 0.1 * farCap * Math.abs(k / Math.max(1, points.length - 1) - 0.5);
			if (taken.some((t) => distance(t, p) < apart)) score -= 10 * farCap;
			if (score > bestScore) {
				bestScore = score;
				best = p;
			}
		}
		taken.push(best);
		return best;
	});
}
