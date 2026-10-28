import mqtt from 'mqtt';

// Only identifiers confirmed for the WattWächter readings are published here.
// Topic names follow the agreed convention: OBIS ':' becomes '-'.
export const MQTT_READINGS = [
  { key: 'consumption', obis: '1-0:1.8.0', divisor: 1000 }, // Wh -> kWh
  { key: 'feed_in', obis: '1-0:2.8.0', divisor: 1000 }, // Wh -> kWh
  { key: 'power', obis: '1-0:16.7.0', divisor: 1 }, // W
  { key: 'frequency', obis: '1-0:14.7.0', divisor: 1 }, // Hz
  { key: 'voltage_l1', obis: '1-0:32.7.0', divisor: 1 }, // V
  { key: 'current_l1', obis: '1-0:31.7.0', divisor: 1 }, // A
  { key: 'power_l1', obis: '1-0:21.7.0', divisor: 1 }, // W
];

export function buildMqttMessages(state, topicPrefix = 'wattwaechter') {
  if (!state || typeof state !== 'object') return [];
  const prefix = String(topicPrefix || 'wattwaechter')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!prefix) return [];

  return MQTT_READINGS.flatMap(({ key, obis, divisor }) => {
    const raw = state[key];
    if (raw === undefined || raw === null || !Number.isFinite(Number(raw))) return [];
    const topicObis = obis.replace(':', '-');
    const value = divisor === 1 ? Number(raw) : Number(raw) / divisor;
    return [{ topic: `${prefix}/${topicObis}`, payload: String(value) }];
  });
}

export class WattwaechterMqttPublisher {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.client = null;
    this.config = null;
    this.latestState = null;
    this.interval = null;
    this.lastPublish = 0;
    this.connectKey = '';
  }

  configure(config) {
    const enabled = config?.mqtt_enabled === true;
    const host = String(config?.mqtt_host ?? '').trim();
    const port = Number(config?.mqtt_port ?? 1883);
    const intervalMs = Number(config?.mqtt_interval ?? 60000);
    const prefix = String(config?.mqtt_topic_prefix ?? 'wattwaechter').trim() || 'wattwaechter';
    const valid = enabled && host && Number.isInteger(port) && port > 0 && port <= 65535;
    const key = valid
      ? JSON.stringify([host, port, config?.mqtt_tls === true, config?.mqtt_username ?? '', config?.mqtt_password ?? '', intervalMs, prefix])
      : '';

    this.config = { ...config, mqtt_host: host, mqtt_port: port, mqtt_interval: intervalMs, mqtt_topic_prefix: prefix };
    if (key === this.connectKey && (this.client || !key)) return;

    this.stopClient();
    this.connectKey = key;
    if (!valid) {
      if (enabled && (!host || !Number.isInteger(port) || port < 1 || port > 65535)) {
        this.logger.warn('MQTT publishing is enabled but broker address or port is invalid; publishing remains stopped.');
      }
      return;
    }

    const protocol = config.mqtt_tls === true ? 'mqtts' : 'mqtt';
    const options = {
      port,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 5000,
      clientId: `wattwaechter-${process.pid}`,
    };
    if (config.mqtt_username) options.username = config.mqtt_username;
    if (config.mqtt_password) options.password = config.mqtt_password;

    this.client = mqtt.connect(`${protocol}://${host}:${port}`, options);
    this.client.on('connect', () => {
      this.logger.info('MQTT broker connected; WattWächter publishing is ready.');
      this.publishLatest();
    });
    this.client.on('reconnect', () => this.logger.info('MQTT broker reconnecting.'));
    this.client.on('error', (err) => {
      // Do not log broker URLs or configuration: they can contain sensitive details.
      this.logger.warn(`MQTT connection error: ${err.code || err.name || 'unknown error'}`);
    });
    this.interval = setInterval(() => this.publishLatest(), Math.max(1000, intervalMs));
    this.interval.unref?.();
  }

  updateState(state) {
    this.latestState = state && typeof state === 'object' ? { ...state } : null;
  }

  publishLatest() {
    if (!this.client?.connected || !this.latestState || !this.config?.mqtt_enabled) return;
    const messages = buildMqttMessages(this.latestState, this.config.mqtt_topic_prefix);
    for (const message of messages) {
      this.client.publish(message.topic, message.payload, { qos: 0, retain: true }, (err) => {
        if (err) this.logger.warn(`MQTT publish failed for ${message.topic}: ${err.code || err.name || 'error'}`);
      });
    }
  }

  stopClient() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    if (this.client) {
      const oldClient = this.client;
      this.client = null;
      oldClient.end(true);
    }
  }

  close() {
    this.connectKey = '';
    this.stopClient();
  }
}
