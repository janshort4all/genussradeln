# Lastenheft Genuss-Radeln (Testversion)

Stand: 03.10.2026 · Autor: Jan

## 1. Ausgangslage und Ziel des Tests

Der Test soll zeigen, ob Radfahrer ab etwa 50 Jahren mit einer stark vereinfachten Anwendung schönere Touren finden und fahren als mit Google Maps.

- **Problem:** E-Bike-Fahrer dieser Altersgruppe navigieren oft mit Google Maps. Das ist effizient, führt aber selten über schöne Strecken. Komoot wird zunehmend komplex und sozial ausgerichtet.
- **Idee:** Nutzer geben einen Wunsch an (Dauer, Anstrengung, gewünschte Stopps) und bekommen drei schöne Rundtouren vorgeschlagen. Sie wählen eine aus und fahren los.
- **Art des Produkts:** Ein Test mit einigen Bekannten, noch kein skalierbares Produkt.
- **Vorlage:** Mockup mit vier Screens (Start, Vorschläge, Tourdetail, Navigation).

Der Test prüft drei Fragen gleichzeitig:

1. **Schönheit:** Finden die Tester die vorgeschlagenen Touren schöner als ihre bisherigen Strecken?
2. **Bedienung:** Kommen sie ohne Hilfe vom Wunsch bis zum Losfahren?
3. **Navigation:** Funktioniert das Führen unterwegs, und hält der Handy-Akku durch?

## 2. Zielgruppe und Testpersonen

5 bis 10 Bekannte ab etwa 50 Jahren, überwiegend E-Bike-Fahrer.

- **Geräte:** überwiegend Android-Handys.
- **Region:** Niederrhein rund um Duisburg (Rhein, Seen, Wald, Knotenpunktnetz NRW).
- **Erfahrung:** noch offen.

## 3. Umfang des Tests

Web-App für Handy und PC, ohne Konto, beschränkt auf Niederrhein/Duisburg.

| Im Test enthalten | Bewusst nicht im Test |
| --- | --- |
| Touren vorschlagen lassen (Rundtour oder mit Ziel, auch per Sprache) | Benutzerkonto und Anmeldung |
| Vorschläge anpassen und Touren selbst zusammenklicken | App-Store-App (Android/iOS) |
| Tourdetail mit Stopps und Höhenprofil | Social-Funktionen, Kommentare, Fotos anderer Nutzer |
| Navigation mit Sprachansagen | Routing außerhalb der Testregion |
| Export für E-Bike-Display und Garmin | Bezahlfunktionen |
| Touren merken (auf dem Gerät) | Abgleich zwischen PC und Handy über ein Konto |
| Tour per Link weitergeben | |
| Akku-Reichweite | |

Ohne Konto gibt es keinen Abgleich zwischen Geräten. Eine am PC geplante Tour kommt per Link aufs Handy.

## 4. Funktionale Anforderungen

Alle Anforderungen gehören in die erste Testversion.

| Nr. | Bereich | Anforderung |
| --- | --- | --- |
| F1 | Startpunkt | Start am aktuellen Standort; alternativ Adresse oder Ort eingeben |
| F2 | Tourwunsch | Umfang (wahlweise Dauer: 1 Std. / 2 Std. / halber Tag, oder Länge in km), Anstrengung (gemütlich / sportlicher, nur bei Rundtouren), Landschaft (Grün, Wasser, Wald, Aussicht) |
| F3 | Tourart | Rundtour oder Tour zu einem Ziel. Ziel = Art von Ort („irgendein Biergarten unterwegs“) oder bestimmter Ort („Biergarten am See“). Bei Zieltouren: Rückweg auf anderem Weg oder nur Hinweg |
| F4 | Vorschläge | Automatisch berechnet und nach Schönheit gewichtet (Wasser, Wald, ruhige Wege, guter Belag, wenig Autoverkehr). Zieltouren: bis zu fünf Wege mit klarer Rolle („Unsere Empfehlung“ bzw. „Am schönsten“, „Fast direkt“, „Direkt“), der direkte Weg ist immer dabei; weitere nur, wenn sie sich lohnen. Rundtouren: drei |
| F5 | Wunsch in eigenen Worten | Freitextfeld, auch per Spracheingabe der Handy-Tastatur, z. B. „20 km durchs Grüne zum Biergarten“. App erkennt Länge, Dauer, Landschaft und Ziel und füllt die Auswahl vor; Knöpfe bleiben der Hauptweg |
| F6 | Tour anpassen | Jeder Vorschlag lässt sich ändern: kürzer / länger, Stopp hinzufügen (Café, Biergarten, Toilette …), Abschnitt meiden, Start oder Ziel ändern; am PC zusätzlich Strecke auf der Karte verschieben. Rückgängig jederzeit möglich |
| F7 | Schönere Strecke vorschlagen | App findet selbst unschöne Abschnitte (z. B. neben Hauptstraßen) und zeigt eine grüne, gestrichelte Umfahrung auf der Karte mit Schild „Durchs Grüne · +1,8 km“. Darunter in Worten: bisher / neu, Mehrweg in km und Minuten. Übernehmen mit einem Tipp, „Nein, danke“, rückgängig jederzeit. Höchstens 2–3 Vorschläge pro Tour, nur beim Planen, nie während der Fahrt |
| F8 | Tourdetail | Karte, Länge, Fahrzeit (mit Zuschlag für Steigungen), Steigung in Worten, Pluspunkte und Hinweise aus der Strecke, Höhenprofil (nur wenn nicht flach), „Einkehren unterwegs“ |
| F9 | Stopps | Cafés, Eis und Biergärten, Toiletten, Aussichtspunkte, Bänke und E-Bike-Ladepunkte entlang der Tour. Im Tourdetail stehen nur höchstens drei Orte zum Einkehren oder Schauen; Toiletten in einem Satz; Bänke sieht man unterwegs |
| F10 | Navigation | Große Abbiegeanzeige, deutsche Sprachansagen mit Signalton, Hinweis beim Verlassen der Route |
| F11 | Offline | Karte und Strecke der gewählten Tour vor dem Losfahren laden; Navigation läuft auch im Funkloch |
| F12 | Export | Tour als GPX-Datei für E-Bike-Display und Garmin |
| F13 | Akku | Einschätzung, ob der E-Bike-Akku reicht („reicht locker“ / „knapp“ / „voll laden“), auf Basis von Akkugröße und Ladestand |
| F14 | Merken | Touren auf dem Gerät speichern und erneut starten |
| F15 | Weitergeben | Tour als Link teilen; der Link öffnet die Tour ohne Konto |
| F16 | Selbst planen | Punkte auf der Karte setzen; die App verbindet sie über schöne Wege; am PC und am Handy bedienbar |

