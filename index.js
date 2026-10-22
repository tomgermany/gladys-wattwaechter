// -----------------------------------------------------------------------------
// Entry point (the "wiring"): this file connects the pieces, it holds no logic.
//
// WHAT THIS FILE DOES
// It creates the SDK connection to Gladys, registers the handlers Gladys calls
// (scan, poll, actions, widget), and starts the container. Everything else lives
// in src/:
//   src/wattwaechter/transport.js  the raw TCP socket
//   src/wattwaechter/modbus.js     the Modbus protocol and the register map
//   src/wattwaechter/api.js        the REST API, for the history periods
//   src/devices/meter.js           the meter as a Gladys device
//   src/config.js                  defaults and normalisation
//
// THE ONE ORDERING RULE
// Every handler is registered BEFORE `gladys.connect()`. Gladys may send a
// message the moment the connection opens, and a handler registered later would
// simply miss it.
//
// ONE CONNECTION FOR THE POLL, NONE FOR ANYTHING ELSE
// The device allows at most two Modbus clients. The poll keeps one open; the
// connection test opens its own and gives it back when it is done, success or
// failure alike. Without that, the second attempt finds both slots taken and
// times out — which is exactly what a real log showed.
//
// SDK: @gladysassistant/integration-sdk ^0.15 (Gladys >= 5.1.0).
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { WattwaechterModbus } from './src/wattwaechter/modbus.js';
import { WattwaechterApi } from './src/wattwaechter/api.js';
import { buildDevice, deviceExternalId, publishAll } from './src/devices/meter.js';

const gladys = new GladysIntegration();

// --- State of the running integration ----------------------------------------
let config = normalizeConfig(); // the user settings, re-read on every change
let modbus = null; // the Modbus connection, null while we have none
let api = null; // the REST client, used for the period totals
let state = null; // last readings
let device = null; // { host, serial, model, name }: the identity of the meter
let lastRead = 0; // when the readings were taken, to honour poll_frequency
let powerSide = 'normal'; // 'normal' | 'over' | 'under', see firePowerEvents()

// A meter sitting on its limit must not flap: the value has to come back this
// far before a new crossing is reported.
const HYSTERESIS = 200; // watts

const NO_HOST = {
  de: 'Bitte die Adresse des WattWächters in der Konfiguration eintragen.',
  en: 'Enter the WattWächter address in the configuration.',
  fr: "Indiquez l'adresse du WattWächter dans la configuration.",
  es: 'Introduce la dirección del WattWächter en la configuración.',
};

/** Read the configuration Gladys holds into `config`. */
async function readConfig() {
  config = normalizeConfig(await gladys.getConfig());
  return config;
}

/**
 * Connect to the device, read it once, and keep what it answered.
 *
 * Resolves true on success. On failure the connection status carries the reason,
 * which is the text shown in the Configuration screen, and the log names the
 * register or the endpoint that failed.
 */
async function connectDevice() {
  // Start from a clean slate: a failed attempt must never leave the previous
  // connection behind, or the next read would talk to a stale socket.
  modbus?.transport?.reset();
  modbus = null;
  api = null;
  state = null;
  device = null;

  if (!config.host) {
    await gladys.setConnectionStatus(false, NO_HOST);
    return false;
  }

  try {
    const connection = new WattwaechterModbus({ host: config.host, port: config.modbus_port });
    // Tolerated problems are logged, never thrown.
    connection.warn = (what, err) => logger.warn(`Tolerated (${what}): ${err.message}`);
    const info = await connection.connect();

    device = {
      host: config.host,
      serial: info.serial,
      model: info.model,
      name: info.model || 'WattWächter',
    };
    modbus = connection;

    if (config.read_token) {
      api = new WattwaechterApi({ host: config.host, token: config.read_token });
    }

    state = await modbus.readAll();
    logger.info(
      `Meter ready: ${device.name} (${device.serial || 'no serial'}), firmware ${info.firmware}, ` +
        `${Object.keys(state).length} readings, modbus model ${modbus.usesFloatModel ? '213 (float)' : '203 (scaled int)'}, ` +
        `history API ${api ? 'enabled' : 'disabled (no read token)'}`,
    );
    await gladys.setConnectionStatus(true);
    return true;
  } catch (err) {
    // A failed attempt must not leave a half-open socket behind: the device
    // allows only two Modbus clients, and a stranded one would block the next
    // attempt. A real log showed a read succeeding and then the very next
    // request timing out, which is that stranded connection.
    modbus?.transport?.reset();
    logger.error(`WattWächter connection failed (${config.host}): ${err.message}`);
    await gladys
      .setConnectionStatus(false, {
        de: `WattWächter nicht erreichbar: ${err.message}`.slice(0, 200),
        en: `WattWächter not reachable: ${err.message}`.slice(0, 200),
        fr: `WattWächter injoignable : ${err.message}`.slice(0, 200),
        es: `WattWächter no accesible: ${err.message}`.slice(0, 200),
      })
      .catch(() => {});
    return false;
  }
}

/**
 * Publish the device, so it appears in the Discovery tab where the user creates
 * it. Publishing is an offer, not a creation: Gladys keeps the user in control.
 */
async function publishDevice() {
  if (!device || !state) return;
  const payload = buildDevice(gladys, device, state);
  logger.info(
    `publishDiscoveredDevices -> "${payload.name}" with ${payload.features.length} features`,
  );
  for (const feature of payload.features) {
    logger.info(`  feature: ${feature.name} | ${feature.category}/${feature.type} | ${feature.unit}`);
  }
  await gladys.publishDiscoveredDevices([payload]);
  await publishAll(gladys, device, state);
}

