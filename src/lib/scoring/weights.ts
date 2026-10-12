/**
 * Alle Stellschrauben für „schön“ an einem Ort – nach Testfahrten hier nachjustieren.
 * Anteile sind immer 0..1 bezogen auf die Streckenlänge.
 */

/** Reisegeschwindigkeit für die Dauer-Angabe (E-Bike, inkl. kurzer Stopps an Ampeln) */
export const SPEED_KMH = { easy: 15, sporty: 19 } as const;

/**
 * Zuschlag für Bergauf-Stücke (Minuten je 100 Höhenmeter): Mit E-Bike-Unterstützung deutlich weniger als
 * beim normalen Rad (dort ca. 10). Startwerte – nach Testfahrten im Hügelland justieren.
 */
export const CLIMB_MINUTES_PER_100M = { easy: 6, sporty: 4 } as const;

/** Punkte für die Nachbewertung eines Wegs */
export const SCORE = {
	/** Anteil am Wasser (Fluss, See, Kanal in ca. 100–150 m Nähe) */
	water: 1.0,
	/** Anteil durch/am Wald */
	forest: 0.8,
	/** Anteil durch Parks, Wiesen, Naturschutzgebiete */
	green: 0.6,
	/** Anteil durch Felder / offene Landschaft (schön, aber weniger als Wald und Wasser) */
	fields: 0.35,
	/**
	 * Zusatzpunkte für den Anteil, der MITTEN durch Wald oder Grünes (Park, Wiese, Heide) führt (Wunsch Jan,
	 * 10.10.2026: durch Wälder und Parks fahren, nicht nur daneben entlang). Kommt zu forest/green dazu.
	 */
	through: 0.8,
	/**
	 * Zusatzpunkte für den Anteil direkt am Wasser (Ufer höchstens ca. 100 m entfernt). Große Gewässer zählen sonst
	 * bis 400 m Abstand („Rhein vom Deich“) – dann sähen die Straße 300 m neben einem See und der Uferweg gleich
	 * aus (Wunsch Jan, 10.10.2026: Elfrather See). Kommt zu water dazu.
	 */
	shore: 0.6,
	/** Anteil auf ausgeschilderten Radnetzen (Knotenpunktnetz) */
	network: 0.4,
	/** Anteil auf Radwegen, Wirtschaftswegen, Spielstraßen */
	quiet: 0.5,
	/** Abzug: Anteil auf großen Straßen (Bundes-, Landes-, Kreisstraßen) */
	major: 1.5,
	/**
	 * Abzug: Anteil auf größeren Nebenstraßen – Kreisstraßen und Straßen mit Tempo über 30 (Wunsch Jan, 10.10.2026:
	 * „alles über 30 km/h ist meistens schon eine größere Straße, die wir möglichst meiden wollen“)
	 */
	busy: 1.2,
	/**
	 * Abzug: Anteil auf Radwegen direkt neben großen Straßen (Lärm, Abgase – fast so schlecht wie auf der Straße);
	 * abgestuft nach ROADSIDE
	 */
	roadside: 1.2,
	/** Abzug: Anteil auf wirklich schlechtem Belag (Wiese, Sand, Kopfsteinpflaster – Schotter zählt nicht) */
	badSurface: 1.0,
	/** Abzug: Anteil des Rückwegs, der auf dem Hinweg liegt („auf anderem Weg zurück“) */
	returnOverlap: 1.2
} as const;

/**
 * Suche nach schönen Hilfspunkten: Stellen mitten im Wald bzw. Grünen (Tiefe 0..1, siehe Landscape.woodDepthAtCell)
 * bekommen diesen Zuschlag auf die Schönheit der Umgebung – dann führen die Umwege hinein statt daran vorbei.
 */
export const VIA_WOODLAND_BONUS = 0.25;

/**
 * Radweg neben großer Straße, abgestuft (Wunsch Jan, 06.10.2026): mit Wald oder Wasser direkt am Weg nur ein
 * Drittel des Abzugs (Naherholungsgebiet an der Autobahn schlägt die Fahrt durch die Stadt), neben Autobahnen und
 * Kraftfahrstraßen etwas mehr als neben Bundes- und Landesstraßen.
 */
