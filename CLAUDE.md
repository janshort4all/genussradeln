# Genuss-Radeln – Projektregeln für Claude Code

Testversion einer Fahrradrouten-Web-App für Menschen ab ca. 50 Jahren (E-Bike).
Kernidee: Nutzer sagen, worauf sie Lust haben (Dauer oder km, Anstrengung, Landschaft, evtl. ein Ziel
wie „Biergarten“) und bekommen **drei schöne Touren** vorgeschlagen – statt selbst Routen bauen zu müssen.
Jeder Vorschlag lässt sich danach einfach anpassen.

Die vollständigen Anforderungen stehen in `docs/lastenheft.md`. Bei Widersprüchen gilt das Lastenheft.
Das visuelle Vorbild sind die vier Mockup-Screens (Start, Vorschläge, Tourdetail, Navigation),
beschrieben in `docs/lastenheft.md` → Abschnitt „Bedienung“.

## Rahmen des Tests

- 5–10 Testpersonen, Region **Niederrhein / Duisburg** (Regierungsbezirk Düsseldorf), überwiegend **Android**.
- **Kein Konto**, keine Nutzungsdaten. Alles bleibt auf dem Gerät; geteilte Touren stecken im Link.
- **Betriebskosten möglichst 0 €.** Keine kostenpflichtigen APIs, kein Google.
- Testdauer 6–8 Wochen, Start sobald alle 16 Funktionen (F1–F16) fertig sind.

## Goldene Regeln für die Zielgruppe (gelten für JEDE UI-Änderung)

1. Fließtext ≥ 17 px, Überschriften ≥ 28 px. Schrift: Atkinson Hyperlegible (Text), Bricolage Grotesque (Titel).
2. Tap-Flächen ≥ 48 × 48 px, genug Abstand dazwischen.
3. Kontrast ≥ 4,5 : 1 (WCAG AA). Muss in der Sonne ablesbar sein.
4. Höchstens drei Hauptaktionen pro Screen, genau eine davon hervorgehoben.
5. Anrede „Sie“. Keine Fachbegriffe: „Steigung: flach“ statt „85 Hm“, „Akku reicht locker“ statt „62 %“.
6. Jeder Screen hat einen sichtbaren Zurück-Weg. Nichts geht durch einen Fehlgriff verloren.
7. Muss bei vergrößerter Systemschrift funktionieren (rem statt px für Schrift).
8. Echte `<button>`/`<a>`/`<label>`-Elemente, keine klickbaren `div`s.
9. Im Zweifel: weglassen. Einfachheit schlägt Funktionsumfang.

Farben: **nur Farben aus dem Logo** (`assets/logo-original.png`) bzw. hellere/dunklere Abstufungen davon.
Logo-Grundfarben: Creme `#F7F2E5`, Dunkelgrün `#283C30`, Olivgrün `#768641`, Terrakotta `#DD8258`,
Sonnengelb `#F1B34C`, Taubenblau `#32596F`, Wasserblau `#AFC6D1`, Khaki `#CEB37B`, Schiefer `#243539`.
Alle Werte als CSS-Variablen in `src/app.css`:
- Hintergrund Creme `#F7F2E5`, Flächen `#FDFBF5`, Text Schiefer `#243539`, Nebentext Taubenblau `#32596F`, Rahmen `#DDD2B5`
- Marke/Auswahl Dunkelgrün `#283C30`, helles Grün `#E8EBD6`; Olivgrün `#768641` nur für Icons/Grafik (zu hell für Text)
- Hauptaktion Terrakotta, abgedunkelt `#B0552F` (Original `#DD8258` schafft mit weißer Schrift kein 4,5 : 1)
- Navigation: Hintergrund `#000000` (OLED spart Strom – bewusste Ausnahme), Akzent Sonnengelb `#F1B34C`
- Logo/App-Symbole neu erzeugen: `npm run icons` (Skript `scripts/make-logo.mjs`)

## Strom sparen (Navigation läuft auf dem Handy)

