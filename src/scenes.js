// -----------------------------------------------------------------------------
// Scene actions for the WattWächter integration.
//
// WHAT A SCENE ACTION IS
// An OPERATION a scene author places in a scene: "read the meter", "read this
// period's consumption". It has parameters and returns values the following
// steps of the scene can use.
//
// THE HOUSE RULES, from the SDK's contract
//   - `fields` arrive already RESOLVED: the scene variables are substituted and
//     the defaults applied by Gladys before we ever see them;
//   - resolve an object of the declared `outputs`, and only those keys: the core
//     drops anything it did not see declared in the manifest;
//   - throwing fails THIS action only. The scene logs it and carries on, which
//     is the right behaviour for a meter that is briefly offline;
//   - never fire a scene event as a consequence of a received action. A scene
//     bound to that event would loop forever.
//
// TWO ACTIONS, TWO SOURCES
//   read_meter   reads the live values over Modbus, always available.
//   read_period  goes to the REST API, because only it knows about the past. It
//                needs the read token, and says so plainly when the token is
//                missing rather than failing with a network error that hides the
//                real cause.
// -----------------------------------------------------------------------------

import { PERIODS, WattwaechterApi } from './wattwaechter/api.js';
import { readableState } from './devices/meter.js';
import { t } from './wattwaechter/labels.js';

/**
 * One handler per declared scene action, keyed as in the manifest.
 *
 * `index.js` passes the live clients in, so nothing here reaches for a global:
 * an action runs against the connection that is current at the moment the scene
 * reaches it.
 */
export const SCENE_ACTIONS = {
  /** Read the meter now and hand the values to the following steps. */
  async read_meter({ modbus, device }) {
    if (!modbus || !device) throw new Error(t('notConnected'));
    const state = await modbus.readAll();
    const values = readableState(state);
    return {
      power: values.power ?? null,
      consumption: values.consumption ?? null,
      feed_in: values.feed_in ?? null,
      meter_number: device.serial ?? null,
    };
  },

  /**
   * Sum the consumption over a period through the REST API.
   *
   * The period field is one of day, week, month, year — the same four the widget
   * buttons offer, so the two surfaces cannot drift apart. The number comes back
   * in kilowatt-hours, the unit the interface shows.
   */
  async read_period({ config, fields, device }) {
    if (!device) throw new Error(t('notConnected'));
    if (!config.read_token) throw new Error(t('needsToken'));

    const period = String(fields?.period ?? 'day');
    if (!PERIODS[period]) throw new Error(`Unknown period: ${period}`);

    const client = new WattwaechterApi({ host: config.host, token: config.read_token });
    const total = await client.periodTotal(period);
    return {
      value: total.consumption ?? null,
      period: total.period,
    };
  },
};
