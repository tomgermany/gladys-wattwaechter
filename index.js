// -----------------------------------------------------------------------------
// Entry point ("wiring"): this file connects the pieces, it holds no logic.
//
// WHAT THIS FILE DOES
// It creates the SDK connection to Gladys, registers the handlers Gladys will
// call, and starts the container. Everything else lives in src/:
//   src/wattwaechter/modbus.js  the Modbus TCP client and the register map
//   src/wattwaechter/api.js     the REST API client (history periods)
//   src/devices/meter.js        the meter as a Gladys device
//   src/widgets.js              the dashboard tile
//   src/scenes.js               the trigger and the scene actions
//   src/config.js               defaults and normalisation of the user settings
//
// THE ONE ORDERING RULE
// Every handler is registered BEFORE `gladys.connect()`. Gladys may send a
// message the moment the connection opens — a scan, a command, a config read —
// and a handler registered after that point would simply miss it.
//
// SDK: @gladysassistant/integration-sdk ^0.15 (Gladys >= 5.1.0).
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';

const gladys = new GladysIntegration();

let config = normalizeConfig();

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

gladys.on('connected', async () => {
  try {
    await readConfig();
    if (!config.host) await gladys.setConnectionStatus(false, NO_HOST);
  } catch (err) {
    logger.error('Post-connection initialization failed', err.message);
  }
});

gladys.onConfigUpdated(async (newConfig) => {
  config = normalizeConfig(newConfig);
  logger.info(`Configuration updated (host: ${config.host || 'none'})`);
});

gladys.handleShutdown((signal) => logger.info(`Received ${signal} -> graceful shutdown`));

logger.info('Starting the WattWächter integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err.message);
  process.exit(1);
});