**Entscheidungen während der Umsetzung (Jan):**
- 03.10.2026: Schwerpunkt Zieltour („Ziel eingeben → schönster Weg dorthin“), Rundtouren sind Nebensache.
- 04.10.2026: Bei Zieltouren keine Fragen nach Anstrengung und Umweg – Länge, Fahrzeit und Steigung zeigen die Vorschläge. Gerechnet wird gemütlich (15 km/h plus Zuschlag für Steigungen).
- 04.10.2026: Tourdetail nach Jans Entwurf (Kacheln, Pluspunkte, „Tour starten“, „Tour anpassen“, „Als GPX-Datei speichern“, Einkehr-Karten mit Zeichnungen statt Fotos).
- 04.10.2026: Logik nie auf die Testregion zuschneiden – alles aus den Daten der jeweiligen Strecke ableiten.
- 05.10.2026: Reihenfolge: Navigation (F10) vor Anpassen (F6/F16), damit Testpersonen die Touren direkt in der App fahren können. GPX-Export (F12) ist vorgezogen und fertig.
- 05.10.2026: Navigation mit eigener ruhiger Karte (dunkel, auf Wunsch „Heller“), die sich mit der Fahrtrichtung dreht; Vollbild; Ansagen mit Signalton. Weil die Wegberechnung bis M9 nur am PC läuft, kommen Touren per Link aufs Handy („Aufs Handy schicken“, vorgezogen aus F15).

F5 kommt ohne kostenpflichtige KI aus: Eine einfache Worterkennung reicht für typische Sätze (Zahl + „km“ oder „Stunden“, „Grün“, „Wasser“, „Biergarten“). Was sie nicht versteht, fragt die App über die Knöpfe nach.

## 5. Bedienung und Barrierearmut

Maßstab: Die Testperson kommt beim ersten Versuch allein vom Wunsch bis zum Losfahren.

| Nr. | Anforderung |
| --- | --- |
| B1 | Fließtext mindestens 17 px, Überschriften ab 28 px; gut lesbare Schrift (Atkinson Hyperlegible) |
| B2 | Alle Tasten mindestens 48 × 48 px, ausreichend Abstand |
| B3 | Kontrast mindestens 4,5 : 1 (WCAG AA), in der Sonne ablesbar |
| B4 | Höchstens drei Hauptaktionen pro Screen, eine hervorgehoben |
| B5 | Anrede „Sie“, keine Fachbegriffe |
| B6 | Jeder Screen hat einen sichtbaren Zurück-Weg |
| B7 | Funktioniert bei vergrößerter Systemschrift |
| B8 | Navigationsansicht dunkel, große Abbiegeanzeige, lesbar aus Lenkerentfernung |
| B9 | Am PC dieselbe Bedienung, nur mit größerer Karte |

