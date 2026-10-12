/**
 * Routing-Server verwalten (Oracle Cloud, Oracle Linux 9, Dienst „genuss-routing“ + Caddy für https).
 * Einrichtung und Hintergründe: routing/SERVER.md
 *
 * Aufruf: npm run server -- <befehl>
 *   status   läuft alles? Dienste, Speicher, Antwort über https
 *   deploy   config.yml und Profil (custom_models/*.json) hochladen, Wegenetz neu berechnen, neu starten
 *   karte    neue Kartendaten von Geofabrik laden, Wegenetz neu berechnen, neu starten
 *   logs     letzte Meldungen der Wegberechnung
 *   daten    Kartenkacheln (static/tiles, gebaut mit `npm run tiles`) hochladen – die App holt sie unter /daten/ (routing/SERVER.md)
 *
 * Zugang: SSH-Schlüssel ~/.ssh/genuss_radeln – liegt nur auf diesem PC, nie im Repository.
 * Anderer Server: Umgebungsvariable GENUSS_SERVER=benutzer@adresse
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOST = process.env.GENUSS_SERVER ?? 'opc@130.61.177.54';
const PUBLIC_URL = process.env.GENUSS_ROUTING_URL ?? 'https://130-61-177-54.sslip.io';
const KEY = join(homedir(), '.ssh', 'genuss_radeln');
const DIR = '/opt/genuss-radeln/routing';
const DATA_DIR = '/opt/genuss-radeln/daten';
const SSH = ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'LogLevel=ERROR'];

function run(command, args) {
	const result = spawnSync(command, args, { stdio: 'inherit' });
	if (result.status !== 0) {
		console.error(`Fehlgeschlagen: ${command} ${args.at(-1)}`);
		process.exit(result.status ?? 1);
	}
}

const remote = (script) => run('ssh', [...SSH, HOST, script]);
const upload = (files, target) => run('scp', [...SSH, '-q', ...files, `${HOST}:${target}`]);

/** Wegenetz löschen und Dienst neu starten; wartet, bis die Wegberechnung wieder antwortet (Import ca. 2 Min.) */
const rebuild = `
sudo systemctl stop genuss-routing
sudo rm -rf ${DIR}/data/graph-cache
sudo systemctl start genuss-routing
echo "Wegenetz wird neu berechnet …"
for i in $(seq 1 90); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8989/health)" = "200" ]; then echo "Wegberechnung läuft wieder (nach $((i*10)) s)."; exit 0; fi
  sleep 10
done
echo "Wegberechnung antwortet nicht – siehe: npm run server -- logs"; exit 1
`;

