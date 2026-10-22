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
//   src/widgets.js                 the content of the dashboard card
//   src/config.js                  defaults and normalisation
//
// THE ONE ORDERING RULE
// Every handler is registered BEFORE `gladys.connect()`. Gladys may send a
// message the moment the connection opens, and a handler registered later would
// simply miss it.
//
// A HANDLER FOR EVERY MESSAGE, OR GLADYS SAYS "not implemented"
// A widget is not drawn by the integration: Gladys asks for its content and
// renders the answer. With no `onWidgetGet` registered for the widget key,
// Gladys receives the SDK's default answer to an unhandled message — the literal
// words "not implemented" on the dashboard card — and the integration looks
// broken even while every value beside it is right. Both widget handlers are
// therefore registered here, under the key the manifest declares.
//
// ONE CONNECTION, AND NOTHING ELSE OPENS A SECOND ONE
// The WattWächter's Modbus server accepts at most TWO clients at a time and
// keeps an idle connection for five minutes. One connection therefore belongs to
// this process, and every read — poll, scan and the connection test alike — runs
// on it. An earlier version let the connection test build its own client next to
// the running one; on a real device that third client was refused and the test
// timed out after five seconds.
//
// A SECOND TRAP, AND WHY THERE IS ONE RETRY
// Recreating the container leaves the old connection alive on the device side
// until its idle timeout expires. The first attempt after a restart can hit that
// occupied slot. One deliberate retry on a fresh socket rides it out; more would
// only hammer the device.
//
// SDK: @gladysassistant/integration-sdk ^0.15 (Gladys >= 5.1.0).
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';

