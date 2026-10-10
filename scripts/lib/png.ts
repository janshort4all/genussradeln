/**
 * Graustufen-PNG (8 Bit) nur mit Node-Bordmitteln schreiben – ohne das native Bildprogramm „sharp“, das sich auf
 * manchen Rechnern nicht laden lässt (Windows-Anwendungssteuerung blockiert unsignierte .node-Dateien).
 */
import { writeFile } from 'node:fs/promises';
import { crc32, deflateSync } from 'node:zlib';

function chunk(type: string, data: Uint8Array): Buffer {
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const out = Buffer.alloc(body.length + 8);
	out.writeUInt32BE(data.length, 0);
	body.copy(out, 4);
	out.writeUInt32BE(crc32(body) >>> 0, body.length + 4);
	return out;
}

/** Zeilenfilter „Up“ (Unterschied zur Zeile darüber) – für Flächenkarten deutlich kleiner als ungefiltert */
function filterUp(pixels: Uint8Array, width: number, height: number): Buffer {
	const out = Buffer.alloc((width + 1) * height);
	for (let y = 0; y < height; y++) {
		const row = y * (width + 1);
		out[row] = 2;
		for (let x = 0; x < width; x++) {
			const above = y > 0 ? pixels[(y - 1) * width + x] : 0;
			out[row + 1 + x] = (pixels[y * width + x] - above) & 255;
		}
	}
	return out;
}

export async function writeGrayPng(path: string, pixels: Uint8Array, width: number, height: number): Promise<number> {
	if (pixels.length !== width * height) throw new Error('PNG: Größe passt nicht');
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8; // 8 Bit
	header[9] = 0; // Graustufen
	const png = Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(filterUp(pixels, width, height), { level: 9 })),
		chunk('IEND', new Uint8Array(0))
	]);
	await writeFile(path, png);
	return png.length;
}
