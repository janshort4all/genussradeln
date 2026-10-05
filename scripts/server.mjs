/**
 * Routing-Server verwalten (Oracle Cloud, Oracle Linux 9, Dienst „genuss-routing“ + Caddy für https).
 * Einrichtung und Hintergründe: routing/SERVER.md
 *
 * Aufruf: npm run server -- <befehl>
 *   status   läuft alles? Dienste, Speicher, Antwort über https
 *   deploy   config.yml und Profil (custom_models/*.json) hochladen, Wegenetz neu berechnen, neu starten
 *   karte    neue Kartendaten von Geofabrik laden, Wegenetz neu berechnen, neu starten
 *   logs     letzte Meldungen der Wegberechnung
 *
 * Zugang: SSH-Schlüssel ~/.ssh/genuss_radeln – liegt nur auf diesem PC, nie im Repository.
 * Anderer Server: Umgebungsvariable GENUSS_SERVER=benutzer@adresse
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOST = process.env.GENUSS_SERVER ?? 'opc@130.61.177.54';
const PUBLIC_URL = process.env.GENUSS_ROUTING_URL ?? 'https://130-61-177-54.sslip.io';
const KEY = join(homedir(), '.ssh', 'genuss_radeln');
const DIR = '/opt/genuss-radeln/routing';
const OSM_URL = 'https://download.geofabrik.de/europe/germany/nordrhein-westfalen/duesseldorf-regbez-latest.osm.pbf';
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
ls -l --time-style=+%d.%m.%Y ${DIR}/data/*.osm.pbf | awk '{print "Kartendaten vom " $6}'
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

	karte() {
		remote(`
cd ${DIR}/data
sudo -u graphhopper curl -sSL --fail -o new.osm.pbf ${OSM_URL}
sudo mv new.osm.pbf $(basename ${OSM_URL})
echo "Neue Kartendaten geladen."
${rebuild}`);
	},

	logs() {
		remote('sudo journalctl -u genuss-routing --no-pager -n 40 -o cat');
	}
};

const name = process.argv[2];
if (!name || !(name in commands)) {
	console.log('Befehle: status | deploy | karte | logs   (z. B. npm run server -- status)');
	process.exit(name ? 1 : 0);
}
commands[name]();