/** Read the meter again, publish every value, and check the power limits. */
async function refresh() {
  if (!modbus) return;
  state = await modbus.readAll();
  lastRead = Date.now();
  await publishAll(gladys, device, state);
  await firePowerEvents();
}

/**
 * The "power crossed a limit" scene trigger.
 *
 * Why the comparison lives here and not in the scene: a scene trigger declared
 * by an integration can only match EQUALITY on its fields. There is no operator
 * and no threshold on the Gladys side, so the integration compares and reports
 * only the crossing.
 *
 * The limits come from the configuration, where 0 switches a side off. The
 * lower limit accepts negative values, because feed-in is negative power.
 */
async function firePowerEvents() {
  const power = state?.power;
  if (typeof power !== 'number') return;

  const max = config.power_max > 0 ? config.power_max : undefined;
  const min = config.power_min !== 0 ? config.power_min : undefined;

  let side = 'normal';
  if (max !== undefined && power > max) side = 'over';
  else if (min !== undefined && power < min) side = 'under';
  else if (max !== undefined && power > max - HYSTERESIS) side = 'over-hold';
  else if (min !== undefined && power < min + HYSTERESIS) side = 'under-hold';

  const was = powerSide;
  // Inside the hysteresis band the previous side is kept, so a value that stays
  // near the limit does not fire again on every read.
  const now = side === 'over-hold' || side === 'under-hold' ? was : side;
  powerSide = side;

  if (now === 'over' && was !== 'over') {
    await gladys
      .publishSceneEvent('power_threshold_crossed', { direction: 'over', limit: max, power })
      .catch((err) => logger.error('publishSceneEvent failed', err.message));
  }
  if (now === 'under' && was !== 'under') {
    await gladys
      .publishSceneEvent('power_threshold_crossed', { direction: 'under', limit: min, power })
      .catch((err) => logger.error('publishSceneEvent failed', err.message));
  }
}

// --- Discovery ---------------------------------------------------------------
// Gladys calls this when the user asks for a scan in the Discovery tab.
//
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> called by Gladys');
  if (!modbus && !(await connectDevice())) {
    logger.warn('onScanRequest -> no meter, nothing published');
    return;
  }
  await publishDevice();
});

// --- Polling -----------------------------------------------------------------
gladys.onPoll(async (polled) => {
  if (!modbus || !device) return;
  if (polled.external_id !== deviceExternalId(gladys, device)) return;
  if (Date.now() - lastRead < config.poll_frequency * 1000 - 30000) return;
  await refresh();
});

/**
 * Manifest action "Test the connection": the button in the Configuration
 * screen. It answers in words rather than only in the log, and it names the one
 * thing that is not obvious about this device: the Modbus server is off by
 * default and has to be switched on before anything can be read.
 */
gladys.onAction('test_connection', async () => {
  await readConfig().catch(() => {});
  let probe = null;
  try {
    probe = new WattwaechterModbus({ host: config.host, port: config.modbus_port });
    const info = await probe.connect();
    const readings = await probe.readAll();
    const count = Object.keys(readings).length;
    const power = readings.power ?? '?';
    logger.info(`Connection test: ${info.model} (${info.firmware}) at ${config.host}`);
    return {
      de: `Antwort: ${info.model}, Firmware ${info.firmware || 'unbekannt'}. ${count} Messwerte, Leistung ${power} W.`,
      en: `Answered: ${info.model}, firmware ${info.firmware || 'unknown'}. ${count} readings, power ${power} W.`,
      fr: `Réponse : ${info.model}, firmware ${info.firmware || 'inconnu'}. ${count} mesures, puissance ${power} W.`,
      es: `Respuesta: ${info.model}, firmware ${info.firmware || 'desconocido'}. ${count} medidas, potencia ${power} W.`,
    };
  } catch (err) {
    logger.error(`Connection test failed (${config.host}): ${err.message}`);
    return {
      de: `Keine verwertbare Antwort von ${config.host}: ${err.message}. Ist der Modbus-Server im Gerät eingeschaltet?`,
      en: `No usable answer from ${config.host}: ${err.message}. Is the Modbus server switched on in the device?`,
      fr: `Aucune réponse exploitable de ${config.host} : ${err.message}. Le serveur Modbus est-il activé dans l'appareil ?`,
      es: `Sin respuesta utilizable de ${config.host}: ${err.message}. ¿Está activado el servidor Modbus en el aparato?`,
    };
  } finally {
    // Give the slot back, success or failure: the device takes only two
    // Modbus clients, and the poll holds one of them.
    probe?.transport?.reset();
  }
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    await readConfig();
    if (await connectDevice()) await publishDevice();
    gladys.requestWidgetRefresh('meter');
  } catch (err) {
    logger.error('Post-connection initialization failed', err.message);
  }
});

gladys.onConfigUpdated(async (newConfig) => {
  config = normalizeConfig(newConfig);
  powerSide = 'normal';
  if (await connectDevice()) await publishDevice();
  gladys.requestWidgetRefresh('meter');
});

// --- Shutdown ----------------------------------------------------------------
gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  await modbus?.connection?.close().catch(() => {});
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the WattWächter integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err.message);
  process.exit(1);
});
