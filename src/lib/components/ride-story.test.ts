import { describe, expect, it } from 'vitest';
import { COFFEE, EXPLAIN, nextQuip, sceneFor, stageLabel, STATIONS, textOf } from './ride-story';

describe('Wartebild-Geschichte', () => {
	it('die Landschaft wechselt mit dem Fortschritt und endet am Ziel', () => {
		expect([0, 0.2, 0.5, 0.7, 0.85, 0.97].map(sceneFor)).toEqual(['fields', 'forest', 'lake', 'village', 'forest', 'finish']);
		expect(STATIONS).toHaveLength(5);
	});

	it('jede Etappe hat einen Namen', () => {
		expect(stageLabel('places')).toBe('Schöne Stellen suchen');
		expect(stageLabel('directions')).toBe('Richtungen ausprobieren');
	});

	it('jeder Satz kommt je Etappe nur einmal, danach schweigt Opi', () => {
		const said = new Set<string>();
		const first = nextQuip('waters', said);
		const second = nextQuip('waters', said);
		expect(first && second && textOf(first) !== textOf(second)).toBe(true);
		expect(nextQuip('waters', said)).toBeUndefined();
		expect(nextQuip('direct', said)).toBeDefined();
	});

	it('keine Witze über das Alter, keine Wörter wie „Knie“ oder „früher“', () => {
		const all = [EXPLAIN, COFFEE, ...(['direct', 'places', 'waters', 'alternatives', 'directions', 'through', 'finish'] as const).flatMap((s) => {
			const said = new Set<string>();
			const out = [];
			for (let q = nextQuip(s, said); q; q = nextQuip(s, said)) out.push(q);
			return out;
		})];
		for (const parts of all) expect(textOf(parts)).not.toMatch(/knie|früher|opa|alt\b|rente|gestern/i);
	});

	it('die Erklärung sagt, warum es dauert (kürzeste Wege gegen schönste)', () => {
		expect(textOf(EXPLAIN)).toMatch(/kürzesten/);
		expect(textOf(EXPLAIN)).toMatch(/schönsten/);
	});
});
