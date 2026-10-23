// -----------------------------------------------------------------------------
// The words the integration shows, in the four languages of the manifest.
//
// WHY A FILE OF ITS OWN
// Texts come from two places, and they are not interchangeable:
//   - the MANIFEST carries the Configuration screen, the widget name, the scene
//     actions and the field labels. There, a text is a language map and Gladys
//     picks the language;
//   - the CODE builds the widget content and the scene outputs at runtime, and
//     there is no language map in that vocabulary: a label is a single string.
// So the runtime texts live here, and the caller passes the language it wants.
//
// WHICH LANGUAGE? The language of the Gladys interface is not sent to the
// integration, so there is no way to follow it automatically. These texts are
// German, which matches the manifest (German first) and the device itself,
// whose own answers are German. Everything that Gladys renders from the manifest
// is translated properly; only the strings this file produces are fixed.
//
// meterNumber IS A DEVICE ID, NOT A UTILITY METER NUMBER
// The value shown under it is the SunSpec Common Block's SN field (40052-40067),
// which the manufacturer's register table documents as the MAC address, twelve
// hex characters. It is not the meter number of the electricity meter (the
// Zählpunktbezeichnung, something like "ISK 9525 094"). That number is in
// neither interface: the Common Block carries only manufacturer, model,
// firmware, MAC and device address, and the REST API's endpoint list has no
// meter field. The label therefore says what the value really is. Calling it a
// meter number was a mistake, and it showed a MAC address under a false name.
//
// index IS THE RUNNING TOTAL, NOT A PERIOD
// `index` labels the meter's cumulative counter — register 40116, OBIS 1.8.0,
// the figure that also appears on the bill. It sits next to `power` on the card
// and is deliberately not called "consumption": the four period buttons below it
// are also consumption, of a bounded stretch of time, and two labels that read
// the same would leave the user guessing which number is which.
//
// WHY THE KEYS ARE ADDED TO EVERY LANGUAGE AT ONCE
// `t()` falls back to the key itself when a translation is missing, so a text
// added in German only would show the literal word "index" to an English user.
// That happened here once: the widget asked for `index` before this entry
// existed, and the card would have shown the bare key.
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
    power: 'Leistung',
    index: 'Zählerstand',
    meterNumber: 'Geräte-ID',
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
    power: 'Power',
    index: 'Meter reading',
    meterNumber: 'Device ID',
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
    power: 'Puissance',
    index: 'Relevé du compteur',
    meterNumber: 'ID de l’appareil',
    period_day: "Aujourd'hui",
    period_week: '7 jours',
    period_month: '30 jours',
    period_year: '365 jours',
    reading_day: 'Lecture du total du jour…',
    reading_week: 'Lecture du total de la semaine…',
    reading_month: 'Lecture du total du mois…',
    reading_year: 'Lecture du total de l’année…',
  },
  es: {
    notConnected: 'Sin acceso al WattWächter. Comprueba la dirección en la configuración.',
    power: 'Potencia',
    index: 'Lectura del contador',
    meterNumber: 'ID del aparato',
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

/** The language every runtime text falls back to. */
export const LANGUAGE = 'de';

/**
 * Look a text up.
 *
 * An unknown key returns the key itself rather than throwing: a missing word
 * should never be the reason a dashboard stays empty. That fallback is also why
 * a new key belongs in all four languages at once — otherwise the key itself is
 * what the user reads.
 */
export function t(key, language = LANGUAGE) {
  return TEXT[language]?.[key] ?? TEXT[LANGUAGE][key] ?? key;
}
