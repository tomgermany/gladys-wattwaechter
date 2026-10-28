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
//   poll_frequency used to be milliseconds; it is now minutes and is converted in index.js.
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
  // Minutes, matching the selector in the manifest. Gladys polls at most once per minute.
  poll_frequency: 1,
  read_token: '',
  // 0 switches the side off. Both sides default to off: the trigger is
  // something the user opts into, not something the integration assumes.
  power_max: 0,
  power_min: 0,
  mqtt_enabled: false,
  mqtt_host: '',
  mqtt_port: 1883,
  mqtt_username: '',
  mqtt_password: '',
  mqtt_tls: false,
  mqtt_interval: 60000,
  mqtt_topic_prefix: 'wattwaechter',
};

export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    host: String(raw.host ?? DEFAULT_CONFIG.host).trim(),
    modbus_port: Number(raw.modbus_port ?? DEFAULT_CONFIG.modbus_port),
    // Old installations may still send millisecond values from the previous form.
    // Values above 60 cannot be valid minute-selector choices, so migrate them to 1 minute.
    poll_frequency: (() => {
      const value = Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency);
      return value > 60 ? 1 : value;
    })(),
    read_token: String(raw.read_token ?? DEFAULT_CONFIG.read_token).trim(),
    power_max: Number(raw.power_max ?? DEFAULT_CONFIG.power_max),
    power_min: Number(raw.power_min ?? DEFAULT_CONFIG.power_min),
    mqtt_enabled: raw.mqtt_enabled === true || raw.mqtt_enabled === 'true',
    mqtt_host: String(raw.mqtt_host ?? DEFAULT_CONFIG.mqtt_host).trim(),
    mqtt_port: Number(raw.mqtt_port ?? DEFAULT_CONFIG.mqtt_port),
    mqtt_username: String(raw.mqtt_username ?? DEFAULT_CONFIG.mqtt_username),
    mqtt_password: String(raw.mqtt_password ?? DEFAULT_CONFIG.mqtt_password),
    mqtt_tls: raw.mqtt_tls === true || raw.mqtt_tls === 'true',
    mqtt_interval: Number(raw.mqtt_interval ?? DEFAULT_CONFIG.mqtt_interval),
    mqtt_topic_prefix: String(raw.mqtt_topic_prefix ?? DEFAULT_CONFIG.mqtt_topic_prefix).trim() || DEFAULT_CONFIG.mqtt_topic_prefix,
  };
}
