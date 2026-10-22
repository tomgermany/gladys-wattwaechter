// -----------------------------------------------------------------------------
// The words the integration shows at runtime, in the four languages of the
// manifest.
//
// WHY A FILE OF ITS OWN
// Texts come from two places, and they are not interchangeable:
//   - the MANIFEST carries the Configuration screen, the widget name, the scene
//     actions and the field labels. There, a text is a language map and Gladys
//     picks the language;
//   - the CODE builds the widget content and the scene outputs at runtime, and
//     that vocabulary has no language map: a label is a single string.
// So the runtime texts live here, and the caller passes the language it wants.
//
// WHICH LANGUAGE? The language of the Gladys interface is not sent to the
// integration, so there is no way to follow it automatically. These texts are
// German, which matches the manifest (German first) and the device itself, whose
// own answers are German. Everything Gladys renders from the manifest is
// translated properly; only the strings this file produces are fixed.
// -----------------------------------------------------------------------------

/** Feature keys, kept in one place so no file invents its own spelling. */
export const KEY = {
  POWER: 'power',
  CONSUMPTION: 'consumption',
  FEED_IN: 'feed_in',
};

const TEXT = {
  de: {
    notConnected: 'Kein Zugriff auf den WattWächter. Adresse in der Konfiguration prüfen.',
    needsToken: 'Für den Zeitraumwert wird das Lesetoken der REST-API gebraucht.',
    power: 'Leistung',
    meterNumber: 'Zählernummer',
    period_day: 'Heute',
    period_week: '7 Tage',
    period_month: '30 Tage',
    period_year: '365 Tage',
    reading_day: 'Tageswert wird gelesen …',
    reading_week: 'Wochenwert wird gelesen …',
    reading_month: 'Monatswert wird gelesen …',
    reading_year: 'Jahreswert wird gelesen …',
  },
  en: {
    notConnected: 'No access to the WattWächter. Check the address in the configuration.',
    needsToken: 'The period total needs the REST API read token.',
    power: 'Power',
    meterNumber: 'Meter number',
    period_day: 'Today',
    period_week: '7 days',
    period_month: '30 days',
    period_year: '365 days',
    reading_day: 'Reading the day total…',
    reading_week: 'Reading the week total…',
    reading_month: 'Reading the month total…',
    reading_year: 'Reading the year total…',
  },
  fr: {
    notConnected: 'Pas d’accès au WattWächter. Vérifiez l’adresse dans la configuration.',
    needsToken: 'Le total de la période nécessite le jeton de lecture de l’API REST.',
    power: 'Puissance',
    meterNumber: 'Numéro de compteur',
    period_day: "Aujourd'hui",
    period_week: '7 jours',
    period_month: '30 jours',
    period_year: '365 jours',
    reading_day: 'Lecture du total du jour…',
    reading_week: 'Lecture du total de la semaine…',
    reading_month: 'Lecture du total du mois…',
    reading_year: "Lecture du total de l'année…",
  },
  es: {
    notConnected: 'Sin acceso al WattWächter. Comprueba la dirección en la configuración.',
    needsToken: 'El total del periodo necesita el token de lectura de la API REST.',
    power: 'Potencia',
    meterNumber: 'Número de contador',
    period_day: 'Hoy',
    period_week: '7 días',
    period_month: '30 días',
    period_year: '365 días',
    reading_day: 'Leyendo el total del día…',
    reading_week: 'Leyendo el total de la semana…',
    reading_month: 'Leyendo el total del mes…',
    reading_year: 'Leyendo el total del año…',
  },
};

/** The language used for the runtime texts. */
export const LANGUAGE = 'de';

/**
 * Look a text up.
 *
 * An unknown key returns the key itself rather than throwing: a missing word
 * should never be the reason a dashboard stays empty.
 */
export function t(key, language = LANGUAGE) {
  return TEXT[language]?.[key] ?? TEXT[LANGUAGE][key] ?? key;
}
