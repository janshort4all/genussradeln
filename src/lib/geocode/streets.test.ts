import { describe, expect, it } from 'vitest';
import { matchStreets, parseAddress, parseStreets, streetKey } from './streets';

const all = parseStreets({
	cities: [
		['Krefeld', 'Kurkölner Straße|65600|513300;Konrad-Adenauer-Straße|10|10'],
		['Moers', 'Kurkölner Straße|66200|514500;Rheinberger Straße|10|10']
	]
});

describe('streetKey', () => {
	it('macht Schreibweisen vergleichbar', () => {
		expect(streetKey('Kurkölner Straße')).toBe('kurkolner str');
		expect(streetKey('kurkoelner str.')).toBe('kurkolner str');
		expect(streetKey('Konrad-Adenauer-Str')).toBe(streetKey('konrad adenauer straße'));
	});
});

describe('parseAddress', () => {
	it('trennt Straße, Hausnummer und Ort', () => {
		expect(parseAddress('Kurkölner Str 80a, Krefeld')).toEqual({ street: 'Kurkölner Str', number: '80a', city: 'Krefeld' });
		expect(parseAddress('Kurkölner Straße 80')).toEqual({ street: 'Kurkölner Straße', number: '80', city: undefined });
		expect(parseAddress('Rheinberger Straße')).toEqual({ street: 'Rheinberger Straße', city: undefined });
	});
});

describe('matchStreets', () => {
	it('findet Straßen beim Tippen, die in der Nähe zuerst', () => {
		const near: [number, number] = [6.62, 51.45];
		expect(matchStreets('Kurköl', all, near).map((s) => s.city)).toEqual(['Moers', 'Krefeld']);
		expect(matchStreets('kurkoelnerstr', all).length).toBe(2);
		expect(matchStreets('Adenauer', all)[0].name).toBe('Konrad-Adenauer-Straße');
	});

	it('beachtet den Ort nach dem Komma', () => {
		expect(matchStreets('Kurkölner Str 80, Krefeld', all).map((s) => s.city)).toEqual(['Krefeld']);
	});

	it('zeigt dieselbe Straße im selben Ort nur einmal', () => {
		const twice = parseStreets({ cities: [['Moers', 'Rheinberger Straße|66300|514600;Rheinberger Straße|20|340']] });
		expect(matchStreets('Rheinberger', twice)).toHaveLength(1);
	});

	it('sucht erst ab drei Buchstaben', () => {
		expect(matchStreets('Ku', all)).toEqual([]);
	});
});
