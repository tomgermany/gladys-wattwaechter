// -----------------------------------------------------------------------------
// The dashboard widget "Electricity meter".
//
// WHAT A WIDGET IS HERE
// A small card on the dashboard. This file builds its CONTENT; the Gladys core
// renders it. No HTML, no CSS, no script: the content is a declarative tree of
// components in a small vocabulary, and the core normalises, bounds and
// translates it. That is why the card looks right in dark mode, on a phone and
// on a wall tablet without us doing anything.
//
// THE HANDLERS ARE NOT HERE
// This file only builds content. Gladys asks for it through `onWidgetGet`, and
// that handler has to be registered in index.js under the manifest's widget key.
// Without it Gladys gets the SDK's default answer to an unhandled message — the
// literal words "not implemented" on the card — while every value beside it is
// correct. That happened once here, and the wiring is now where it belongs.
//
// WHY THE CARD LISTS NO UTILITY METER NUMBER
// The SunSpec Common Block's SN field (40052-40067) holds the MAC address, twelve
// hex characters; the manufacturer's register table says so plainly. The number
// of the electricity meter itself — the Zählpunktbezeichnung, something like
// "ISK 9525 094" — is in neither interface: the Common Block carries only
// manufacturer, model, firmware, MAC and device address, and the REST API has no
// meter endpoint. So the card shows the device ID it really has, under a label
// that says so, instead of a MAC address under a false name.
//
// THE BUDGET — why this file counts its components
// A card takes at most 8 components, and among them at most 4 BUTTONS, 6 value
// tiles, 2 texts and 1 status list. Anything past a cap is DROPPED, in content
// order, silently. So the four period buttons are exactly the budget: adding a
// fifth would simply never appear. The tiles below plus the status row and the
// four buttons come to seven of the eight.
//
// WHAT THE CARD SHOWS
//   - the current power as a big value tile, WITH the meter's own sign:
//     positive is consumption, negative is feed-in. That is what the user asked
//     for, and it is also what the meter means, so it is not rewritten here.
//   - the meter index beside it, so the running total is on the same card as the
//     live value. It is bound to the feature the integration already publishes,
//     so it follows the readings without a refresh being wired here.
//   - the device ID as a status row, so the card says which unit it is.
//   - four buttons for the period totals: today, last 7, last 30, last 365
//     days. The active one is highlighted.
//   - the period total as a further value tile, once a button has been pressed.
//     It is a computed value, not a device feature, so it comes from this file
//     and carries the date it was read for.
//
// WHY ONE TILE IS BOUND TO A FEATURE AND THE OTHER IS NOT
// A tile with `device_feature` carries the id of a published feature. Gladys
// reads that feature's own history and value, so the tile stays right by itself
// and needs nothing from here. A tile with `value` carries a number this file
// computed — the period total — because no feature holds it. Keeping the
// distinction explicit is what stops a stale number being shown as a live one.
//
// THE PERIOD TOTALS NEED THE REST API
// Modbus has no notion of "yesterday". Without a read token in the
// configuration, `api` is null, and the four buttons are left out rather than
// shown dead: a button that always fails is worse than no button.
//
// THE PERIOD IS PER WIDGET INSTANCE
// Which period is shown is part of the widget settings, so two copies of the
// card on two dashboards can show two different periods.
// -----------------------------------------------------------------------------

/** Widget key, as declared in the manifest `widgets` field. */
export const METER_WIDGET = 'meter';

/**
 * Action keys carried by the buttons. They are part of the widget contract: a
 * dashboard stores the content the integration sends, so renaming one leaves an
 * existing button doing nothing.
 */
export const ACTION = {
  PERIOD: 'period',
};

/** The four periods, in the order they appear on the card. */
export const PERIOD_KEYS = ['day', 'week', 'month', 'year'];

/**
 * @param {object} ctx
 * @param {object|null} ctx.state last readings
 * @param {object|null} ctx.device { name, serial, model, host }
 * @param {string|null} ctx.powerFeatureId external_id of the power feature
 * @param {string|null} ctx.indexFeatureId external_id of the meter index feature
 * @param {object} ctx.settings the widget instance settings
 * @param {object|null} ctx.period the last period total read for this widget
 * @param {boolean} ctx.apiEnabled true when a read token is configured
 * @param {Function} ctx.t labels, per language
 */
