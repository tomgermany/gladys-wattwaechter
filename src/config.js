// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. The SDK fetches it (`gladys.getConfig()`)
// and notifies every change through `gladys.onConfigUpdated()`.
//
// This module only provides defaults and normalises the object, so the rest of
// the code never deals with `undefined`.
// -----------------------------------------------------------------------------

// Defaults MUST stay consistent with the `default` values of the manifest
// `config_schema` (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  host: '',
  modbus_port: 502,
  read_token: '',
  poll_frequency: 60, // seconds between two reads
  power_max: 3500, // fire "too high" above this, in watts; 0 disables this side
  power_min: 0, // fire "too low" below this, in watts; 0 disables this side
};

export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    host: String(raw.host ?? DEFAULT_CONFIG.host).trim(),
    modbus_port: Number(raw.modbus_port ?? DEFAULT_CONFIG.modbus_port),
    read_token: String(raw.read_token ?? DEFAULT_CONFIG.read_token).trim(),
    poll_frequency: Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency),
    power_max: Number(raw.power_max ?? DEFAULT_CONFIG.power_max),
    power_min: Number(raw.power_min ?? DEFAULT_CONFIG.power_min),
  };
}
