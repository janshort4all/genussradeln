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
| Stopps (POIs) | Einmalig per Overpass-Skript aus OSM exportiert → `static/data/pois.geojson` |
| Speicherung | IndexedDB auf dem Gerät (z. B. `idb-keyval`), kein Backend |
| Sprachansagen | Web Speech API (`speechSynthesis`, `lang="de-DE"`) + kurzer Signalton |
| Hosting App | GitHub Pages oder Cloudflare Pages |
| Hosting Routing | Kostenloses Server-Kontingent (z. B. Oracle Cloud Always Free) – Konditionen vor Einrichtung prüfen |

Vor dem Einbau einer Bibliothek oder API immer die **aktuelle offizielle Doku** prüfen
(GraphHopper-Parameter, MapLibre-API, vite-pwa). Nicht aus dem Gedächtnis raten.

## Wie „schön“ berechnet wird

Zweistufig, damit kein eigener Rechen-Server nötig ist:

1. **Kandidaten erzeugen (GraphHopper):** Rundtouren mit `algorithm=round_trip`, Zieldistanz aus
   Dauer × Geschwindigkeit (gemütlich ≈ 15 km/h, sportlicher ≈ 19 km/h), 8–12 Kandidaten über
   verschiedene `round_trip.seed`/`heading`. Profil `genuss` bevorzugt per Custom Model:
   Radwege, Wirtschaftswege, ausgeschilderte Radnetze (`bike_network`), guten Belag;
   meidet Hauptstraßen, schlechten Belag, (bei „gemütlich“) Steigungen.
2. **Nachbewerten (im Client):** Jeder Kandidat bekommt Punkte für Anteil der Strecke nahe Wasser /
   im Wald (vereinfachte Flächen aus OSM als `static/data/landscape.geojson`), passende Stopps
   in sinnvollem Abstand (z. B. Café nach 40–60 % der Strecke) und Abzug für Wiederholungen
   (gleiche Wege hin und zurück). Die drei besten, untereinander möglichst verschiedenen Touren
   werden angezeigt.

Gewichte als Konstanten in `src/lib/scoring/weights.ts`, damit sie nach Testfahrten leicht justierbar sind.

### Touren mit Ziel (F3)

- **Ziel = Art von Ort** („ein Biergarten“): passende POIs aus `pois.geojson` suchen, deren Entfernung
  zur gewünschten Länge passt (nur Hinweg: ≈ volle Länge; mit Rückweg: ≈ halbe Länge), pro Kandidat
  Route mit Profil `genuss` berechnen, ggf. über Zwischenpunkte verlängern, dann wie oben nachbewerten.
- **Ziel = bestimmter Ort:** Hinweg direkt mit `genuss`; ist die Wunschlänge größer, Umweg über schöne
  Zwischenpunkte (Wasser/Wald) einbauen.
- **Rückweg auf anderem Weg:** zweite Route über einen seitlich versetzten Zwischenpunkt; die
  Nachbewertung bestraft Überlappung mit dem Hinweg.

### Tour anpassen (F6)

