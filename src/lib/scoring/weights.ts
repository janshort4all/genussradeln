/**
 * Alle Stellschrauben für „schön“ an einem Ort – nach Testfahrten hier nachjustieren.
 * Anteile sind immer 0..1 bezogen auf die Streckenlänge.
 */

/** Reisegeschwindigkeit für die Dauer-Angabe (E-Bike, inkl. kurzer Stopps an Ampeln) */
export const SPEED_KMH = { easy: 15, sporty: 19 } as const;

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
	/** Anteil auf ausgeschilderten Radnetzen (Knotenpunktnetz) */
	network: 0.4,
	/** Anteil auf Radwegen, Wirtschaftswegen, Spielstraßen */
	quiet: 0.5,
	/** Abzug: Anteil auf großen Straßen (Bundes-, Landes-, Kreisstraßen) */
	major: 1.5,
	/** Abzug: Anteil auf schlechtem Belag (Sand, Schotter, Kopfsteinpflaster …) */
	badSurface: 1.0,
	/** Abzug: Anteil des Rückwegs, der auf dem Hinweg liegt („auf anderem Weg zurück“) */
	returnOverlap: 1.2
} as const;

/** „Wie viel Umweg für mehr Schönheit?“ */
export const DETOUR = {
	direct: {
		/** höchstens so viel länger als der direkte genuss-Weg (Anteil) … */
		maxExtraRatio: 0.12,
		/** … mindestens aber so viele km Spielraum (bei kurzen Wegen) */
		minExtraKm: 0.5,
		/** GraphHopper-Alternativen: max. Gewichtsfaktor gegenüber dem besten Weg */
		alternativeFactor: 1.3,
		/** Anzahl Umwege über schöne Zwischenpunkte */
		scenicVias: 0,
		/** Abzug je 100 % Mehrweg in der Bewertung */
		detourPenalty: 1.5
	},
	nicer: {
		maxExtraRatio: 0.3,
		minExtraKm: 1.5,
		alternativeFactor: 1.5,
		scenicVias: 5,
		detourPenalty: 0.6
	},
	nicest: {
		maxExtraRatio: 0.6,
		minExtraKm: 3,
		alternativeFactor: 1.9,
		scenicVias: 8,
		detourPenalty: 0.2
	}
} as const;

export type DetourLevel = keyof typeof DETOUR;

/** Landschaft: Umkreis in Zellen (1 Zelle ≈ 100 m), in dem Wasser/Wald/Grün „am Weg“ zählen */
export const SURROUNDINGS_RADIUS_CELLS = 1;

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
	/** Mindestabstand zu Start und Ziel (Anteil der Luftlinie) */
	minFromEndsRatio: 0.15,
	/**
	 * Zwischenpunkte nur „zwischen“ Start und Ziel: Lage entlang der Luftlinie als Anteil (0 = Start, 1 = Ziel).
	 * Verhindert Wege, die erst über das Ziel hinaus (oder hinter den Start) fahren und dann zurückkommen.
	 */
	alongRange: [0.15, 0.85] as [number, number],
	/** Mindestabstand zum direkten Weg (sonst bringt der Umweg nichts) */
	minFromDirectM: 400,
	/** Umweg-Schätzung: Straßenweg ≈ Luftlinie × Faktor */
	roadFactor: 1.25,
	/**
	 * Wege über einen Zwischenpunkt, die mehr als so viele Meter hin und gleich wieder zurück fahren
	 * („Stummel“, z. B. Zwischenpunkt am Ende einer Sackgasse), werden verworfen …
	 */
	maxBacktrackM: 120,
	/** … dafür werden so viele Zwischenpunkte zusätzlich ausprobiert */
	spareVias: 3
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

/** Vorschläge dürfen sich höchstens so stark überdecken (Anteil gemeinsamer Strecke) */
export const DIVERSITY_MAX_OVERLAP = 0.6;

/** So viele Wege werden höchstens vorgeschlagen */
export const MAX_SUGGESTIONS = 3;

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