Mockup-Screens:
1. **Start:** „Wohin möchten Sie?“ – Ziel, Startpunkt, „Und zurück?“, Knopf „Schönsten Weg finden“; daneben „Kein bestimmtes Ziel?“ zur Rundtour (Dauer oder km, Anstrengung, Landschaft), später Feld „Oder sagen Sie es in eigenen Worten“; unten Leiste „Tour finden / Meine Touren / Selbst planen“.
2. **Vorschläge:** „4 Wege nach Kempen“; Karte bleibt oben stehen und zeigt den Weg, bei dem man in der Liste ist (mit Fahrtrichtungspfeilen), darunter Knöpfe „Weg: 1 2 3 …“; Wegkarten mit Rolle, Name, km/Dauer/Steigung, ein Satz zum Besonderen, Mehrweg.
3. **Tourdetail:** Karte mit Stopps, Titel, Beschreibungssatz, Kacheln Strecke / Fahrzeit / Steigungen, grüner Kasten mit Pluspunkten und Hinweisen, „Tour starten“, „Tour anpassen“, „Als GPX-Datei speichern“, „Einkehren unterwegs“; oben Herz (Merken) und Menü „…“ (Teilen).
4. **Schönere Strecke:** Karte mit bisheriger Strecke (orange, an der Hauptstraße) und grün gestrichelter, leicht leuchtender Umfahrung mit Schild „Durchs Grüne · +1,8 km“; unten Karte „Schönere Strecke gefunden“ mit Bisher/Neu, „Nein, danke“ und „Übernehmen“.
5. **Navigation:** schwarzer Hintergrund, große Abbiegeanweisung oben, Karte, Rest-km, Ankunftszeit, nächster Stopp, „Pause“ / „Beenden“.

## 6. Technische Rahmenbedingungen

Betriebskosten möglichst 0 € im Monat; nur offene Daten und kostenlose Dienste.

| Thema | Vorgabe | Vorschlag |
| --- | --- | --- |
| Plattform | Web-App für Handy und PC, auf Android installierbar | PWA (SvelteKit) |
| Karte | Kostenlos, ohne Google | MapLibre GL + OpenFreeMap |
| Routing | Rundtouren mit Gewichtung für Schönheit | GraphHopper (Open Source), Profil „Genuss-Radeln“ |
| Server | Kostenlos betreibbar | z. B. Oracle Cloud Always Free; Konditionen prüfen |
| Kartendaten | Offen und aktuell | OSM-Auszug der Region (Geofabrik) |
| Stopps, Landschaft, Namen | Cafés, Toiletten, Aussicht, Bänke, Ladepunkte; Wasser/Wald/Grün/Felder | Aus dem OSM-Auszug der Region erzeugt (`npm run data`), als Dateien mitgeliefert |
| Offline | Tour läuft im Funkloch | Service Worker speichert Karte und Strecke |
| Strom sparen | Navigation darf das Handy nicht leeren | Dunkle Ansicht, gedrosselte Standortabfrage, Wachhalten nur während der Fahrt |
| Sprachansagen | Deutsch, mit Signalton | Web Speech API |
| Speicherung | Kein Konto | Nur auf dem Gerät; geteilte Touren im Link |
| Hosting | Kostenlos | GitHub Pages / Cloudflare Pages |
| Entwicklung | Ohne Entwicklerteam | Claude Code |

**Datenschutz:** Ohne Konto und Nutzungsdaten verlässt der Standort das Handy nur für die Routenberechnung. Impressum und Datenschutzhinweis sind trotzdem nötig.

**Bekannte Grenze:** Eine Web-App navigiert nur bei eingeschaltetem Bildschirm zuverlässig. Für lange Touren bleibt der GPX-Export die akkuschonende Alternative.

## 7. Testablauf und Erfolgskriterien

6 bis 8 Wochen ab Fertigstellung, mindestens 3 Touren pro Person, Rückmeldung über Fragebogen und Gespräch.

1. **Start:** Link und Kurzanleitung auf einer Seite, keine Einweisung.
2. **Fahrphase:** mindestens 3 Touren, davon mindestens eine mit Navigation in der App.
3. **Zwischenstand:** kurzer Anruf nach etwa 3 Wochen.
4. **Abschluss:** Fragebogen und Gespräch (ca. 20 Minuten).

| Kriterium | Gilt als erfüllt, wenn |
| --- | --- |
| Touren gelten als schöner | Mehr als die Hälfte bewertet die Vorschläge schöner als bisherige Strecken |
| Bedienung ohne Hilfe | Mindestens 4 von 5 starten ihre erste Tour ohne Nachfrage |
| Tester wollen weitermachen | Mehr als die Hälfte würde die App weiter nutzen oder empfehlen |

## 8. Offene Fragen

- [ ] Erfolgskriterium für die Navigation festlegen
- [ ] Erfahrung der Testpersonen erfassen
- [ ] Welche Angaben können Tester zu ihrem E-Bike-Akku machen?
- [ ] Alle 16 Funktionen sind Muss – verlängert die Bauzeit deutlich
- [ ] Kostenloses Server-Kontingent prüfen
- [ ] Impressum und Datenschutzhinweis erstellen