const commands = {
	status() {
		remote(`
echo "Wegberechnung: $(systemctl is-active genuss-routing)   https (Caddy): $(systemctl is-active caddy)"
free -h | awk 'NR==2 {print "Arbeitsspeicher: " $3 " von " $2 " belegt"}'
df -h / | awk 'NR==2 {print "Festplatte: " $3 " von " $2 " belegt"}'
ls -l --time-style=+%d.%m.%Y ${DIR}/data/region/merged.osm.pbf ${DIR}/data/*.osm.pbf 2>/dev/null | awk '{print "Kartendaten (" $7 ") vom " $6}'
ls -1 ${DATA_DIR}/index.json >/dev/null 2>&1 && echo "Kartenkacheln: $(grep -o '"dir":"[^"]*"' ${DATA_DIR}/index.json)"
`);
		const check = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code} in %{time_total} s', `${PUBLIC_URL}/health`], {
			encoding: 'utf8'
		});
		console.log(`Von außen (${PUBLIC_URL}): ${check.stdout || 'keine Antwort'}`);
	},

	deploy() {
		const models = readdirSync('routing/custom_models')
			.filter((f) => f.endsWith('.json'))
			.map((f) => `routing/custom_models/${f}`);
		remote('mkdir -p /tmp/genuss-upload/custom_models');
		upload(['routing/config.yml'], '/tmp/genuss-upload/');
		upload(models, '/tmp/genuss-upload/custom_models/');
		remote(`
sudo install -o opc -g graphhopper -m 0664 /tmp/genuss-upload/config.yml ${DIR}/config.yml
sudo install -o opc -g graphhopper -m 0664 /tmp/genuss-upload/custom_models/*.json ${DIR}/custom_models/
rm -rf /tmp/genuss-upload
${rebuild}`);
	},

	/**
	 * Neue Kartendaten: auf diesem PC die Geofabrik-Auszüge laden und zusammenfügen (npm run routing:region), die Datei (ca. 1,1 GB)
	 * hochladen und das Wegenetz auf dem Server neu berechnen (ca. 5 Min.). Die Kartenkacheln der App dazu separat: npm run tiles, dann daten.
	 */
	karte() {
		run(process.execPath, ['scripts/fetch-region.mjs', ...process.argv.slice(3)]);
		remote(`sudo mkdir -p ${DIR}/data/region && sudo chown opc:graphhopper ${DIR}/data/region && sudo chmod 775 ${DIR}/data/region`);
		upload(['routing/data/region/merged.osm.pbf'], `${DIR}/data/region/merged.osm.pbf.neu`);
		remote(`sudo mv ${DIR}/data/region/merged.osm.pbf.neu ${DIR}/data/region/merged.osm.pbf && sudo chown graphhopper:graphhopper ${DIR}/data/region/merged.osm.pbf
echo "Neue Kartendaten liegen auf dem Server."
${rebuild}`);
	},

	/**
	 * Kartenkacheln auf den Server legen: Die Kacheln liegen in einem Ordner mit der Versionsnummer des Baus und ändern sich nie
	 * (Browser dürfen sie für immer behalten); erst zuletzt wird index.json ausgetauscht, die der App sagt, welcher Ordner gilt.
	 * So sieht die App nie halb hochgeladene Daten. Die zwei letzten Versionen bleiben liegen, ältere werden gelöscht.
	 */
	daten() {
		const index = JSON.parse(readFileSync('static/tiles/index.json', 'utf8'));
		const dir = index.dir;
		if (!dir) {
			console.error('static/tiles/index.json nennt keinen Ordner – erst „npm run tiles“ ausführen.');
			process.exit(1);
		}
		const temp = mkdtempSync(join(tmpdir(), 'genuss-daten-'));
		const archive = join(temp, 'kacheln.tar');
		run('tar', ['-cf', archive, '-C', 'static/tiles', dir]);
		console.log(`Kacheln ${dir}: ${Object.keys(index.tiles).length} Dateien, ${(statSync(archive).size / 1048576).toFixed(1)} MB`);
		remote('rm -rf /tmp/genuss-daten && mkdir -p /tmp/genuss-daten');
		upload([archive, 'static/tiles/index.json'], '/tmp/genuss-daten/');
		remote(`
set -e
sudo mkdir -p ${DATA_DIR}
sudo chown opc:graphhopper ${DATA_DIR}
cd ${DATA_DIR}
tar -xf /tmp/genuss-daten/kacheln.tar
cp /tmp/genuss-daten/index.json index.json.neu
mv index.json.neu index.json
rm -rf /tmp/genuss-daten
ls -1d */ | sort | head -n -2 | xargs -r rm -rf
sudo chcon -R -t httpd_sys_content_t ${DATA_DIR} 2>/dev/null || true
echo "Kacheln liegen unter ${DATA_DIR}/${dir}"
`);
		const check = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', `${PUBLIC_URL}/daten/index.json`], { encoding: 'utf8' });
		console.log(`Von außen (${PUBLIC_URL}/daten/index.json): ${check.stdout || 'keine Antwort'}`);
	},

	logs() {
		remote('sudo journalctl -u genuss-routing --no-pager -n 40 -o cat');
	}
};

const name = process.argv[2];
if (!name || !(name in commands)) {
	console.log('Befehle: status | deploy | karte | daten | logs   (z. B. npm run server -- status)');
	process.exit(name ? 1 : 0);
}
commands[name]();