- Navigationsansicht dunkel, möglichst wenig Animation, keine Dauer-Neuzeichnung der Karte.
- Standort mit `watchPosition`, aber Kartenupdates drosseln (z. B. max. 1×/s, bei Stillstand seltener).
- Wake Lock nur während aktiver Navigation, beim Pausieren/Beenden sofort freigeben.
- Kein Polling, keine Hintergrund-Requests während der Fahrt; Tour vorher komplett laden (Offline).

## Technik-Stack

| Bereich | Entscheidung |
| --- | --- |
| Frontend | SvelteKit + TypeScript, `adapter-static`, PWA via `@vite-pwa/sveltekit` |
| Karte | MapLibre GL JS, Kacheln von OpenFreeMap (Stil „liberty“ als Basis, eigener ruhiger Stil später) |
| Routing | GraphHopper (Open Source, selbst gehostet), OSM-Auszug Regierungsbezirk Düsseldorf von Geofabrik |
| Schönheit | GraphHopper-Custom-Model „genuss“ + Nachbewertung der Kandidaten im Client (siehe unten) |
| Daten (Stopps, Landschaft, Namen) | Aus der OSM-Regionsdatei von Geofabrik (dieselbe wie fürs Routing) per `npm run data` → `static/data/`. Kein Overpass (überlastet) |
| Speicherung | IndexedDB auf dem Gerät (z. B. `idb-keyval`), kein Backend |
| Sprachansagen | Web Speech API (`speechSynthesis`, `lang="de-DE"`) + kurzer Signalton |
| Hosting App | GitHub Pages oder Cloudflare Pages |
| Hosting Routing | Oracle Cloud Always Free (Ampere A1, 2 OCPUs/12 GB), https://130-61-177-54.sslip.io – siehe `routing/SERVER.md` |

Vor dem Einbau einer Bibliothek oder API immer die **aktuelle offizielle Doku** prüfen
(GraphHopper-Parameter, MapLibre-API, vite-pwa). Nicht aus dem Gedächtnis raten.

## Wie „schön“ berechnet wird

Zweistufig, damit kein eigener Rechen-Server nötig ist:

1. **Kandidaten erzeugen (GraphHopper):** Rundtouren mit `algorithm=round_trip`, Zieldistanz aus
   Dauer × Geschwindigkeit (gemütlich ≈ 15 km/h, sportlicher ≈ 19 km/h), 8–12 Kandidaten über
   verschiedene `round_trip.seed`/`heading`. Profil `genuss` bevorzugt per Custom Model:
   Radwege, Wirtschaftswege, ausgeschilderte Radnetze (`bike_network`), guten Belag;
   meidet Hauptstraßen, wirklich schlechten Belag (Wiese, Sand, Kopfsteinpflaster, sehr holprig), Schiebestrecken
   (`get_off_bike`: Fußwege sind keine Radwege), (bei „gemütlich“) Steigungen. **Schotter-, Erd- und Feldwege sind
   gleichwertig zu Asphalt** (E-Bike; Entscheidung Jan, 06.10.2026) – in `genuss.json` und in der Nachbewertung.
2. **Nachbewerten (im Client):** Jeder Kandidat bekommt Punkte für Anteil der Strecke nahe Wasser /
   im Wald (vereinfachte Flächen aus OSM als `static/data/landscape.geojson`), passende Stopps
   in sinnvollem Abstand (z. B. Café nach 40–60 % der Strecke) und Abzug für Wiederholungen
   (gleiche Wege hin und zurück). Die drei besten, untereinander möglichst verschiedenen Touren
   werden angezeigt.

Gewichte als Konstanten in `src/lib/scoring/weights.ts`, damit sie nach Testfahrten leicht justierbar sind.

### Touren mit Ziel (F3)

- **Ziel = Art von Ort** („ein Biergarten“): passende POIs aus `pois.json` suchen, deren Entfernung
  zur gewünschten Länge passt (nur Hinweg: ≈ volle Länge; mit Rückweg: ≈ halbe Länge), pro Kandidat
  Route mit Profil `genuss` berechnen, ggf. über Zwischenpunkte verlängern, dann wie oben nachbewerten.