export const ROADSIDE = { greenFactor: 0.35, motorwayFactor: 1.3 } as const;

/**
 * Spielraum für Umwege. Gefragt wird nicht mehr (Entscheidung Jan, 04.10.2026): Die Vorschläge reichen
 * immer vom direkten bis zum schönsten Weg, jeder mit klarer Rolle („Direkt“, „Fast direkt“, „Am schönsten“).
 */
export const DETOUR = {
	/** höchstens so viel länger als der direkte genuss-Weg (Anteil) … */
	maxExtraRatio: 1.0,
	/** … mindestens aber so viele km Spielraum (bei kurzen Wegen) */
	minExtraKm: 3,
	/** GraphHopper-Alternativen: max. Gewichtsfaktor gegenüber dem besten Weg */
	alternativeFactor: 1.9,
	/** Anzahl Umwege über schöne Zwischenpunkte */
	scenicVias: 8,
	/** Abzug je 100 % Mehrweg bei der Suche nach dem schönsten Weg */
	detourPenalty: 0.2,
	/** strenger Abzug je 100 % Mehrweg für „Fast direkt“ */
	compactPenalty: 1.5
} as const;

/** Landschaft: Umkreis in Zellen (1 Zelle ≈ 100 m), in dem Wasser/Wald/Grün „am Weg“ zählen */
export const SURROUNDINGS_RADIUS_CELLS = 1;

/**
 * Große Gewässer (Rhein, Seen) zählen auch aus größerer Entfernung – vom Deich sieht man den Fluss hinter den
 * Rheinwiesen: im Umkreis von radiusCells (4 ≈ 400 m) mindestens minCells Wasserzellen (ein Teich reicht nicht).
 */
export const BIG_WATER = { radiusCells: 4, minCells: 8 } as const;

/** Titel aus Namen (naming/title.ts): „Am Rhein entlang über Meerbusch“ */
export const NAMING = {
	/** benanntes Gewässer zählt bis zu diesem Abstand (Flussmitte liegt weit hinter dem Ufer) */
	waterRadiusM: 700,
	/** Wald/Park bzw. ohne Landschaftskarte: Name zählt bis zu diesem Abstand */
	nearRadiusM: 400,
	/** ein Abschnitt gehört zum nächstgelegenen Ort in diesem Umkreis */
	placeRadiusM: 2500,
	/** Wald/Park im Titel nur an Stellen, die mindestens so tief drin liegen (0..1, Rand ≈ 0,25) */
	minWoodDepth: 0.2,
	/** Höhepunkt nur, wenn so viel vom Weg daran vorbeiführt */
	minLandmarkShare: 0.15,
	/** Fluss „entlang“ im Titel erst ab diesem Anteil, darunter „Nahe am Rhein“ (Jan, 11.10.2026) */
	alongShare: 0.4,
	/** Ort im Titel nur, wenn so viel vom Weg dort verläuft */
	minPlaceM: 1000
} as const;

/** Ein Weg wird nur nach einer Landschaft benannt, die mindestens diesen Anteil der stärksten erreicht */
export const TITLE_MIN_SHARE_OF_TOP = 0.85;

/** „Am Wasser entlang“ bei der feinen Karte: Wasser höchstens so viele Zellen (≈ 21 m) entfernt – Seerundwege liegen oft 100–150 m vom Ufer (Grünstreifen dazwischen) */
export const SHORE_CELLS_FINE = 6;

/** Abstand der Prüfpunkte entlang eines Wegs in Metern */
export const SAMPLE_STEP_M = 50;

/** Gewichte für die Suche nach schönen Zwischenpunkten: [Felder, Grün, Wald, Wasser] */
export const BEAUTY_CLASS_WEIGHTS: [number, number, number, number] = [0.3, 0.6, 0.8, 1.0];

