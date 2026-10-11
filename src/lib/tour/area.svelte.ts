/**
 * In welchem Bereich der App man gerade ist, wenn die Adresse es nicht verrät: Die Tour-Seite gehört zu dem Bereich, aus dem man kam –
 * „Meine Touren“, eine Zielplanung („ziel“), eine Rundenplanung („runde“) oder „start“ (z. B. geteilter Link). Die untere Leiste liest das,
 * damit immer der richtige Bereich markiert ist.
 */
export const area: { tab: 'start' | 'ziel' | 'runde' | 'meine-touren' | undefined } = $state({ tab: undefined });
