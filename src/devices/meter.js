// -----------------------------------------------------------------------------
// The WattWächter as ONE Gladys device.
//
// WHAT THIS FILE DOES
// It turns the flat reading object that src/wattwaechter/modbus.js produces
// ("power": 2410, "consumption": 2511054, ...) into the "device" payload Gladys
// understands: a name, an external id and a list of features. Gladys shows that
// device in the Discovery tab, where the user creates it and gets the readings.
//
// READ-ONLY, ALL OF IT
// A meter measures. There is nothing to switch, so every feature here is
// `read_only: true`. That is not a shortcut: the device's Modbus server answers
// only the read function codes 0x03 and 0x04, so there is no write path even if
// we wanted one.
//
// THE TWO ENERGY COUNTERS ARE THE POINT
// `consumption` and `feed_in` are not ordinary readings: they are cumulative
// meter totals. In Gladys they belong to the ENERGY category with the
// kilowatt-hour unit, because that is what makes them usable by the energy
// monitoring and lets the user build a consumption view from them. The live
// readings (power, voltage, current, frequency) are ordinary values.
//
// UNITS, AND WHY THEY ARE CONVERTED HERE
// The meter reports the counters in watt-hours and the power in watts. Gladys
// stores energy in kilowatt-hours for an energy feature, so watt-hours are
// divided by 1000 once, here, on the way in. Everything else is published as it
// arrives.
//
// A READING THE METER DOES NOT PROVIDE SIMPLY DOES NOT APPEAR
// The Modbus client already drops the SunSpec "not available" sentinel, so a
// key can be missing from the state. This file therefore builds a feature only
// for a key that is really there. A two-phase meter gets no phase 3, and the
// interface never shows a zero that would be wrong.
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

// The SDK exports the names used below where they are documented; the fallbacks
// are the literal values the Gladys core uses.
const ENERGY = TYPE.ENERGY?.INDEX ?? 'index';
const POWER = TYPE.ENERGY?.POWER ?? 'power';
const VOLTAGE = TYPE.VOLTAGE_SENSOR?.VOLTAGE ?? 'voltage';
const CURRENT = TYPE.CURRENT_SENSOR?.CURRENT ?? 'current';
const FREQUENCY = TYPE.FREQUENCY_SENSOR?.FREQUENCY ?? 'frequency';

/**
 * One row per feature.
 *
 *   key      : the reading it carries, and the suffix of the feature external
 *              id. Never rename it: Gladys keys the history, the scenes and the
 *              dashboards on these ids.
 *   category : how Gladys files it. ENERGY is the one that matters, it is what
 *              the energy monitoring reads.
 *   type     : how Gladys renders and stores it.
 *   unit     : the unit the value is published in. Keep it in step with the
 *              `scale` beside it, or the numbers lie.
 *   scale    : applied on the way in, see the conversion note at the top.
 */
