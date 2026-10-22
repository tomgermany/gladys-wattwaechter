// -----------------------------------------------------------------------------
// The dashboard widget "Electricity meter".
//
// WHAT A WIDGET IS HERE
// A small card on the dashboard. This file builds its CONTENT; the Gladys core
// renders it. No HTML, no CSS and no script: the content is a declarative tree
// of components in a small vocabulary, and the core normalises, bounds and
// translates it. That is why the card looks right in dark mode, on a phone and
// on a wall tablet without us doing anything.
//
// THE BUDGET — why this file counts its components
// A card takes at most 8 components, and among them at most 4 BUTTONS, 6 value
// tiles, 2 texts and 1 status list. Anything past a cap is DROPPED, in content
// order, silently. So the four period buttons ARE the button budget: a fifth
// would simply never appear.
//
// WHAT THE CARD SHOWS
//   - the current power as a big value tile, WITH the meter's own sign:
//     positive is consumption, negative is feed-in. That is what was asked for,
//     and it is what the meter means, so it is not rewritten here.
//   - the meter number as a status row, so the card says which meter it is.
//   - four buttons for the period totals: today, last 7, last 30 and last 365
//     days. The active one is highlighted.
//   - the period total as a second value tile, once a button has been pressed.
//     It is a computed value, not a device feature, so it comes from this file.
//
// THE PERIOD TOTALS NEED THE REST API
// Modbus has no notion of "yesterday". Without a read token in the
// configuration the REST client is not built, and the four buttons are left out
// rather than shown dead: a button that always fails is worse than no button.
//
// THE PERIOD IS PER WIDGET INSTANCE
// Which period is shown is part of the widget settings, so two copies of the
// card on two dashboards can show two different periods.
// -----------------------------------------------------------------------------

import { t as translate } from './wattwaechter/labels.js';

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
 * @param {object} [ctx.settings] the widget instance settings
 * @param {object|null} [ctx.period] the last period total read for this widget
 * @param {boolean} [ctx.apiEnabled] true when a read token is configured
 */
export function buildMeterContent({
  state,
  device,
  powerFeatureId,
  settings = {},
  period = null,
  apiEnabled = false,
} = {}) {
  if (!state || !device) {
    return { ttl_seconds: 30, components: [{ type: 'text', body: translate('notConnected') }] };
  }

  const components = [];

  // 1. The live value, as a tile bound to the device feature: it follows the
  //    published states, so nothing has to be refreshed here.
  if (powerFeatureId) {
    components.push({
      type: 'value',
      label: translate('power'),
      icon: 'zap',
      device_feature: powerFeatureId,
      // The sign is the meter's: consumption positive, feed-in negative.
      color: (state.power ?? 0) < 0 ? 'success' : 'neutral',
    });
  }

  // 2. The period total, once one has been read. A computed value, so it goes
  //    out as a plain number with its unit and the period it belongs to.
  if (period) {
    components.push({
      type: 'value',
      label: translate(`period_${period.period}`),
      icon: 'bar-chart-2',
      value: period.consumption ?? '–',
      unit: settings.unit === 'Wh' ? 'Wh' : 'kWh',
      color: 'info',
    });
  }

  // 3. Which meter this is. A status row, because it carries a label, an icon
  //    and a value without spending a second component.
  components.push({
    type: 'status',
    items: [
      { label: translate('meterNumber'), icon: 'hash', value: device.serial || '–', color: 'neutral' },
    ],
  });

  // 4. The four period buttons — exactly the button budget of the card. Left
  //    out entirely when the REST API cannot be used, see the note at the top.
  if (apiEnabled) {
    for (const key of PERIOD_KEYS) {
      components.push({
        type: 'button',
        label: translate(`period_${key}`),
        icon: 'calendar',
        style: period?.period === key ? 'primary' : 'secondary',
        action: { key: ACTION.PERIOD, params: { period: key } },
      });
    }
  }

  return { ttl_seconds: 60, components };
}

/**
 * Run a tapped button and return the toast text.
 *
 * The period itself is remembered by the caller and reaches the next
 * `buildMeterContent` call through `period`, which is what highlights the active
 * button and fills the second tile.
 */
export async function runMeterAction({ actionKey, params }) {
  if (actionKey !== ACTION.PERIOD) throw new Error(`Unknown widget action: ${actionKey}`);
  const period = String(params?.period ?? '');
  if (!PERIOD_KEYS.includes(period)) throw new Error(`Unknown period: ${period}`);
  return translate(`reading_${period}`);
}