- **Ziel = bestimmter Ort (umgesetzt in M2, `src/lib/routing/plan.ts`):**
  1. Direkter `genuss`-Weg + GraphHopper-Alternativen (`alternative_route`).
  2. Zusätzliche Wege über schöne Zwischenpunkte (Spielraum `DETOUR` in `weights.ts`, gefragt wird nicht mehr): Rasterpunkte mit viel Wasser/Wald/Grün in der Umgebung
     (Summenfeld über `landscape.png`), innerhalb der Umweg-Ellipse um Start/Ziel, nicht direkt am kürzesten Weg.
  3. Wege mit „Stummel“ (über 50 m doppelt gefahren: hin und zurück in eine Sackgasse oder Lasso-Schleife um den Punkt) verwerfen
     (`backtrack.ts`, `VIA_SEARCH.maxBacktrackM`). Vorher Reparaturversuch: Hilfspunkt an die Abzweigung verlegen
     und neu rechnen – dann führt der Weg an der schönen Stelle vorbei, ohne Abstecher. Ebenso Wege, die **im Kreis**
     fahren (kreuzen die eigene Strecke, Runde ≥ 150 m, z. B. einmal um einen See; `findLoop`, Wunsch Jan 06.10.2026):
     über die Kreuzung neu rechnen, sonst verwerfen. Ebenso **Zipfel** (`findSpur`: nach ≥ 300 m Fahrt bis auf 60 m zurück an
     eine frühere Stelle, z. B. auf einem Parallelweg) – nur bei Wegen über Hilfspunkte (Brückenrampen am direkten Weg bleiben).
     Zusätzlich Wege über **zwei schöne Stellen nacheinander** (z. B. erst Rhein, dann See; `viaPairs`, `VIA_PAIRS`):
     Paare aus den 5 schönsten Einzel-Umwegen, in Fahrtrichtung geordnet; mit Stummel oder Kreis verworfen.
  4. Nachbewertung (`score.ts`), Mehrweg-Grenze, Abzug je Mehrweg. Radwege, die direkt neben einer großen Straße
     verlaufen (eigener Weg in OSM, aber laut), zählen nicht als ruhig und bekommen Abzug (`SCORE.roadside`; Daten
     `roads.bin`: Zellen ≤ 25 m an motorway…secondary, 2. Ebene nur Autobahn/Kraftfahrstraße, `scoring/roads.ts`, erst ab
     150 m am Stück). Abgestuft (`ROADSIDE`, Wunsch Jan 06.10.2026): mit Wald oder Wasser im Umkreis von ca. 100 m nur ein
     Drittel des Abzugs (Naherholungsgebiet an der Autobahn schlägt die Stadt), neben Autobahnen das 1,3-Fache.
  5. **Auswahl (Entscheidung Jan, 06.10.2026):** bis zu `MAX_SUGGESTIONS` = 5 Wege, **benannt nach der Länge**:
     „Längste Tour“, „Lange Tour“, „Mittlere Tour“, „Kurze Tour“, „Kürzeste Tour“ (bei zwei: „Längere/Kürzere Tour“;
     `lengthLabels` in `plan.ts`), sortiert vom längsten zum kürzesten. Keine Rollen wie „Am schönsten“ mehr.
     Der direkte genuss-Weg ist **immer dabei** (außer ein anderer Vorschlag ist kürzer und schöner – dann ist der der direkte).
     Für die übrigen Längen jeweils der **schönste Weg dieser Länge** (`bestForItsLength`, Wunsch Jan 06.10.2026): zuerst
     der schönste überhaupt, dann nach Schönheit je Umweg; jeder lohnt sich (`WORTHWHILE`) und ist spürbar anders lang
     (`LENGTH_STEP`: ≥ 5 % bzw. 500 m). Schönheit einer Runde enthält den Abzug für denselben Weg zurück; Runden mit
     mehr als `ROUND_MAX_OVERLAP` = 40 % gemeinsamer Strecke fallen weg. Paare aus den `PAIR_CANDIDATES` = 8 besten
     Hin- und Rückwegen. **Keine fast gleichen Vorschläge** (`tooSimilar`): gleich, wenn jeder von beiden zu mehr als
     `DIVERSITY_MAX_OVERLAP` auf dem anderen verläuft – dann bleibt der schönere, auch wenn der andere der direkte ist
     (Wunsch Jan 06.10.2026: lieber nur zwei Vorschläge). Ein Weg mit großem Abstecher ist kein „gleicher“ Weg.
     Bleibt nur einer übrig, heißt er „Ihre Tour“. Bei kurzen Strecken bleiben so oft nur zwei.
     Die Wegkarte zeigt „Längste Tour“ groß, den beschreibenden Titel darunter.
  6. Fahrzeit: `rideMinutes` (`src/lib/tour/duration.ts`) = Strecke / 15 km/h + `CLIMB_MINUTES_PER_100M` je 100 Höhenmeter.