Eine Tour wird intern als Liste von Wegpunkten gespeichert (Start, Zwischenpunkte, Stopps, Ziel).
Jede Anpassung ändert nur diese Liste und berechnet die Route neu – dadurch funktionieren
„kürzer/länger“, „Stopp hinzufügen“, „Abschnitt meiden“, Ziehen auf der Karte und „Rückgängig“
(Verlauf der Wegpunkt-Listen) mit derselben Logik wie „Selbst planen“ (F16).
Auf dem Handy nur einfache Knöpfe; Ziehen der Strecke auf der Karte vor allem am PC.

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
│   ├── fetch-pois.ts           # Overpass → static/data/pois.geojson
│   └── fetch-landscape.ts      # Wasser/Wald → static/data/landscape.geojson
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
└── static/data/                # pois.geojson, landscape.geojson
```

## Meilensteine (in dieser Reihenfolge)

Jeder Meilenstein endet mit etwas, das man auf dem Handy ausprobieren kann.

- **M0 Grundgerüst:** SvelteKit-PWA, Schriften, Farben, Basis-Komponenten, leere Screens mit Navigation
  zwischen ihnen, Deploy auf GitHub Pages.
- **M1 Routing lokal:** GraphHopper per Docker mit Regionsauszug, Profil `genuss`, Rundtour-Abfrage funktioniert.
- **M2 Vorschläge (F1, F2, F4):** Wunsch-Screen (Dauer oder km) → Rundtour-Kandidaten → Nachbewertung → drei Tourkarten.
- **M3 Tourdetail (F8, F9):** Karte, Kennzahlen in Worten, Höhenprofil, Stopps nach Kilometer.
- **M4 Zieltouren & Freitext (F3, F5):** Ziel als Ortsart oder bestimmter Ort, Rückweg anders; Worterkennung mit Tests.
- **M5 Anpassen & Selbst planen (F6, F16):** Wegpunkt-Modell, kürzer/länger, Stopp hinzufügen, Abschnitt meiden,
  Rückgängig; Punkte setzen und Strecke ziehen (PC).
- **M5b Schönere Strecke (F7):** Schwachstellen finden, Umfahrungen berechnen, grüne Variante anzeigen, Übernehmen/Nein danke.
- **M6 Navigation (F10):** Positionsverfolgung, Abbiegeanzeige, Sprachansagen, Off-Route-Hinweis, Wake Lock, dunkle Ansicht.
- **M7 Offline & Export (F11, F12):** Tour inkl. Kartenkacheln vorab cachen, GPX-Export.
- **M8 Merken, Teilen, Akku (F13, F14, F15):** IndexedDB, Teilen-Link ohne Konto; Akkugröße (z. B. 400/500/625/750 Wh)
  + Ladestand, einfache Verbrauchsschätzung nach Strecke, Steigung und Anstrengung, Ausgabe in drei Stufen.
- **M9 Testreife:** Routing auf Server, Impressum + Datenschutzhinweis, Kurzanleitung, Test auf 2–3 echten Android-Handys.

## Arbeitsweise

- Vor größeren Schritten kurz planen (Plan Mode) und den Plan zeigen.
- Kleine, nachvollziehbare Commits auf Deutsch, z. B. `Tourkarte: Akku-Hinweis ergänzt`.
- UI-Texte, Kommentare für Nutzer und Doku auf Deutsch; Code-Bezeichner auf Englisch.
- Nach UI-Änderungen in schmaler Handy-Ansicht (390 px) prüfen und die goldenen Regeln abhaken.
- Keine neuen Abhängigkeiten ohne Begründung. Keine Tracking-, Analytics- oder Werbe-Bibliotheken.
- Geheimnisse (Server-Zugänge) nie ins Repository; `.env` ist in `.gitignore`.

## Befehle

```
npm install          # Abhängigkeiten installieren (einmalig bzw. nach Änderungen an package.json)
npm run dev          # App lokal unter http://localhost:5173
npm run check        # TypeScript- und Svelte-Prüfung
npm run build        # statischer Build nach build/
npm run preview      # fertigen Build lokal ansehen
npm run icons        # App-Symbole aus static/icon.svg neu erzeugen
```

GitHub-Pages-Build lokal nachstellen (App unter Unterpfad, wie online):
`$env:BASE_PATH='/genussradeln'; npm run build; npm run preview` → <http://localhost:4173/genussradeln/>

Online: <https://janshort4all.github.io/genussradeln/> · Repository: <https://github.com/janshort4all/genussradeln>

Veröffentlichen: Push auf `main` → GitHub Action `.github/workflows/deploy.yml` baut und stellt auf GitHub Pages.

GraphHopper lokal (ab M1): `cd routing && docker compose up`

## Technische Hinweise (Stand M0)

- **SvelteKit 2** (nicht 3): `@vite-pwa/sveltekit` unterstützt Kit 3 noch nicht (Peer-Dependency `^2`).
  Vor einem Upgrade prüfen, ob das PWA-Plugin nachgezogen hat.
- Links immer über `resolve()` aus `$app/paths` bauen, damit der Unterpfad auf GitHub Pages stimmt.
- Schriften kommen per `@fontsource` aus dem eigenen Build (keine Google-Fonts-Anfragen).
- Seiten werden vorgerendert; unbekannte Pfade (z. B. geteilte `/tour/<id>`-Links) laufen über `404.html`
  als SPA-Ersatzseite, die auch im Offline-Speicher liegt.
- Beispieltouren für die leeren Screens: `src/lib/tour/sample.ts` (ab M2 durch echte Touren ersetzen).