/** Suche nach schönen Zwischenpunkten für Umwege */
export const VIA_SEARCH = {
	/** Abstand der geprüften Kandidaten in Zellen (5 ≈ 500 m) */
	gridStepCells: 5,
	/** Umgebung, deren Schönheit gemessen wird (±5 Zellen ≈ 1 × 1 km) */
	windowRadiusCells: 5,
	/** Mindest-Schönheit der Umgebung (0..1) */
	minBeauty: 0.2,
	/** Mindestabstand zwischen zwei Zwischenpunkten */
	minSpacingM: 1500,
	/**
	 * Mindestabstand zu Start und Ziel (Meter). Früher 15 % der Luftlinie (2,6 km bei 17 km) – dann kam ein Park
	 * direkt hinter der Startstraße nie infrage (Wunsch Jan, 10.10.2026: durch den Moerser Park aus der Stadt).
	 */
	minFromEndsM: 600,
	/**
	 * Zwischenpunkte nur „zwischen“ Start und Ziel: Lage entlang der Luftlinie als Anteil (0 = Start, 1 = Ziel).
	 * Verhindert Wege, die erst über das Ziel hinaus (oder hinter den Start) fahren und dann zurückkommen.
	 */
	alongRange: [0.03, 0.97] as [number, number],
	/** Die Hilfspunkte verteilen sich auf so viele Abschnitte zwischen Start und Ziel (Anfang, Mitte, Ende …) */
	bins: 3,
	/** Mindestabstand zum direkten Weg (sonst bringt der Umweg nichts) */
	minFromDirectM: 250,
	/** Gewässer-Ufer als Hilfspunkte: höchstens so viele, nur Gewässer ab so vielen Zellen (≈ 1 ha je Zelle) */
	shoreVias: 4,
	minWaterCells: 12,
	/** Umweg-Schätzung: Straßenweg ≈ Luftlinie × Faktor */
	roadFactor: 1.25,
	/**
	 * Wege über einen Zwischenpunkt, die mehr als so viele Meter hin und gleich wieder zurück fahren
	 * („Stummel“ in eine Sackgasse oder „Lasso“-Schleife um den Punkt), werden verworfen. Normales Kreuzen
	 * des eigenen Wegs ergibt nur 20–40 m …
	 */
	maxBacktrackM: 50,
	/** so nah an Start und Ziel wird nicht auf Stummel/Kreis/Zipfel geprüft (dort muss man manchmal wenden) */
	endpointFreeM: 500,
	/** … dafür werden so viele Zwischenpunkte zusätzlich ausprobiert */
	spareVias: 0,
	/**
	 * Brücken und Fähren ab dieser Länge (Meter) gelten als Querung eines großen Flusses o. Ä. Ein Vorschlag darf
	 * nicht mehr davon nehmen als der direkte Weg – sonst führt ein schöner Zwischenpunkt auf der anderen Flussseite
	 * zu einem riesigen Umweg über zwei Brücken (gefunden: Krefeld → Moers über die Uerdinger Rheinbrücke).
	 */
	longCrossingM: 300
} as const;

/**
 * „Fast direkt“: Bei „etwas schöner“ / „am schönsten“ kommt zusätzlich der schönste Weg dazu, der kaum länger
 * ist als der kürzeste – für alle, die zügig, aber nicht an Hauptstraßen oder durchs Industriegebiet fahren wollen.
 */
export const COMPACT = {
	/** höchstens so viel länger als der direkte genuss-Weg (Anteil) … */
	maxExtraRatio: 0.15,
	/** … mindestens aber so viele km Spielraum */
	minExtraKm: 1,
	/**
	 * Zusätzliche Kandidaten knapp neben der Luftlinie: Zwischenpunkte bei diesen Anteilen der Strecke,
	 * seitlich um diesen Anteil der Luftlinie versetzt (links und rechts).
	 */
	sideViaAlong: [0.35, 0.65],
	sideViaOffsetRatio: 0.12
} as const;

/**
 * Einem Bach oder Fluss folgen (Wunsch Jan, 10.10.2026): Abschnitte benannter Gewässer ab minStretchM Länge, die im
 * erlaubten Umweg liegen; der Weg bleibt im Streifen (halfWidthM zu jeder Seite), alles außerhalb zählt für GraphHopper nur
 * mit outsideFactor. Höchstens `count` Abschnitte, nicht näher als minSpacingM beieinander.
 */
