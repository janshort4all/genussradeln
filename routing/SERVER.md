# Routing-Server (online)

Die Online-App fragt die Wegberechnung unter **https://130-61-177-54.sslip.io** (`/route`, `/health`).
Die App selbst liegt weiterhin auf GitHub Pages; der Server rechnet nur die Wege.

## Was läuft wo

| | |
| --- | --- |
| Anbieter | Oracle Cloud, Free Tier („Always Free“), Region Frankfurt |
| Server | `genuss-radeln-a1`, VM.Standard.A1.Flex (Ampere, 2 OCPUs, 12 GB), Oracle Linux 9 (aarch64) |
| Kosten | 0 € – A1 mit 2 OCPUs / 12 GB liegt im kostenlosen Monatskontingent; ohne „Upgrade“ bucht Oracle nichts ab |
| Zugang | `ssh -i ~/.ssh/genuss_radeln opc@130.61.177.54` (Schlüssel nur auf Jans PC, nie im Repository) |
| Wegberechnung | systemd-Dienst `genuss-routing`: GraphHopper 11.1 mit `config.yml` + `custom_models/` in `/opt/genuss-radeln/routing`, nur auf `localhost:8989` |
| https | Caddy (`/etc/caddy/Caddyfile`): Zertifikat automatisch (Let’s Encrypt), nach außen nur `/route` und `/health`, Browser-Anfragen nur von `https://janshort4all.github.io`, **keine Zugriffsprotokolle** |
| Firewall | Oracle-Sicherheitsliste und `firewalld`: nur 22 (SSH), 80, 443 |
| Updates | `dnf-automatic`: Sicherheitsupdates spielen sich selbst ein |

## Verwalten

```
npm run server -- status   # läuft alles? Speicher, Antwortzeit von außen
npm run server -- deploy   # geänderte config.yml / genuss.json hochladen, Wegenetz neu berechnen (ca. 2 Min.)
npm run server -- karte    # neue Kartendaten von Geofabrik, Wegenetz neu berechnen (z. B. monatlich)
npm run server -- logs     # letzte Meldungen der Wegberechnung
```

## Gut zu wissen

- **„Ungenutzt“-Regel bei Oracle:** Server, deren Prozessor, Netzwerk *und* Speicher 7 Tage unter 20 % liegen, kann Oracle
  zurückholen. Deshalb belegt die Wegberechnung dauerhaft 3 GB (`-Xms3g -XX:+AlwaysPreTouch` im Dienst).
- **Öffentliche IP ist „ephemeral“:** Sie bleibt, solange der Server existiert. Wird er neu angelegt, ändern sich IP und
  Adresse (`…sslip.io`) – dann `VITE_ROUTING_URL` in `.github/workflows/deploy.yml`, `PUBLIC_URL`/`HOST` in
  `scripts/server.mjs` und diese Datei anpassen.
- **Andere Region:** `OSM_URL` in `scripts/server.mjs` und `datareader.file` in `config.yml` ändern, dann `karte`.
- **Umzug zu einem anderen Anbieter** (z. B. Hetzner): Linux-Server mit ≥ 4 GB, Java 21, Caddy; Schritte wie oben
  (Ordner, Dienst-Datei, Caddyfile), dann `GENUSS_SERVER=… npm run server -- deploy`.