- **„Fast direkt“ (Wunsch Jan, 04.10.2026, intern):** der schönste Weg, der höchstens ca. 15 % länger ist als der direkte
  (`COMPACT` in `weights.ts`). Kandidaten dafür zusätzlich über Punkte
  knapp links/rechts der Luftlinie (`sideVias`) – die zählen nur für „Fast direkt“, nicht für die drei schönsten.
- **Titel (04.10.2026):** zuerst benannter Höhepunkt und unterscheidende Orte („Am Rhein entlang über Nierst“,
  `src/lib/naming/`, Daten `landmarks.json`/`places.json`); sonst nach der Landschaft, die bei dem Weg wirklich vorne liegt (`TITLE_MIN_SHARE_OF_TOP`); ist sie
  vergeben: Himmelsrichtung („Am Wasser entlang – östliche Strecke“) oder unterscheidende Straße, nie eine schwächere
  Landschaft. Große Gewässer (Rhein) zählen bis ca. 400 m Abstand (`BIG_WATER`), bei Stopps nur aus der Nähe.
- **Rückweg auf anderem Weg:** Rückweg genauso planen, Paare aus Hin- und Rückweg bilden; Abzug für
  Überlappung mit dem Hinweg (`SCORE.returnOverlap`).
- **Datendateien (05.10.2026):** `npm run data` liest die Regionsdatei `routing/data/*.osm.pbf` direkt (`scripts/lib/osm-file.ts`,
  Bibliothek `@osmix/pbf`, nur Entwicklung) und schreibt `landscape.png/.json` (Klassen nichts/Felder/Grün/Wald/Wasser,
  ca. 100 m Zellen, Ausdehnung aus der Datei), `pois.json`, `places.json`, `landmarks.json`. Andere Region = andere Datei.
- **Ortssuche:** Photon (`src/lib/geocode/photon.ts`), begrenzt auf die Region, Haltestellen und nahe Doppelte gefiltert.
- **Karte:** `src/lib/map/RouteMap.svelte` (MapLibre 6, nur ESM; Worker per `?worker&url` + `setWorkerUrl`,
  `worker.format: 'es'` in `vite.config.ts`), Stil OpenFreeMap „liberty“.

### Tour anpassen (F6)

Eine Tour wird intern als Liste von Wegpunkten gespeichert (Start, Zwischenpunkte, Stopps, Ziel).
Jede Anpassung ändert nur diese Liste und berechnet die Route neu – dadurch funktionieren
„kürzer/länger“, „Stopp hinzufügen“, „Abschnitt meiden“, Ziehen auf der Karte und „Rückgängig“
(Verlauf der Wegpunkt-Listen) mit derselben Logik wie „Selbst planen“ (F16).
Auf dem Handy nur einfache Knöpfe; Ziehen der Strecke auf der Karte vor allem am PC.

