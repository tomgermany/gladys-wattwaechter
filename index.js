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
// on it.
//
// WHY A CONNECT IS NEVER STARTED TWICE
// `connected` and `onConfigUpdated` both call the connect path, and on a real
// restart both fire within seconds of each other. The log showed `Meter ready`
// twice, seven seconds apart, and the device reported two active connections
// afterwards. A build that is already running is therefore remembered in
// `connecting`, and a second caller WAITS for it instead of starting its own.
//
// WHY A CONNECT CLOSES BEFORE IT OPENS
// Giving the old socket back with `destroy()` returns at once, and the device
// only frees the slot when the FIN arrives — a few milliseconds later. A new
// connect landing in that gap finds both slots taken and times out. The connect
// path therefore uses `close()`, which waits for the socket to report down.
//
// WHY THE CONNECT PATH RECOGNISES A CONNECTION THAT IS STILL GOOD
// Two measured facts, from one morning of logs:
//   1. after a restart the device reported ONE connection — the gate above had
//      done its job;
//   2. pressing "Test the connection" took it to TWO.
// The test does not connect on its own. It calls `readConfig()`, and that round
// trip through Gladys gives the SDK the chance to deliver `onConfigUpdated` —
// which connects. The working connection was then torn down and rebuilt for
// nothing, and the second build sat on the second slot while the first was still
// closing.
// So connecting becomes idempotent: asking the device for its current values is
// worth doing, throwing away a working connection to do it is not.
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
import { METER_WIDGET, PERIOD_KEYS, buildMeterContent, runMeterAction } from './src/widgets.js';
import { t, KEY } from './src/wattwaechter/labels.js';
import { WattwaechterMqttPublisher } from './src/wattwaechter/mqtt.js';

const gladys = new GladysIntegration();
const mqttPublisher = new WattwaechterMqttPublisher({ logger });

// --- State of the running integration ----------------------------------------
let config = normalizeConfig(); // the user settings, re-read on every change
let modbus = null; // the Modbus connection, null while we have none
let api = null; // the REST client, used for the period totals
let state = null; // last readings
let device = null; // { host, serial, model, name }: the identity of the meter
let lastRead = 0; // when the readings were taken, to honour poll_frequency
let powerSide = 'normal'; // 'normal' | 'over' | 'under', see firePowerEvents()
// Last period result per widget settings; Gladys pulls the card again after an action.
const periodResults = new Map();

function widgetSettingsKey(settings) {
  return JSON.stringify(settings ?? {});
}

/**
 * The connect attempt running right now, or null.
 *
 * See the note at the top of this file: it exists so that the two handlers which
 * both connect on a restart do not each open their own connection.
 */
let connecting = null;

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
  mqttPublisher.configure(config);
  return config;
}

/**
 * Connect to the device, once at a time.
 *
 * THE GATE, AND WHY IT IS NOT IN `establish()`
 * A second caller while a build is running must not start a competing one — that
 * is the whole point. So the check and the promise live here, and only one
 * caller ever reaches `establish()`.
 *
 * `finally` clears the gate rather than a plain assignment after the await: if
 * the attempt throws, a gate left set would make every later caller wait on a
 * promise that has already settled, and the integration would never connect
 * again.
 */