export const FEATURES = [
  // The live reading the widget shows big. Positive is consumption, negative is
  // feed-in: the meter's own sign, kept as it is.
  { key: 'power', name: 'Leistung', category: CAT.ENERGY, type: POWER, unit: UNIT.WATT, scale: 1 },

  // The two cumulative meter totals, for the energy monitoring. Wh from the
  // device, kWh in Gladys.
  { key: 'consumption', name: 'Zählerstand Bezug', category: CAT.ENERGY, type: ENERGY, unit: UNIT.KILOWATT_HOUR, scale: 0.001 },
  { key: 'feed_in', name: 'Zählerstand Einspeisung', category: CAT.ENERGY, type: ENERGY, unit: UNIT.KILOWATT_HOUR, scale: 0.001 },

  // Per-phase power: present in the device, hidden in the widget by default.
  { key: 'power_l1', name: 'Leistung L1', category: CAT.ENERGY, type: POWER, unit: UNIT.WATT, scale: 1 },
  { key: 'power_l2', name: 'Leistung L2', category: CAT.ENERGY, type: POWER, unit: UNIT.WATT, scale: 1 },
  { key: 'power_l3', name: 'Leistung L3', category: CAT.ENERGY, type: POWER, unit: UNIT.WATT, scale: 1 },

  // Voltage per phase.
  { key: 'voltage_l1', name: 'Spannung L1', category: CAT.VOLTAGE_SENSOR, type: VOLTAGE, unit: UNIT.VOLT, scale: 1 },
  { key: 'voltage_l2', name: 'Spannung L2', category: CAT.VOLTAGE_SENSOR, type: VOLTAGE, unit: UNIT.VOLT, scale: 1 },
  { key: 'voltage_l3', name: 'Spannung L3', category: CAT.VOLTAGE_SENSOR, type: VOLTAGE, unit: UNIT.VOLT, scale: 1 },

  // Current per phase.
  { key: 'current_l1', name: 'Strom L1', category: CAT.CURRENT_SENSOR, type: CURRENT, unit: UNIT.AMPERE, scale: 1 },
  { key: 'current_l2', name: 'Strom L2', category: CAT.CURRENT_SENSOR, type: CURRENT, unit: UNIT.AMPERE, scale: 1 },
  { key: 'current_l3', name: 'Strom L3', category: CAT.CURRENT_SENSOR, type: CURRENT, unit: UNIT.AMPERE, scale: 1 },

  // Grid frequency.
  { key: 'frequency', name: 'Frequenz', category: CAT.FREQUENCY_SENSOR, type: FREQUENCY, unit: UNIT.HERTZ, scale: 1 },
];

/**
 * The identity of the device in Gladys.
 *
 * The serial number from the SunSpec Common Block comes first, because that is
 * what the hardware itself reports; the host is only a fallback for a device
 * that answers nothing there. A meter that keeps its identity keeps its history
 * and its scenes when its IP address changes.
 */
export const platformId = (device) => device.serial || device.host;

export function deviceExternalId(gladys, device) {
  return gladys.externalIds('wattwaechter', platformId(device)).device;
}

/** The value to publish for one feature, or null when the reading is missing. */
export function featureValue(feature, state) {
  const raw = state[feature.key];
  if (raw === undefined || raw === null) return null;
  return feature.scale === 1 ? raw : Math.round(raw * feature.scale * 1000) / 1000;
}

/**
 * Build the discovery payload: "here is a meter, with these readings".
 * Gladys creates nothing from this. It is an offer shown in the Discovery tab.
 */
export function buildDevice(gladys, device, state) {
  const ids = gladys.externalIds('wattwaechter', platformId(device));
  const features = [];

  for (const f of FEATURES) {
    // Only what the meter really answered, see the note at the top.
    if (featureValue(f, state) === null) continue;
    features.push({
      name: f.name,
      external_id: ids.feature(f.key),
      category: f.category,
      type: f.type,
      unit: f.unit,
      min: 0,
      max: 0,
      read_only: true, // a meter measures, it does not switch
      has_feedback: false, // nothing to acknowledge: there is no command
      keep_history: true,
    });
  }

  return {
    name: device.name || 'WattWächter',
    external_id: ids.device,
    model: device.model,
    should_poll: true,
    features,
  };
}

/** Publish the value of every feature from one reading snapshot. */
export async function publishAll(gladys, device, state) {
  const ids = gladys.externalIds('wattwaechter', platformId(device));
  for (const f of FEATURES) {
    const value = featureValue(f, state);
    if (value === null) continue;
    await gladys.publishState(ids.feature(f.key), value);
  }
}

/**
 * The three values a scene author cares about, already in the unit the
 * interface shows: a scene writing "consumption > 2500" should be thinking in
 * kilowatt-hours, not in the watt-hours the device happens to use inside.
 */
export function readableState(state) {
  const byKey = Object.fromEntries(FEATURES.map((f) => [f.key, f]));
  const value = (key) => (byKey[key] ? featureValue(byKey[key], state) : null);
  return {
    power: value('power'),
    consumption: value('consumption'),
    feed_in: value('feed_in'),
  };
}

logger.debug('Meter device definition loaded');
