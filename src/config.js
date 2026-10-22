// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. The SDK fetches it (`gladys.getConfig()`)
// and notifies every change through `gladys.onConfigUpdated()`.
//
// DEFAULTS MUST MATCH THE MANIFEST, EXACTLY
// `normalizeConfig()` runs at startup and on every change, and whatever it fills
// in is what the rest of the code works with. A default that disagrees with the
// manifest is therefore not a cosmetic mismatch: it is the value the integration
// really uses, and it is invisible to the user, who only ever sees the form.
//
// Both of these disagreed once, and both had teeth:
//   poll_frequency was 60 here while the manifest said 60000. index.js reads the
//   value as MILLISECONDS, so the poll would have run every 60 ms instead of
//   once a minute — on a device that accepts two Modbus clients at a time.
//   power_max was 3500 while the manifest said 0. 0 switches that side of the
//   scene trigger off, so every user would have been signed up for "power
//   threshold crossed" alerts at 3500 W without asking for them.
//
// test/manifest.test.js compares the two files, which is how a mismatch is meant
// to be caught before a release rather than after one.
// -----------------------------------------------------------------------------

export const DEFAULT_CONFIG = {
  host: '',
  modbus_port: 502,
  // MILLISECONDS, not seconds: Gladys only accepts a poll_frequency out of
  // DEVICE_POLL_FREQUENCIES (1000, 2000, 10000, 15000, 30000, 60000), and
  // index.js compares it against Date.now() directly.
  poll_frequency: 60000, // once a minute
  read_token: '',
  // 0 switches the side off. Both sides default to off: the trigger is
  // something the user opts into, not something the integration assumes.
  power_max: 0,
  power_min: 0,
};

export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    host: String(raw.host ?? DEFAULT_CONFIG.host).trim(),
    modbus_port: Number(raw.modbus_port ?? DEFAULT_CONFIG.modbus_port),
    poll_frequency: Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency),
    read_token: String(raw.read_token ?? DEFAULT_CONFIG.read_token).trim(),
    power_max: Number(raw.power_max ?? DEFAULT_CONFIG.power_max),
    power_min: Number(raw.power_min ?? DEFAULT_CONFIG.power_min),
  };
}
