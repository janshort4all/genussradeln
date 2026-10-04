import { describe, expect, it } from 'vitest';
import { gpxFileName, toGpx } from './gpx';

describe('toGpx', () => {
	const gpx = toGpx({
		name: 'Am Rhein & Niers <entlang>',
		track: [
			[6.6328, 51.33, 31.25],
			[6.64, 51.335]
		],
		waypoints: [{ lngLat: [6.635, 51.332], name: 'Biergarten "Stadtwaldhaus"', type: 'Biergarten' }]
	});

	it('schreibt einen gültigen GPX-1.1-Track mit Höhen', () => {
		expect(gpx).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
		expect(gpx).toContain('<gpx version="1.1" creator="Genuss-Radeln" xmlns="http://www.topografix.com/GPX/1/1">');
		expect(gpx).toContain('<trkpt lat="51.330000" lon="6.632800"><ele>31.3</ele></trkpt>');
		expect(gpx).toContain('<trkpt lat="51.335000" lon="6.640000"/>');
		// Wegpunkte stehen laut GPX-Schema vor dem Track
		expect(gpx.indexOf('<wpt')).toBeLessThan(gpx.indexOf('<trk>'));
	});

	it('maskiert Sonderzeichen in Namen', () => {
		expect(gpx).toContain('<name>Am Rhein &amp; Niers &lt;entlang&gt;</name>');
		expect(gpx).toContain('<name>Biergarten &quot;Stadtwaldhaus&quot;</name>');
	});

	it('baut einen ordentlichen Dateinamen', () => {
		expect(gpxFileName('Über „Den Ham“: Weg 2')).toBe('Genuss-Radeln Über Den Ham Weg 2.gpx');
	});
});