export const STREAMS = {
	minStretchM: 1500,
	/** längere Abschnitte werden auf das Stück mit dem kleinsten Umweg gekürzt */
	maxStretchM: 5000,
	stepM: 100,
	corridorStepM: 400,
	halfWidthM: 400,
	/** stark: Der Bogen eines Bachs ist länger als die Straße daneben; bei 0,5 wählt GraphHopper die kürzere Straße (getestet) */
	outsideFactor: 0.12,
	count: 3,
	minSpacingM: 1500,
	/** Anteil des Abschnitts, der mindestens minFromDirectM von der direkten Strecke entfernt liegen muss (sonst folgt sie ihm schon) */
	minFromDirectM: 100,
	minAwayShare: 0.5,
	/** Abstand zu Start und Ziel, ab dem ein Abschnitt zählt */
	minFromEndsM: 300,
	/** Umweg-Schätzung wie VIA_SEARCH.roadFactor */
	roadFactor: 1.25,
	/** Touren über zwei Abschnitte nacheinander: so viele Kombinationen, so viel länger als sonst erlaubt */
	combos: 2,
	comboLengthFactor: 1.3
} as const;

/**
 * Angebot aus kurzer, mittellanger und langer Tour (Wunsch Jan, 10.10.2026): Die lange ist mindestens longMinRatio ×
 * so lang wie die kurze (der direkte Weg), die mittlere liegt mindestens `gap` über der kurzen und unter der langen.
 */
export const TIERS = { longMinRatio: 1.15, mediumMinRatio: 1.06, gap: 0.06 } as const;

/**
 * Echte Alternativen (Wunsch Jan, 10.10.2026: mehr verschiedene Vorschläge): Zu den besten bekannten Wegen wird ein Weg
 * berechnet, der deren Korridor meidet (Streifen halfWidthM breit, Abstand spacingM, Anfang und Ende bleiben frei).
 * Wege im Streifen zählen für GraphHopper nur noch mit factor.
 */
export const ALTERNATIVES = { count: 2, halfWidthM: 250, spacingM: 900, freeEndsM: 1000, factor: 0.3 } as const;

/**
 * Umweg als Korridor (statt festem Punkt): Band Start → schöne Stelle → Ziel mit halfWidthM Metern zu jeder Seite;
 * Wege außerhalb zählen für GraphHopper um outsideFactor weniger (0,15 = deutlich unattraktiver).
 */
export const CORRIDOR = { halfWidthM: 600, outsideFactor: 0.15 } as const;

/**
 * Wege über zwei schöne Stellen nacheinander: Paare aus den fromBest schönsten Einzel-Umwegen
 * (5 → höchstens 10 zusätzliche Anfragen je Richtung), die Punkte mindestens minApartM auseinander.
 */
export const VIA_PAIRS = { fromBest: 4, minApartM: 1000 } as const;

/** Vorschläge dürfen sich höchstens so stark überdecken (Anteil gemeinsamer Strecke) */
export const DIVERSITY_MAX_OVERLAP = 0.6;

/** So viele Wege werden höchstens vorgeschlagen (der direkte ist immer dabei) */
export const MAX_SUGGESTIONS = 5;

/** So viele Vorschläge sollen es möglichst sein (wenn es genug deutlich verschiedene, schöne Wege gibt) */
export const TARGET_SUGGESTIONS = 3;

/**
 * Rundtouren (round.ts): so viele Richtungen werden probiert, so weit darf die Länge vom Wunsch abweichen
 * (Wunsch Jan, 06.10.2026: 10 %), so viele Runden werden gezeigt.
 */
