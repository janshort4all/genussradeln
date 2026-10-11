/**
 * In welchem Bereich der App man gerade ist, wenn die Adresse es nicht verrät: Die Tour-Seite gehört zu „Meine Touren“, wenn man von dort
 * kam (sonst zur Planung auf der Startseite). Die untere Leiste liest das, damit immer der richtige Bereich markiert ist.
 */
export const area: { tab: 'meine-touren' | undefined } = $state({ tab: undefined });
