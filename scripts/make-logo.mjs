/**
 * Erzeugt aus dem Original-Logo (assets/logo-original.png) alle Bilder für die App:
 * - static/logo.webp            Logo für den Start-Screen (Ecken transparent)
 * - static/pwa-*.png            App-Symbole für Android (Ecken transparent)
 * - static/maskable-*.png       App-Symbol für Android-Launcher, die selbst eine Form ausschneiden
 * - static/apple-touch-*.png    App-Symbol für iPhone
 * - static/favicon-48x48.png    Symbol im Browser-Tab
 *
 * Aufruf: npm run icons
 */
import sharp from 'sharp';

const SOURCE = 'assets/logo-original.png';
// Das cremefarbene, abgerundete Quadrat im Original (gemessen, Original ist 1254 × 1254 px)
const CROP = { left: 74, top: 74, width: 1106, height: 1106 };
const CORNER_RADIUS = 0.235; // Anteil der Kantenlänge
const CREAM = '#F7F2E5';
const SIZE = 1024;
// Farbpalette statt Vollfarbe → Dateien etwa 3–4× kleiner, sichtbar kein Unterschied
const PNG = { palette: true, quality: 90, compressionLevel: 9 };

const square = await sharp(SOURCE).extract(CROP).resize(SIZE, SIZE).png().toBuffer();

// Weiße Ecken außerhalb des abgerundeten Quadrats transparent machen (leicht nach innen versetzt)
const inset = 4;
const radius = Math.round(SIZE * CORNER_RADIUS);
const mask = Buffer.from(
	`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
		<rect x="${inset}" y="${inset}" width="${SIZE - 2 * inset}" height="${SIZE - 2 * inset}"
			rx="${radius}" ry="${radius}" fill="#fff"/>
	</svg>`
);
const rounded = await sharp(square)
	.composite([{ input: mask, blend: 'dest-in' }])
	.png()
	.toBuffer();

/** Logo mittig auf cremefarbene Fläche setzen (für Symbole ohne Transparenz) */
async function onCream(size, contentShare) {
	const inner = await sharp(rounded)
		.resize(Math.round(size * contentShare))
		.png()
		.toBuffer();
	return sharp({ create: { width: size, height: size, channels: 4, background: CREAM } })
		.composite([{ input: inner, gravity: 'center' }])
		.png(PNG);
}

// Für die Startseite: Rand weich auslaufen lassen, damit das Logo nahtlos in die Seite übergeht
const softMask = await sharp(mask).blur(14).png().toBuffer();
// (erst maskieren, dann verkleinern – sharp würde sonst vor dem Maskieren verkleinern)
const softEdged = await sharp(square)
	.composite([{ input: softMask, blend: 'dest-in' }])
	.png()
	.toBuffer();
await sharp(softEdged).resize(640).webp({ quality: 88 }).toFile('static/logo.webp');

for (const size of [64, 192, 512]) {
	await sharp(rounded).resize(size).png(PNG).toFile(`static/pwa-${size}x${size}.png`);
}

// Android schneidet maskierbare Symbole z. B. kreisrund aus → Logo kleiner, Rand cremefarben
await (await onCream(512, 0.74)).toFile('static/maskable-icon-512x512.png');
// iPhone rundet selbst ab → volle Fläche, Ecken cremefarben statt transparent
await (await onCream(180, 1)).toFile('static/apple-touch-icon-180x180.png');
await sharp(rounded).resize(48).png(PNG).toFile('static/favicon-48x48.png');

console.log('Logo und App-Symbole erzeugt.');