export const ROUND = {
	directions: 10,
	/** mit Landschaftswunsch mehr Richtungen probieren (mehr Auswahl für den Wunsch) */
	wishDirections: 16,
	tolerance: 0.1,
	suggestions: 5,
	/** Kreisumfang × Faktor ≈ Länge auf Straßen (Startwert, wird nachgeregelt) */
	roadFactor: 1.3,
	/** so oft wird der Kreis vergrößert/verkleinert, bis die Länge passt */
	lengthAttempts: 4,
	/** so oft wird ein Hilfspunkt mit Stummel/Kreis/Zipfel verlegt */
	repairs: 2,
	/** Hilfspunkte rücken bis zu diesem Anteil des Kreisradius an schönere Stellen */
	scenicReach: 0.35,
	/** höchstens dieser Anteil der zweiten Hälfte darf auf der ersten liegen (nicht denselben Weg zurück) */
	maxSelfOverlap: 0.3,
	/** zwei Runden sind „gleich“, wenn jede zu mehr als diesem Anteil auf der anderen liegt */
	maxSimilarity: 0.6,
	/** Wunsch „Worauf haben Sie Lust?“: Zusatzpunkte für den Anteil der Strecke, der zum Wunsch passt */
	wishBonus: 0.8,
	/** „Am Wasser“: Hilfspunkte werden bis zu diesem Anteil des Kreisradius ans Ufer gezogen */
	shoreReach: 1.1,
	/** Uferstreifen (nur „Am Wasser“): halbe Breite, Faktor für alles außerhalb, Abstand der Stützpunkte, höchste Zahl Streifen */
	shoreBand: { enabled: false, halfWidthM: 400, outsideFactor: 0.25, stepM: 600, maxRings: 45 },
	/**
	 * „Am Wasser“: Hilfspunkte am Ufer eines Flusses (Verlauf aus streams.json). Lange Flüsse (Rhein) gehen vor kurzen
	 * Bächen: Zuschlag bis `longRiverBonusM` Meter Abstand für Flüsse ab `longRiverM` Länge; der Punkt liegt `bankM` Meter
	 * von der Flussmitte entfernt auf der Seite des gewünschten Punkts (dort verlaufen die Uferwege).
	 */
	river: { minLengthM: 10000, longRiverM: 30000, longRiverBonusM: 2000, bankM: 260 },
	/**
	 * Mit Wunsch zeigt die App nur Runden, die ihn wirklich erfüllen (Jan, 11.10.2026): mindestens so viel Anteil der
	 * Strecke (absolut) und mindestens `relative` × der beste Anteil unter den Kandidaten. Lieber weniger Vorschläge.
	 */
	wishMin: { water: 0.25, forest: 0.35, fields: 0.55, relative: 0.8 }
} as const;

/**
 * Gewichte [Felder, Grün, Wald, Wasser] für die Suche nach schönen Stellen, je nach Wunsch „Worauf haben Sie Lust?“
 * (Runde-Seite). Ohne Wunsch gilt BEAUTY_CLASS_WEIGHTS.
 */
export const WISH_WEIGHTS: Record<'water' | 'forest' | 'fields', [number, number, number, number]> = {
	water: [0.05, 0.15, 0.2, 1.0],
	forest: [0.05, 0.4, 1.0, 0.3],
	fields: [1.0, 0.3, 0.1, 0.2]
};

/**
 * Der direkte Weg wird durch eine fast gleiche Variante ersetzt, wenn die höchstens maxExtraRatio länger und um mindestens
 * minGain Schönheitspunkte schöner ist (kleiner Abstecher durch Park oder ans Ufer statt der Straße).
 */
export const IMPROVE_DIRECT = { maxExtraRatio: 0.12, minGain: 0.04 } as const;

/**
 * „Durch statt vorbei“ (Wunsch Jan, 14.10.2026, Sechs-Seen-Platte: „egal ob Wald oder Seen – wenn es die Option gibt,
 * dadurch zu fahren, soll er das tun und nicht nur am Rand entlang“). Nach der Auswahl wird jeder Vorschlag alle `stepM`
 * Meter geprüft: Liegt `minOffsetM`…`maxOffsetM` daneben deutlich mehr Wald, Park oder Seeufer (Gewinn ≥ `minGain`,
 * siehe through.ts → insideness)? Abschnitte ab `minStretchM` werden mit einem Korridor durchs Innere (Streifen
 * ± `halfWidthM`, außen × `outsideFactor`) neu gerechnet und übernommen, wenn sie schöner sind (≥ `minBeautyGain`), höchstens
 * `maxExtraRatio` bzw. `maxExtraM` länger, ohne Stummel/Kreis/Zipfel und ohne auf dem Rest der Tour zu fahren.
 */