export function buildMeterContent({
  state,
  device,
  powerFeatureId,
  indexFeatureId,
  settings = {},
  period = null,
  apiEnabled = false,
  t = (key) => key,
}) {
  if (!state || !device) {
    return {
      ttl_seconds: 30,
      components: [{ type: 'text', body: t('notConnected') }],
    };
  }

  const components = [];

  // 1. The live value, as a tile bound to the device feature: it follows the
  //    published states, so nothing has to be refreshed here.
  if (powerFeatureId) {
    components.push({
      type: 'value',
      label: t('power'),
      icon: 'zap',
      device_feature: powerFeatureId,
      // The sign is the meter's: consumption is positive, feed-in negative.
      color: (state.power ?? 0) < 0 ? 'success' : 'neutral',
    });
  }

  // 2. The meter index, next to the live value and bound to its own feature.
  //
  // WHAT THIS IS, AND WHAT IT IS NOT
  // The running total the meter has counted up — the figure that appears on the
  // bill, not the consumption of any one period. It comes from register 40116
  // (OBIS 1.8.0) through the `consumption` feature, which is why this tile
  // references that feature rather than carrying a number of its own.
  //
  // WHY IT IS ONLY ADDED WHEN THE FEATURE EXISTS
  // A meter that does not report the counter gets no feature, and a tile
  // pointing at an id nobody publishes would render as an empty box. The check
  // is the same rule the device builder follows.
  if (indexFeatureId) {
    components.push({
      type: 'value',
      label: t('index'),
      icon: 'activity',
      device_feature: indexFeatureId,
      color: 'neutral',
    });
  }

  // 3. The period total, when one has been read. A computed value, so it is
  //    sent as a plain number with its unit and the day it belongs to.
  if (period) {
    components.push({
      type: 'value',
      label: t(`period_${period.period}`),
      icon: 'bar-chart-2',
      value: period.consumption ?? '–',
      unit: settings.unit === 'Wh' ? 'Wh' : 'kWh',
      color: 'info',
    });
  }

  // 4. Which device this is — the device ID, NOT the utility meter number.
  //    The SunSpec Common Block's SN field (40052-40067) holds the MAC address,
  //    twelve hex characters, and the manufacturer's own register table says so.
  //    The electricity meter number (the Zählpunktbezeichnung, something like
  //    "ISK 9525 094") is in neither Modbus nor the REST API: the Common Block
  //    carries only manufacturer, model, firmware, MAC and device address, and
  //    the API's endpoint list has no meter field at all. So the card shows the
  //    ID it actually has, under a label that says what it is.
  //    A status list rather than text, because a status row carries a label, an
  //    icon and a value without a second component.
  components.push({
    type: 'status',
    items: [
      {
        label: t('meterNumber'),
        icon: 'hash',
        value: device.serial || '–',
        color: 'neutral',
      },
    ],
  });

  // 5. The four period buttons, exactly the budget of the card. Only when the
  //    REST API is usable, see the note at the top.
  if (apiEnabled) {
    for (const key of PERIOD_KEYS) {
      components.push({
        type: 'button',
        label: t(`period_${key}`),
        icon: 'calendar',
        style: period?.period === key ? 'primary' : 'secondary',
        action: { key: ACTION.PERIOD, params: { period: key } },
      });
    }
  }

  return { ttl_seconds: 60, components };
}

/**
 * Run a tapped button.
 *
 * Returning the toast text is what puts a short confirmation on the card; the
 * period itself is remembered by the caller and reaches the next
 * `buildMeterContent` call through `period`.
 */
export async function runMeterAction({ actionKey, params, t = (key) => key }) {
  if (actionKey !== ACTION.PERIOD) throw new Error(`Unknown widget action: ${actionKey}`);
  const period = String(params?.period ?? '');
  if (!PERIOD_KEYS.includes(period)) throw new Error(`Unknown period: ${period}`);
  return t(`reading_${period}`);
}
