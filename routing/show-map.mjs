/**
 * Zeigt die Testkarte (routing/test-output/karte.html) unter http://localhost:8100 an.
 * Aufruf: npm run routing:karte   (vorher npm run routing:test, damit die Karte existiert)
 * Beenden mit Strg+C.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { exec } from 'node:child_process';

const PORT = 8100;
const file = new URL('./test-output/karte.html', import.meta.url);

createServer(async (_request, response) => {
	try {
		const html = await readFile(file);
		response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
		response.end(html);
	} catch {
		response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		response.end('Noch keine Karte da. Erst ausführen: npm run routing:test');
	}
}).listen(PORT, 'localhost', () => {
	const url = `http://localhost:${PORT}`;
	console.log(`Testkarte: ${url}  (Beenden mit Strg+C)`);
	if (process.argv.includes('--oeffnen')) exec(`start "" "${url}"`);
});
