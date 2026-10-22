// -----------------------------------------------------------------------------
// The meter as a Gladys device: which features exist, and how they are built.
//
// WHAT A "FEATURE" IS IN GLADYS
// A feature is one value of a device: the power, one phase voltage, the meter
// index, the frequency. Every feature carries an external id, a name, a category
// and a type, a unit and a value. Gladys files and displays a feature by its
// category, which is why the category has to be one Gladys knows.
//
// THE HARD RULE ABOUT CATEGORIES, LEARNED FROM A FAILED SCAN
// A category Gladys does not know is not a warning, it is a refusal — and not
// only for that one feature: Gladys validates the whole device, so a single
// unknown category makes it answer
//   `devices[0].features[11].category: unknown category`
// and nothing at all appears in the Discovery tab, while the integration logs a
// perfectly healthy list of 12 features. That is exactly what happened with
// `frequency-sensor`, which does not exist in Gladys. Every feature here now
// belongs to `energy-sensor`, the category that carries a three-phase meter.
//
// THE TWO ENERGY COUNTERS ARE THE POINT
// `consumption` and `feed_in` are not ordinary readings: they are cumulative
// meter totals. In Gladys they belong to the ENERGY category with the
// kilowatt-hour unit, because that is what makes them show up in the energy
// monitoring and let the user build a consumption view from them. The live
// readings (power, voltage, current, frequency) are ordinary values.
//
// UNITS, AND WHY THEY ARE CONVERTED HERE
// The meter reports the counters in watt-hours and the power in watts. Gladys
// stores energy in kilowatt-hours for an energy feature, so Wh is divided by
// 1000 once, here, on the way in. Everything else is published as it arrives.
//
// A READING THE METER DOES NOT PROVIDE SIMPLY DOES NOT APPEAR
// The Modbus client already drops the SunSpec "not available" sentinel, so a
// key can be missing from the state. This file therefore builds a feature only
// for a key that is really there. A two-phase meter gets no phase 3, and the
// interface never shows a value of zero that would be wrong.
//
// IT IS UNIT-TESTED WITHOUT A DEVICE: buildDevice() takes a plain object, so the
// tests hand it hand-written readings.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
  createLogger,
} from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'meter' });

const ENERGY = TYPE.ENERGY?.INDEX ?? 'index';
const POWER = TYPE.ENERGY?.POWER ?? 'power';
const VOLTAGE = TYPE.ENERGY?.VOLTAGE ?? 'voltage';
const CURRENT = TYPE.ENERGY?.CURRENT ?? 'current';

/**
 * The Gladys category every feature here belongs to.
 *
 * WHY ONE CATEGORY AND NOT ONE PER QUANTITY
 * Gladys has no `frequency-sensor` category, and an unknown category does not
 * just drop that one feature: the whole device is refused with
 * `devices[0].features[11].category: unknown category`, and nothing shows up in
 * the Discovery tab. A real scan failed exactly that way.
 *
 * `energy-sensor` is the category that carries a three-phase meter. Its types
 * are power, energy, voltage, current, index, index-today, index-yesterday and
 * daily-consumption. Frequency has no type of its own there, which is why it is
 * published with the choice below.
 */
const CAT_ENERGY = CAT.ENERGY_SENSOR;

// WHY `power` FOR THE FREQUENCY
// The hertz unit is valid in `energy-sensor`, but the category's named types
// (power, energy, voltage, current, index) do not include a plain-number type:
// `energy-sensor` has no `decimal`. The unit, not the type, is what Gladys shows
// to the user, so the frequency rides on the type the category does offer rather
// than on a type it would refuse. This is the choice that keeps the device
// acceptable; it does not change the value, which stays the frequency in hertz.
const READING = TYPE.ENERGY?.POWER ?? 'power';

/**
 * One row per feature.
 *
 *   key      : the reading it carries, and the suffix of the feature external
 *              id. Never rename it: Gladys keys the history, the scenes and the
 *              dashboards on these ids.
 *   category : how Gladys files it. ENERGY_SENSOR is the only category here, and
 *              it has to be one Gladys knows or the device is refused.
 *   type     : how Gladys renders and stores it.
 *   unit     : the unit the value is published in. Keep this in step with the
 *              `scale` below or the numbers lie.
 *   scale    : applied on the way in, see the conversion note above.
 */