import { normalizeConfig } from './src/config.js';
import { WattwaechterModbus } from './src/wattwaechter/modbus.js';
import { WattwaechterApi } from './src/wattwaechter/api.js';
import {
  buildDevice,
  deviceExternalId,
  platformId,
  publishAll,
  PLATFORM_TYPE,
} from './src/devices/meter.js';
import { METER_WIDGET, buildMeterContent, runMeterAction } from './src/widgets.js';
import { t } from './src/wattwaechter/labels.js';

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
 * Run `task` on the one connection this process owns, and return its answer.
 *
 * THE RULE THIS ENFORCES
 * The WattWächter's Modbus server accepts at most TWO clients at a time and
 * keeps an idle connection for five minutes (manufacturer's Modbus TCP page).
 * One connection therefore belongs to this process and nothing else opens a
 * second one. An earlier version let the connection test build its own client,
 * and on a real device that attempt timed out after five seconds while the first
 * connection was still open — the third client was simply refused.
 *
 * A second trap sits right next to it, and this is why the retry exists: when
 * Gladys runs the integration in a container and that container is recreated,
 * the old connection survives on the device side until its idle timeout. The
 * first attempt after a restart can then hit a slot that is still occupied. One
 * deliberate retry on a fresh socket rides that out; anything beyond one retry
 * would just hammer the device.
 */
async function withConnection(task) {
  if (!modbus) {
    if (!(await connectDevice())) throw new Error('Keine Verbindung zum WattWächter');
  }
  try {
    return await task(modbus);
  } catch (err) {
    // The attempt may have run into the connection the device still holds open
    // from before. Drop ours and try once more from a clean socket.
    logger.warn(`Read failed (${err.message}) -> one retry on a fresh connection`);
    modbus?.transport?.reset();
    modbus = null;
    if (!(await connectDevice())) throw new Error('Keine Verbindung zum WattWächter');
    return await task(modbus);
  }
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
// Gladys ticks a polled device once a minute at most; the interval the user
// chose is applied by skipping ticks.
gladys.onPoll(async (polled) => {
  if (!modbus || !device) return;
  if (polled.external_id !== deviceExternalId(gladys, device)) return;
  if (Date.now() - lastRead < config.poll_frequency * 1000 - 30000) return;
  await refresh();
});

// --- Widget ------------------------------------------------------------------
// WITHOUT THESE TWO HANDLERS THE CARD SAYS "not implemented"
// A widget is not drawn by the integration: Gladys asks for its content and
// renders the answer itself. When nothing is registered for the widget key,
// Gladys gets the SDK's default answer to an unhandled message, and the card
// shows exactly that word. The content builder in src/widgets.js was written
// first and wired up second, so a real dashboard showed "not implemented" while
// every value beside it was correct.
//
// The key must match the `key` in the manifest's `widgets` field, and the id of
// a feature is built through the SDK's externalIds() like everywhere else.

/** The external id of the power feature, or null before the first read. */
function powerFeatureId() {
  if (!device) return null;
  return gladys.externalIds(PLATFORM_TYPE, platformId(device)).feature('power');
}

gladys.onWidgetGet(METER_WIDGET, async (settings = {}) => {
  // Pick up a fresh reading, so the tile is not a minute stale when it is opened.
  if (modbus && Date.now() - lastRead > 10000) await refresh().catch(() => {});
  return buildMeterContent({
    state,
    device,
    powerFeatureId: powerFeatureId(),
    settings,
    // The period totals need the REST API, which needs a read token. Without one
    // the four period buttons are left out rather than shown dead.
    apiEnabled: Boolean(api),
    t,
  });
});

gladys.onWidgetAction(METER_WIDGET, async (actionKey, params) => {
  return runMeterAction({ actionKey, params, t });
});

/**
 * Manifest action "Test the connection": the button in the Configuration
 * screen. It answers in words rather than only in the log, and it names the one
 * thing that is not obvious about this device: the Modbus server is off by
 * default and has to be switched on before anything can be read.
 *
 * It reads over the connection this process already owns. A client of its own
 * would be a second connection, and the device takes only two — with the poll's
 * connection sitting next to it, that second one was refused on a real device.
 */
gladys.onAction('test_connection', async () => {
  await readConfig().catch(() => {});
  try {
    const info = {};
    const readings = await withConnection(async (connection) => {
      // `info` is filled by connect(), so it is only set after a real connect.
      Object.assign(info, connection.info ?? {});
      return connection.readAll();
    });
    const power = readings.power ?? '?';
    logger.info(`Connection test: ${info.model} (${info.firmware}) at ${config.host}`);
    return {
      de: `Antwort: ${info.model}, Firmware ${info.firmware || 'unbekannt'}. ${Object.keys(readings).length} Messwerte, Leistung ${power} W.`,
      en: `Answered: ${info.model}, firmware ${info.firmware || 'unknown'}. ${Object.keys(readings).length} readings, power ${power} W.`,
      fr: `Réponse : ${info.model}, firmware ${info.firmware || 'inconnu'}. ${Object.keys(readings).length} mesures, puissance ${power} W.`,
      es: `Respuesta: ${info.model}, firmware ${info.firmware || 'desconocido'}. ${Object.keys(readings).length} medidas, potencia ${power} W.`,
    };
  } catch (err) {
    logger.error(`Connection test failed (${config.host}): ${err.message}`);
    return {
      de: `Keine verwertbare Antwort von ${config.host}: ${err.message}. Ist der Modbus-Server im Gerät eingeschaltet?`,
      en: `No usable answer from ${config.host}: ${err.message}. Is the Modbus server switched on in the device?`,
      fr: `Aucune réponse exploitable de ${config.host} : ${err.message}. Le serveur Modbus est-il activé dans l'appareil ?`,
      es: `Sin respuesta utilizable de ${config.host}: ${err.message}. ¿Está activado el servidor Modbus en el aparato?`,
    };
  }
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    await readConfig();
    if (await connectDevice()) await publishDevice();
    gladys.requestWidgetRefresh(METER_WIDGET);
  } catch (err) {
    logger.error('Post-connection initialization failed', err.message);
  }
});

gladys.onConfigUpdated(async (newConfig) => {
  config = normalizeConfig(newConfig);
  powerSide = 'normal';
  if (await connectDevice()) await publishDevice();
  gladys.requestWidgetRefresh(METER_WIDGET);
});

// --- Shutdown ----------------------------------------------------------------
gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  await modbus?.transport?.close().catch(() => {});
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the WattWächter integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err.message);
  process.exit(1);
});