**Hilfspunkt vs. Stopp (Entscheidung 04.10.2026):** Automatische Hilfspunkte der App (`via`) dürfen keinen „Stummel“
erzeugen – solche Wege werden verworfen. Vom Nutzer gewählte Stopps (`stop`, z. B. Biergarten) und das Ziel bleiben
immer drin, auch wenn sie nur über einen Abstecher hin und zurück auf demselben Weg erreichbar sind; die App zeigt
das dann offen an („Kleiner Abstecher: 300 m hin und zurück“). Die Stummel-Prüfung gilt also nie für `stop`/Ziel.

### Schönere Strecke vorschlagen (F7) – zentrale Funktion

Ziel: Nutzer müssen keine Karten lesen können, um eine bessere Strecke zu finden. Die App macht das,
was erfahrene Radler mit Kartenblick tun, und bietet es als Ja/Nein-Frage an.

1. **Schwachstellen finden:** Route in Abschnitte teilen und jeden bewerten (Straßenklasse, Radweg
   vorhanden?, Tempo, Belag, Nähe Wasser/Wald). Abschnitte ≥ 300 m mit schlechter Bewertung
   (z. B. entlang primary/secondary ohne getrennten Radweg) sind Kandidaten.
2. **Umfahrung suchen:** Für jeden Kandidaten Route vom Punkt davor zum Punkt danach mit Profil
   `genuss` neu berechnen und den schwachen Abschnitt meiden (GraphHopper Custom Model mit
   `areas`/Priorität 0 für einen Korridor um den Abschnitt – aktuelle Doku prüfen).
3. **Filtern:** Nur anbieten, wenn Schönheitsgewinn deutlich ist und der Mehrweg begrenzt
   (Richtwert: ≤ 3 km bzw. ≤ 20 % des Abschnitts plus 2 km; Konstanten in `weights.ts`).
   Höchstens 2–3 Vorschläge pro Tour, sortiert nach Gewinn je Mehr-Kilometer.
4. **Darstellen:** bisheriger Abschnitt orange mit Schild „Hauptstraße“, Umfahrung grün gestrichelt
   mit weichem Leuchten und Schild „Durchs Grüne · +1,8 km“. Darunter Karte mit „Bisher“/„Neu“
   in Worten, Mehrweg in km und Minuten, Knöpfe „Nein, danke“ und „Übernehmen“, Zähler „1 von 2“.
   Übernehmen ändert nur die Wegpunkt-Liste (siehe F6), daher immer rückgängig zu machen.
5. **Nie während der Navigation** einblenden – nur beim Planen und im Tourdetail.

Hinweis: Die Erstvorschläge (F4) sollen bereits möglichst schön sein. F7 fängt ab, was das Routing
wegen der Längenvorgabe in Kauf genommen hat, und macht den Tausch „etwas länger, dafür schöner“
für den Nutzer sichtbar und entscheidbar.

### Wunsch in eigenen Worten (F5)

Keine kostenpflichtige KI. Einfache deutsche Worterkennung in `src/lib/intent/parse.ts`:
Zahlen mit „km“/„Kilometer“/„Stunde(n)“/„halben Tag“, Landschaftswörter (grün, Wald, Wasser, Rhein,
See, Aussicht), Zielwörter (Biergarten, Café, Eis, Toilette, Ortsnamen über Geocoding), „gemütlich“/
„sportlich“, „zurück“/„Rundtour“. Ergebnis füllt die Knöpfe vor; Unklares bleibt zur Auswahl offen.
Mit Testsätzen absichern (`parse.test.ts`), z. B. „20 km durchs Grüne zum Biergarten“.

## Projektstruktur (Ziel)