export const THROUGH = {
	stepM: 200,
	minOffsetM: 100,
	maxOffsetM: 900,
	offsetStepM: 50,
	/** je so viele Meter Abstand 1 Punkt weniger – nähere Wege gehen vor */
	distancePenaltyM: 3000,
	/** Zuschlag „direkt am Wasser“ (Wasser höchstens waterCells × 21 m entfernt) */
	waterBonus: 0.6,
	waterCells: 5,
	minGain: 0.5,
	minStretchM: 800,
	/** so weit von Start und Ziel bleibt die Strecke, wie sie ist */
	freeEndsM: 300,
	halfWidthM: 200,
	outsideFactor: 0.3,
	/** die bisherige Strecke (Streifen ± avoidHalfWidthM, ohne Anfang und Ende) zählt nur × avoidFactor */
	avoidHalfWidthM: 30,
	avoidFactor: 0.4,
	maxExtraRatio: 0.3,
	maxExtraM: 2000,
	/** Anteil des neuen Stücks, der auf dem Rest der Tour liegen darf */
	maxOverlap: 0.25,
	/** so viel Strecke vor und hinter dem neuen Stück wird mit auf Stummel/Kreis/Zipfel geprüft (Nahtstellen) */
	seamM: 600,
	/** Nahtstellen glätten: läuft das neue Stück bis zu seamReachM auf dem alten Weg zurück (Abstand < seamNearM), wird dort verbunden */
	seamReachM: 300,
	seamNearM: 15,
	minBeautyGain: 0.02,
	/** höchstens so viele Abschnitte je Weg, so viele Anfragen gleichzeitig */
	maxStretches: 3,
	parallel: 3
} as const;


/**
 * Spannende Umwege (Jan, 12.10.2026): Highlights in der Nähe der Tour, die nur wegen der Längenvorgabe nicht in der Tour
 * gelandet sind – in der großen Karte nach „Spannende Umwege suchen“.
 */
export const DETOURS = {
	/** so weit neben der Tour darf ein Highlight liegen (Meter) */
	reachM: 6000,
	/** näher als das gilt ein Punkt als „schon am Weg“; ab diesem Anteil am Weg ist das Highlight schon in der Tour */
	onRouteM: 500,
	maxOnRouteShare: 0.4,
	/** Punkte gleichen Namens gehören zusammen, wenn sie höchstens so weit auseinanderliegen (Punkte alle ≈ 400 m) */
	clusterLinkM: 1500,
	/** Mindestgröße abseits der Tour in Punkten (≈ 400 m je Punkt: Umfang bzw. Flusslänge) */
	minPoints: { lake: 3, river: 5, forest: 5, park: 5 },
	/** ab dieser Größe zählt ein Highlight voll (für die Reihenfolge) – Seen sind kleiner als Wälder und Flüsse */
	sizeCapPoints: { lake: 8, river: 20, forest: 20, park: 20 },
	/** so viele Highlights werden durchgerechnet, so viele höchstens angeboten, so weit liegen sie mindestens auseinander */
	candidates: 12,
	max: 6,
	minApartM: 1500,
	/** die Tour wird so weit vor/nach der nächsten Stelle verlassen: Faktor × Abstand des Highlights (mindestens minWindowM);
	 * klappt es nicht, wird der nächste Faktor probiert */
	windowFactors: [0.6, 1.0, 1.5],
	minWindowM: 1200,
	/** der Umweg muss mindestens so viel schöner sein als das wegfallende Stück (Punkte wie beautyScore) … */
	minGain: 0.05,
	/** … und darf höchstens so viel mehr Autoverkehr haben (Anteil), insgesamt höchstens maxTraffic */
	trafficSlack: 0.05,
	maxTraffic: 0.15,
	/** See/Fluss: liegen die beiden Uferpunkte näher als das, reicht einer */
	minShoreM: 600,
	/** Streifen um die Linie Tour → Highlight → Tour: halbe Breite, Faktor für alles außerhalb */
	corridorHalfWidthM: 600,
	outsideFactor: 0.35,
	/** ergeben die Hilfspunkte Zipfel: nur der Streifen, mit stärkerem Abzug außerhalb */
	corridorOnlyFactor: 0.15,
	/** Mehrweg: mindestens (sonst ist es kein Umweg, der lohnt), höchstens die Hälfte der Tour bzw. 20 km (Jan, 12.10.2026) */
	minExtraM: 3000,
	maxExtraRatio: 0.5,
	maxExtraM: 20000,
	/** der Weg muss so nah an das Highlight herankommen */
	reachHighlightM: 350,
	/** höchstens so viel (Anteil) des Umwegs auf dem Rest der Tour */
	maxOverlapWithRest: 0.3
} as const;