export const FEATURES = [
  // --- The live reading the widget shows big ---
  // Positive is consumption, negative is feed-in: the meter's own sign, kept.
  {
    key: 'power',
    name: 'Leistung',
    category: CAT_ENERGY,
    type: POWER,
    unit: UNIT.WATT,
    scale: 1,
  },
  // --- The cumulative counters, one import and one export ---
  {
    key: 'consumption',
    name: 'Zählerstand Bezug',
    category: CAT_ENERGY,
    type: ENERGY,
    unit: UNIT.KILOWATT_HOUR,
    scale: 1 / 1000, // the meter counts Wh, Gladys stores kWh
  },
  {
    key: 'feed_in',
    name: 'Zählerstand Einspeisung',
    category: CAT_ENERGY,
    type: ENERGY,
    unit: UNIT.KILOWATT_HOUR,
    scale: 1 / 1000,
  },

  // --- Power per phase ---
  { key: 'power_l1', name: 'Leistung L1', category: CAT_ENERGY, type: POWER, unit: UNIT.WATT, scale: 1 },
  { key: 'power_l2', name: 'Leistung L2', category: CAT_ENERGY, type: POWER, unit: UNIT.WATT, scale: 1 },
  { key: 'power_l3', name: 'Leistung L3', category: CAT_ENERGY, type: POWER, unit: UNIT.WATT, scale: 1 },

  // --- Voltage per phase ---
  { key: 'voltage_l1', name: 'Spannung L1', category: CAT_ENERGY, type: VOLTAGE, unit: UNIT.VOLT, scale: 1 },
  { key: 'voltage_l2', name: 'Spannung L2', category: CAT_ENERGY, type: VOLTAGE, unit: UNIT.VOLT, scale: 1 },
  { key: 'voltage_l3', name: 'Spannung L3', category: CAT_ENERGY, type: VOLTAGE, unit: UNIT.VOLT, scale: 1 },

  // --- Current per phase ---
  { key: 'current_l1', name: 'Strom L1', category: CAT_ENERGY, type: CURRENT, unit: UNIT.AMPERE, scale: 1 },
  { key: 'current_l2', name: 'Strom L2', category: CAT_ENERGY, type: CURRENT, unit: UNIT.AMPERE, scale: 1 },
  { key: 'current_l3', name: 'Strom L3', category: CAT_ENERGY, type: CURRENT, unit: UNIT.AMPERE, scale: 1 },

  // --- Grid frequency ---
  // `energy-sensor` has no type for frequency, so this rides on the category's
  // plain reading type and keeps the hertz unit. Calling it a frequency sensor
  // is what made a real scan fail: `frequency-sensor` is not a Gladys category,
  // and Gladys refuses the whole device over it.
  {
    key: 'frequency',
    name: 'Frequenz',
    category: CAT_ENERGY,
    type: READING,
    unit: UNIT.HERTZ,
    scale: 1,
  },
];

/**
 * The identity of the device in Gladys.
 *
 * WHY host+serial AND NOT THE NAME
 * The external id has to survive a rename by the user and stay unique when two
 * meters sit in the same installation. The serial is the device's own, and the
 * host keeps the id stable when someone renames the unit.
 */
export function deviceExternalId(gladys, device) {
  return `wattwaechter:${device.host}:${device.serial || 'unknown'}`;
}

/** The name shown in Discovery. The model string comes from the SunSpec Common Block. */
export function deviceName(device) {
  return device.name || 'WattWächter';
}

/**
 * Build the device payload for `publishDiscoveredDevices`.
 *
 * A feature is built only for a reading that is really there, so a meter that
 * does not report a third phase does not get an empty third phase. When a whole
 * device has no counters at all, it is logged rather than published half-built:
 * a device with no feature would show up in Discovery as an empty entry.
 */
export function buildDevice(gladys, device, state) {
  const features = [];
  for (const spec of FEATURES) {
    const raw = state[spec.key];
    if (typeof raw !== 'number' || Number.isNaN(raw)) continue;
    features.push({
      external_id: `${deviceExternalId(gladys, device)}:${spec.key}`,
      name: spec.name,
      category: spec.category,
      type: spec.type,
      unit: spec.unit,
      min: 0,
      max: spec.max ?? 0,
      read_only: true,
      has_feedback: false,
      // The last known value, so the device is not empty the moment it appears.
      last_value: Math.round(raw * spec.scale * 100) / 100,
      last_value_changed: new Date().toISOString(),
    });
  }

  if (features.length === 0) {
    logger.warn('No reading produced a feature; the device is not published');
  }

  return {
    name: deviceName(device),
    external_id: deviceExternalId(gladys, device),
    selector: deviceExternalId(gladys, device),
    features,
    // No poll frequency here: the manifest's poll_frequency drives the poll.
  };
}

/**
 * Publish every reading as a state, so history and the dashboard fill up.
 *
 * Values are pushed one by one with the feature external id. A key with no
 * matching feature is skipped instead of published, and a failed push is logged
 * and stepped over: one refused reading must not stop the other eleven.
 */
export async function publishAll(gladys, device, state) {
  for (const spec of FEATURES) {
    const raw = state[spec.key];
    if (typeof raw !== 'number' || Number.isNaN(raw)) continue;
    const value = Math.round(raw * spec.scale * 100) / 100;
    try {
      await gladys.publishState(`${deviceExternalId(gladys, device)}:${spec.key}`, value);
    } catch (err) {
      logger.warn(`Could not publish ${spec.name}: ${err.message}`);
    }
  }
}