```
genuss-radeln/
├── CLAUDE.md
├── docs/
│   ├── lastenheft.md
│   └── testanleitung.md        # 1-Seiten-Kurzanleitung für Testpersonen (später)
├── routing/
│   ├── config.yml              # GraphHopper-Konfiguration inkl. Profil „genuss“
│   ├── custom_models/genuss.json
│   ├── docker-compose.yml
│   └── README.md               # Daten laden, starten, auf Server bringen
├── scripts/
│   ├── build-data.ts           # OSM-Regionsdatei → alle Dateien in static/data/
│   ├── data/                   # Bausteine: Landschaft, Stopps, Orte, Gewässer-/Waldnamen
│   └── lib/osm-file.ts         # .osm.pbf lesen
├── src/
│   ├── lib/
│   │   ├── components/         # Button, ChoiceGroup, TourCard, BatteryHint, ElevationProfile …
│   │   ├── map/                # MapLibre-Setup, Routenlayer, POI-Layer
│   │   ├── routing/            # GraphHopper-Client, Rundtour- und Zieltour-Kandidaten
│   │   ├── scoring/            # Nachbewertung, weights.ts
│   │   ├── intent/             # Freitext → Tourwunsch (parse.ts + Tests)
│   │   ├── tour/               # Tour-Modell (Wegpunkte), Anpassen, Rückgängig-Verlauf
│   │   ├── improve/            # F7: Schwachstellen finden, Umfahrungen berechnen und filtern
│   │   ├── navigation/         # Positionsverfolgung, Abbiegehinweise, Off-Route, Ansagen, Wake Lock
│   │   ├── storage/            # gemerkte Touren (IndexedDB)
│   │   ├── share/              # Tour ↔ Link (kodierte Polyline im URL-Hash)
│   │   ├── gpx/                # GPX-Export
│   │   └── battery/            # Akku-Einschätzung
│   └── routes/
│       ├── +page.svelte        # Start: Tourwunsch (F1, F2, F3, F5)
│       ├── vorschlaege/        # F4
│       ├── tour/[id]/          # F6, F7, F8, F9, F12, F13, F14, F15
│       ├── navigation/[id]/    # F10, F11
│       ├── planen/             # F16 Selbst planen
│       └── meine-touren/       # F14
└── static/data/                # pois.json, landscape.png + landscape.json
```

## Meilensteine (in dieser Reihenfolge)

Jeder Meilenstein endet mit etwas, das man auf dem Handy ausprobieren kann.

- **M0 Grundgerüst:** SvelteKit-PWA, Schriften, Farben, Basis-Komponenten, leere Screens mit Navigation
  zwischen ihnen, Deploy auf GitHub Pages.
- **M1 Routing lokal:** GraphHopper lokal (Java; Docker erst für den Server) mit Regionsauszug, Profil `genuss`,
  Rundtour-Abfrage funktioniert. ✔ erledigt
> **Schwerpunkt (Entscheidung 03.10.2026):** Die meisten Menschen wissen, wohin sie wollen. Kern der App ist daher
> „Ziel eingeben → die App baut den schönsten Weg dorthin“. Rundtouren sind die Nebensache.
> Reihenfolge deshalb umgestellt; alle 16 Funktionen bleiben. Testen bis M9 am PC (Routing lokal).

- **M2 Zieltour (F1, F3 bestimmter Ort, F4 für Ziele):** Start (Standort/Adresse) + Ziel suchen (Photon),
  bis zu 5 Wegvarianten mit `genuss` (direkter immer dabei),
  Nachbewertung, Darstellung auf echter Karte (MapLibre); Rückweg „nur hin“ / „auf anderem Weg zurück“. ✔ erledigt
- **M3 Tourdetail (F8, F9):** Karte, Kennzahlen in Worten, Höhenprofil, Stopps nach Kilometer. ✔ erledigt
> **Reihenfolge (Entscheidung 05.10.2026):** Als Nächstes **M6 Navigation** (danach M4, M4b, M5 …), damit Testpersonen
> die Touren direkt in der App fahren können. GPX-Export (F12 aus M7) ist vorgezogen und fertig.
- **M4 Anpassen & Selbst planen (F6, F16):** Wegpunkt-Modell, Zwischenziele, kürzer/länger, Stopp hinzufügen,
  Abschnitt meiden, Rückgängig; Punkte setzen und Strecke ziehen (PC).
