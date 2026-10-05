import { describe, expect, it } from 'vitest';
import { matchLocalPlaces, normalize, parseLocalPlaces } from './local';

const all = parseLocalPlaces({
	places: [
		[64195, 513642, 1, 'Kempen'],
		[69415, 512039, 3, 'Kempen'], // gleichnamiger Stadtteil weiter weg
		[65623, 513331, 0, 'Krefeld'],
		[66060, 513100, 2, 'Linn'],
		[65400, 514800, 1, 'Neukirchen-Vluyn'],
		[67600, 512650, 1, 'Meerbusch']
	]
});

describe('Sofort-Vorschläge aus der Ortsliste', () => {
	it('findet Orte ab zwei Buchstaben, Städte vor Stadtteilen', () => {
		const hits = matchLocalPlaces('kem', all, [6.63, 51.33]);
		expect(hits.map((h) => h.name)).toEqual(['Kempen', 'Kempen']);
		expect(hits[0].detail).toBeUndefined(); // Stadt
		expect(hits[0].settlement).toBe(true);
		expect(matchLocalPlaces('k', all)).toEqual([]);
	});

	it('nennt bei Stadtteilen die nächste Stadt und findet Namensteile', () => {
		expect(matchLocalPlaces('Linn', all)[0]).toMatchObject({ name: 'Linn', detail: 'Krefeld' });
		expect(matchLocalPlaces('vluyn', all)[0].name).toBe('Neukirchen-Vluyn');
	});

	it('vergleicht ohne Groß/klein, Akzente und ß', () => {
		expect(normalize('Straße Düsseldorf')).toBe('strasse dusseldorf');
	});
});
