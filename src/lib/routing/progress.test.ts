import { describe, expect, it } from 'vitest';
import { within, type StageReport } from './progress';

describe('Fortschritt der Planung', () => {
	it('bildet eine Meldung 0 … 1 in einen Teilbereich ab', () => {
		const seen: StageReport[] = [];
		const report = within((r) => seen.push(r), 0.4, 0.75)!;
		report({ stage: 'direct', fraction: 0 });
		report({ stage: 'alternatives', fraction: 0.5 });
		report({ stage: 'alternatives', fraction: 1 });
		expect(seen.map((r) => +r.fraction.toFixed(3))).toEqual([0.4, 0.575, 0.75]);
		expect(seen[1].stage).toBe('alternatives');
	});

	it('ohne Empfänger passiert nichts', () => {
		expect(within(undefined, 0, 1)).toBeUndefined();
	});
});