- **M4b Schönere Strecke (F7):** Schwachstellen finden, Umfahrungen berechnen, grüne Variante anzeigen, Übernehmen/Nein danke.
- **M5 Rundtouren & Freitext (F2, F4 Rundtour, F3 Ortsart, F5):** Rundtour-Vorschläge nach Dauer/km, Ziel als Ortsart
  („ein Biergarten“), Worterkennung mit Tests.
- **M6 Navigation (F10):** Positionsverfolgung, Abbiegeanzeige, Sprachansagen, Off-Route-Hinweis, Wake Lock, dunkle Ansicht.
  ✔ umgesetzt 05.10.2026 (Test draußen steht aus), dazu vorgezogen „Aufs Handy schicken“ (Tour im Link, Teil von F15).
- **M7 Offline & Export (F11, F12):** Tour inkl. Kartenkacheln vorab cachen, GPX-Export (✔ vorgezogen, `src/lib/gpx/`).
- **M8 Merken, Teilen, Akku (F13, F14, F15):** IndexedDB, Teilen-Link ohne Konto; Akkugröße (z. B. 400/500/625/750 Wh)
  + Ladestand, einfache Verbrauchsschätzung nach Strecke, Steigung und Anstrengung, Ausgabe in drei Stufen.
- **M9 Testreife:** Routing auf Server, Impressum + Datenschutzhinweis, Kurzanleitung, Test auf 2–3 echten Android-Handys.

## Arbeitsweise

- Vor größeren Schritten kurz planen (Plan Mode) und den Plan zeigen.
- Kleine, nachvollziehbare Commits auf Deutsch, z. B. `Tourkarte: Akku-Hinweis ergänzt`.
- UI-Texte, Kommentare für Nutzer und Doku auf Deutsch; Code-Bezeichner auf Englisch.
- Nach UI-Änderungen in schmaler Handy-Ansicht (390 px) prüfen und die goldenen Regeln abhaken.
- **Nie auf die Testregion zuschneiden (Jan, 04.10.2026):** Logik, Voreinstellungen und UI-Entscheidungen
  aus den Daten der Strecke ableiten (Höhenmeter, Belag …), nie aus „am Niederrhein ist es flach“.
  Regionsgrenzen und Datendateien sind austauschbare Konfiguration.
- Keine neuen Abhängigkeiten ohne Begründung. Keine Tracking-, Analytics- oder Werbe-Bibliotheken.
- Geheimnisse (Server-Zugänge) nie ins Repository; `.env` ist in `.gitignore`.

## Befehle

```
npm install          # Abhängigkeiten installieren (einmalig bzw. nach Änderungen an package.json)
npm run dev          # App lokal unter http://localhost:5173
npm run check        # TypeScript- und Svelte-Prüfung
npm test             # Unit-Tests (Vitest, Dateien *.test.ts in src/)
npm run data         # Landschaft, Stopps, Orts- und Gewässernamen aus der OSM-Regionsdatei → static/data/ (ca. 1 Min.)
npm run build        # statischer Build nach build/
npm run preview      # fertigen Build lokal ansehen
npm run icons        # Logo und App-Symbole aus assets/logo-original.png neu erzeugen

npm run server -- status|deploy|karte|logs   # Routing-Server online verwalten (routing/SERVER.md)
npm run dev:handy       # App im WLAN fürs Handy bereitstellen (Planung über den PC)

npm run routing:setup   # einmalig: GraphHopper + OSM-Auszug nach routing/data/ laden (Java 17+ nötig)
npm run routing:start   # GraphHopper unter http://localhost:8989 (Testkarte: /maps/), Strg+C beendet
npm run routing:test    # Rundtour-Test mit Auswertung, GPX nach routing/test-output/
npm run routing:karte   # Touren des letzten Tests auf einer Karte (http://localhost:8100)
```

Details zum Routing: `routing/README.md`.

GitHub-Pages-Build lokal nachstellen (App unter Unterpfad, wie online):
`$env:BASE_PATH='/genussradeln'; npm run build; npm run preview` → <http://localhost:4173/genussradeln/>

