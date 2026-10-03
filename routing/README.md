# Routing mit GraphHopper

Genuss-Radeln berechnet Touren mit [GraphHopper](https://github.com/graphhopper/graphhopper) 11.1
(Open Source, Apache-Lizenz) auf Basis von OpenStreetMap-Daten
(© OpenStreetMap-Mitwirkende, ODbL) für den Regierungsbezirk Düsseldorf.

## Einmalig einrichten

Voraussetzung: Java 17 oder neuer (`winget install EclipseAdoptium.Temurin.21.JRE`).

```
npm run routing:setup
```

Lädt nach `routing/data/` (nicht im Git-Repository):

- `graphhopper-web-11.1.jar` (ca. 45 MB)
- `duesseldorf-regbez-latest.osm.pbf` – Kartenauszug von Geofabrik (ca. 210 MB)

Kartenauszug später aktualisieren: `powershell -ExecutionPolicy Bypass -File routing/setup.ps1 -Aktualisieren`

## Starten

```
npm run routing:start
```

- Beim ersten Start wird die Karte aufbereitet (ca. 1–2 Minuten, lädt dabei einmalig Höhendaten).
- Bereit, sobald im Fenster `Started Server` erscheint. Beenden mit **Strg+C**.
- Testkarte im Browser: <http://localhost:8989/maps/> – oben das Profil wählen
  (Symbol „1“ = `genuss`, Fahrrad = normales Fahrradprofil zum Vergleich).

Nach Änderungen an `config.yml` oder `custom_models/genuss.json` neu aufbereiten:
`powershell -ExecutionPolicy Bypass -File routing/start.ps1 -Neu`

## Rundtouren testen

GraphHopper muss laufen. In einem zweiten Fenster:

```
npm run routing:test
```

Weitere Varianten:

```
node routing/test-roundtrip.mjs --km 20 --gemuetlich
node routing/test-roundtrip.mjs --start 51.4596,6.6228 --vergleich
```

Die Tabelle zeigt je Tour Länge, Höhenmeter und Anteile (Radnetz, ruhige Wege, große Straßen,
schlechter Belag). Jede Tour liegt als GPX-Datei in `routing/test-output/`.

## Dateien

| Datei | Zweck |
| --- | --- |
| `config.yml` | GraphHopper-Einstellungen (Profile, gespeicherte Straßenmerkmale, Höhendaten) |
| `custom_models/genuss.json` | Profil „genuss“: Radnetze und ruhige Wege bevorzugen, große Straßen und schlechten Belag meiden |
| `custom_models/gemuetlich.json` | Zusatz für „gemütlich“ (Steigungen meiden) – die App schickt ihn pro Anfrage mit |
| `setup.ps1`, `start.ps1` | Einrichten und Starten unter Windows |
| `test-roundtrip.mjs` | Rundtour-Test mit Auswertung und GPX-Export |
| `docker-compose.yml` | Betrieb auf dem Server (ab M9) |

## Erkenntnisse aus M1 (für M2)

- Rundtouren fallen meist **10–20 % kürzer** aus als `round_trip.distance` → in M2 Zieldistanz entsprechend erhöhen
  bzw. Kandidaten nach tatsächlicher Länge filtern.
- Höhenmeter (`ascend`) wirken für den flachen Niederrhein zu hoch (Rauschen der Satelliten-Höhendaten an Brücken,
  Dämmen, Gebäuden) → „Steigung in Worten“ in M3 eher aus Steigungsanteilen (`average_slope`) ableiten.
- Ein CORS-Zugriff aus dem Browser ist erlaubt (`Access-Control-Allow-Origin: *`).
- `round_trip` und eigene `custom_model`s je Anfrage brauchen `"ch.disable": true` (flexibler Modus);
  Rechenzeit lokal 0,1–0,7 s je Tour.