async function connectDevice() {
  if (connecting) return connecting;

  connecting = establish();
  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

/**
 * Do the actual connect: give the old connection back, open a new one, read the
 * device once and keep what it answered.
 *
 * Resolves true on success. On failure the connection status carries the reason,
 * which is the text shown in the Configuration screen, and the log names the
 * register or the endpoint that failed.
 */
async function establish() {
  // KEEP A CONNECTION THAT IS STILL GOOD — see the note at the top of the file.
  //
  // `onConfigUpdated` calls this whenever Gladys re-delivers the settings, and
  // the connection test causes exactly that by reading them. Tearing a working
  // connection down to build an equivalent one is not a refresh; it is a second
  // client on a device that allows two, and the pair overlap while the old
  // socket closes.
  //
  // The conditions are deliberately narrow:
  //   - `isOpen` says there is still a live socket. A connection whose peer has
  //     gone, or one a failed read has already dropped, is NOT kept — those are
  //     the cases where a fresh build is genuinely needed, and skipping them
  //     would leave the integration talking to a dead handle.
  //   - the host and port must match. A configuration change that moves the
  //     device to another address has to reconnect; keeping the old socket would
  //     silently read the wrong meter.
  const sameTarget = Boolean(
    modbus && device && device.host === config.host && modbus.port === config.modbus_port,
  );
  if (modbus?.transport?.isOpen && sameTarget) {
    // Re-read the readings, which is the part that was actually wanted, and
    // leave the socket alone. A failed read here is logged and stepped over
    // rather than thrown: the connection is fine, one register is not.
    state = await modbus.readAll().catch((err) => {
      logger.warn(`Refresh on the existing connection failed: ${err.message}`);
      return state;
    });
    await gladys.setConnectionStatus(true);
    return true;
  }

  // Either there is no connection, or the one we hold is no longer usable, or it
  // points at a different device. Hand it back and WAIT for it to be down:
  // `destroy()` would return sooner, but the slot on the device is only free
  // once the FIN has arrived — and the connect below would otherwise land in
  // that gap.
  if (modbus) {
    await modbus.transport?.close?.().catch(() => {});
    modbus = null;
  }
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

    api = new WattwaechterApi({ host: config.host, token: config.read_token || '' });

    state = await modbus.readAll();
    mqttPublisher.updateState(state);
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
    modbus = null;
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
  mqttPublisher.updateState(state);
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
 * deliberate retry on a fresh connection rides that out; anything beyond one
 * retry would just hammer the device.
 *
 * WHY THE ORIGINAL ERROR IS CARRIED ALONG
 * When the retry fails as well, the error thrown here would otherwise say only
 * "no connection" — which is the symptom, not the cause. The error from the
 * first attempt is attached as `cause`, so a reader of the log sees what was
 * tried and why it broke.
 */
async function withConnection(task) {
  if (!modbus) {
    if (!(await connectDevice())) {
      throw new Error('Keine Verbindung zum WattWächter');
    }
  }
  try {
    return await task(modbus);
  } catch (err) {
    // The attempt may have run into the connection the device still holds open
    // from before. Drop ours and try once more from a fresh one — connectDevice
    // closes the old socket and waits, so the two slots are not both taken.
    logger.warn(`Read failed (${err.message}) -> one retry on a fresh connection`);
    modbus?.transport?.reset();
    modbus = null;
    if (!(await connectDevice())) {
      throw new Error('Keine Verbindung zum WattWächter nach einem zweiten Versuch', {
        cause: err,
      });
    }
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
// The key must match the `key` in the manifest's `widgets` field, and the ids are
// built through the SDK's externalIds() like everywhere else — never by hand, or
// the prefix check refuses the whole device.
//
// WHY TWO IDS AND NOT ONE
// The card shows two device-bound tiles: the live power and the meter index.
// Each needs the external id of its OWN feature, so both are built here and
// handed to the content builder. Building one and deriving the other by string
// surgery would break the day a feature key is renamed.

/** The external id of one feature of this device, or null before the first read. */
function featureId(key) {
  if (!device) return null;
  return gladys.externalIds(PLATFORM_TYPE, platformId(device)).feature(key);
}

gladys.onWidgetGet(METER_WIDGET, async ({ settings = {} } = {}) => {
  if (modbus && Date.now() - lastRead > 10000) await refresh().catch(() => {});

  const key = widgetSettingsKey(settings);
  let periods = periodResults.get(key) ?? {};
  if (api) {
    const wanted = PERIOD_KEYS.filter((period) => settings[`show_${period}`] !== false);
    const results = await Promise.all(wanted.map(async (period) => {
      try {
        return [period, await api.periodTotal(period)];
      } catch (err) {
        logger.warn(`Widget period read failed (${period}): ${err.message}`);
        return [period, periods[period] ?? null];
      }
    }));
    periods = { ...periods, ...Object.fromEntries(results.filter(([, value]) => value)) };
    periodResults.set(key, periods);
  }

  return buildMeterContent({
    state,
    device,
    powerFeatureId: featureId(KEY.POWER),
    indexFeatureId: featureId(KEY.CONSUMPTION),
    settings,
    periods,
    apiEnabled: Boolean(api),
    t,
  });
});

gladys.onWidgetAction(METER_WIDGET, async (actionKey, params, { settings = {} } = {}) => {
  if (!api) throw new Error('Die REST-API ist nicht verfügbar. Bitte Lesetoken und Verbindung prüfen.');
  try {
    const period = await api.periodTotal(String(params?.period ?? ''));
    periodResults.set(widgetSettingsKey(settings), { ...(periodResults.get(widgetSettingsKey(settings)) ?? {}), [period.period]: period });
    gladys.requestWidgetRefresh(METER_WIDGET);
    return runMeterAction({ actionKey, params, t });
  } catch (err) {
    logger.error(`Widget period read failed (${params?.period ?? 'unknown'}): ${err.message}`);
    return `Zeitraumwert konnte nicht gelesen werden: ${err.message}`;
  }
});

/**
 * Manifest action "Test the connection": the button in the Configuration
 * screen. It answers in words rather than only in the log, and it names the one
 * thing that is not obvious about this device: the Modbus server is off by
 * default and has to be switched on before anything can be read.
 *
 * It reads over the connection this process already owns. A client of its own
 * would be a second connection, and the device takes only two.
 *
 * WHY IT STILL READS THE CONFIGURATION
 * That round trip through Gladys is also what delivers settings the user may
 * have just saved, so it stays — and with it the `onConfigUpdated` it can
 * trigger. It is no longer harmful: `establish()` keeps an open connection to
 * the same device instead of rebuilding it, so that costs a read, not a slot.
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
// Both of these connect, and on a restart both fire within seconds. They are
// safe to call one after the other because connectDevice() lets the second
// caller wait for the attempt the first one started, and establish() keeps a
// connection that is already open to the same device.
//
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
  mqttPublisher.configure(config);
  powerSide = 'normal';
  if (await connectDevice()) await publishDevice();
  gladys.requestWidgetRefresh(METER_WIDGET);
});

// --- Shutdown ----------------------------------------------------------------
gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  mqttPublisher.close();
  await modbus?.transport?.close().catch(() => {});
  modbus = null;
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the WattWächter integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err.message);
  process.exit(1);
});