Online: <https://janshort4all.github.io/genussradeln/> · Repository: <https://github.com/janshort4all/genussradeln>

Veröffentlichen: Push auf `main` → GitHub Action `.github/workflows/deploy.yml` baut und stellt auf GitHub Pages.

## Technische Hinweise

- **SvelteKit 2** (nicht 3): `@vite-pwa/sveltekit` unterstützt Kit 3 noch nicht (Peer-Dependency `^2`).
  Vor einem Upgrade prüfen, ob das PWA-Plugin nachgezogen hat.
- Links immer über `resolve()` aus `$app/paths` bauen, damit der Unterpfad auf GitHub Pages stimmt.
- Schriften kommen per `@fontsource` aus dem eigenen Build (keine Google-Fonts-Anfragen).
- Seiten werden vorgerendert; unbekannte Pfade (z. B. geteilte `/tour/<id>`-Links) laufen über `404.html`
  als SPA-Ersatzseite, die auch im Offline-Speicher liegt.
- Beispieltouren für die leeren Screens: `src/lib/tour/sample.ts` (ab M2 durch echte Touren ersetzen).
- **GraphHopper 11.1** lokal per Java (`routing/start.ps1`); `round_trip` und Anfrage-`custom_model` brauchen
  `"ch.disable": true`. Ein Anfrage-`custom_model` wird an das Profil `genuss` angehängt (z. B. „gemütlich“ in `src/lib/routing/custom-models.ts`).
  Fehlendes Tempolimit ist `max_speed = Infinity` → Bedingungen immer nach oben begrenzen.
  Erkenntnisse für M2/M3 (Längen zu kurz, Höhenmeter verrauscht) stehen in `routing/README.md`.
- **Navigation (`src/lib/navigation/`):** `track.ts` (Strecke mit Kilometrierung, Abzweigungen aus den GraphHopper-
  `instructions`, Suche nur im Fenster ab dem letzten Stand – sonst springt die Anzeige bei Hin/Rück auf derselben Straße),
  `guidance.ts` (reine Rechnung je Standortmeldung: Ansagen, „Strecke verlassen“; Schwellen in `NAV`), `wording.ts`
  (Worte für Anzeige/Ansage), `device.ts` (Sprache + Signalton, Wake Lock, Vollbild, `watchPosition` gedrosselt, Probefahrt).
  Karte: `NavMap.svelte` mit eigenem ruhigem Stil `map/nav-style.ts` (dunkel/hell), dreht mit der Fahrtrichtung, nicht verschiebbar.
  Probefahrt am PC (Maus) oder mit `?probefahrt` in der Adresse. Neu berechnen bei Abweichung gibt es erst mit Server (M9).
- **Tour im Link (`src/lib/share/`, Seite `/geteilt`):** kurz (ca. 300 Zeichen): Start, Ziel und Stützpunkte etwa alle 2 km
  (immer mitten in einem Wegstück, nie auf Kreuzungen), deflate + base64url hinter „#“ (geht an keinen Server, nichts wird
  gespeichert). Der Empfänger rechnet den Weg durch die Stützpunkte nach (`rebuild.ts`, `exactPoints`: kein Wegschieben von
  Brücken, Wenden erlaubt). Alte lange Links (ganze Strecke) werden weiter gelesen. Teilen-Knopf: Handy → Teilen-Menü,
  PC → „Per WhatsApp schicken“ (wa.me) / „Link kopieren“. Ohne https zeigt der Link auf die Online-App (`PUBLIC_APP_URL`).
- **Ortssuche sofort:** Orte aus `places.json` erscheinen beim Tippen ohne Wartezeit (`geocode/local.ts`), Photon (ca. 1,3 s)
  ergänzt Straßen und Adressen.
- PowerShell-Skripte (`*.ps1`) als UTF-8 **mit BOM** speichern, sonst zeigt Windows PowerShell 5.1 Umlaute falsch.