/** Beim Auffüllen auf TARGET_SUGGESTIONS darf ein Weg so viel weniger schön sein als der direkte (Schönheitspunkte) */
export const FILL_BEAUTY_MARGIN = 0.15;

/** „Hin und zurück als Runde“: so viele der besten Hin- und Rückwege werden zu Paaren kombiniert */
export const PAIR_CANDIDATES = 8;

/** … und sind untereinander verschieden: höchstens so viel gemeinsame Strecke (Anteil) */
export const PAIR_DIVERSITY = 0.7;

/** „Hin und zurück als Runde“: höchstens dieser Anteil des Rückwegs darf auf dem Hinweg liegen (außer beim direkten) */
export const ROUND_MAX_OVERLAP = 0.4;

/**
 * Ein weiterer Vorschlag kommt nur dazu, wenn er sich lohnt: Kein schon gezeigter Weg darf kürzer
 * (bis lengthTolerance länger zählt als „gleich lang“) und fast genauso schön sein (bis beautyMargin weniger).
 * Deshalb gibt es bei kurzen oder einfachen Strecken oft nur zwei oder drei Vorschläge.
 */
export const WORTHWHILE = { lengthTolerance: 0.02, beautyMargin: 0.03 } as const;

/**
 * Die Vorschläge heißen nach ihrer Länge („Längste Tour“ … „Kürzeste Tour“). Damit das etwas aussagt,
 * unterscheiden sich je zwei gezeigte Wege mindestens um ratio der Länge bzw. minM Meter.
 */
export const LENGTH_STEP = { ratio: 0.05, minM: 500 } as const;

/** Stopps unterwegs (F9): so weit dürfen sie neben dem Weg liegen (Meter) */
export const STOP_RADIUS_M = {
	cafe: 200,
	eis: 200,
	biergarten: 200,
	toilette: 150,
	aussicht: 150,
	laden: 150,
	rast: 100,
	bank: 50
} as const;

/** Bewertung von Stopps nach Merkmalen aus OpenStreetMap (keine Sterne – die gibt es dort nicht) */
export const STOP_SCORE = {
	/** Grundwert je Art */
	base: { cafe: 1, eis: 1, biergarten: 1.2, toilette: 1, aussicht: 1.2, laden: 1, rast: 0.8, bank: 0.5 },
	/** Sitzplätze draußen / Terrasse */
	outdoor: 1,
	/** Lage am Wasser */
	water: 1,
	/** Lage im Grünen oder am Wald */
	greenOrForest: 0.6,
	/** gepflegter Eintrag (Website bzw. Öffnungszeiten, je Merkmal) */
	wellMaintained: 0.3,
	wheelchair: 0.3,
	backrest: 0.5,
	covered: 0.3,
	/** Abzug je 100 m Entfernung vom Weg */
	offRoutePer100m: 0.4
} as const;

/** Stopps ausdünnen, damit die Liste übersichtlich bleibt */
export const STOP_LIMITS = {
	/** Stopps auf den ersten Metern weglassen */
	skipStartKm: 0.5,
	/** Cafés/Eis/Biergärten: bester je Abschnitt … */
	foodWindowKm: 2,
	/** … und insgesamt höchstens */
	foodMax: 6,
	toiletWindowKm: 3,
	viewMax: 5,
	chargingMax: 3,
	restWindowKm: 2,
	benchWindowKm: 3
} as const;

/** „Steigung in Worten“ aus dem geglätteten Höhenprofil (tour/elevation.ts) */
export const CLIMB_WORDS = {
	/** unter so vielen Höhenmetern bergauf je km: „flach“ … */
	flatBelowMPerKm: 4,
	/** … darunter „leicht hügelig“, sonst „hügelig“ */
	gentleBelowMPerKm: 10,
	/** ein einzelnes Stück mit so viel Prozent Steigung macht mindestens „leicht hügelig“ */
	steepGradePercent: 6
} as const;
