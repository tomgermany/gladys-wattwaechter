import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMqttMessages } from '../src/wattwaechter/mqtt.js';

test('publishes only confirmed OBIS readings with normalized topics', () => {
  const messages = buildMqttMessages({
    consumption: 123456,
    feed_in: 2345,
    power: -420,
    frequency: 50,
    voltage_l1: 231.4,
    current_l1: 2.1,
    power_l1: -140,
    power_l2: 99,
  });

  assert.deepEqual(messages, [
    { topic: 'wattwaechter/1-0-1.8.0', payload: '123.456' },
    { topic: 'wattwaechter/1-0-2.8.0', payload: '2.345' },
    { topic: 'wattwaechter/1-0-16.7.0', payload: '-420' },
    { topic: 'wattwaechter/1-0-14.7.0', payload: '50' },
    { topic: 'wattwaechter/1-0-32.7.0', payload: '231.4' },
    { topic: 'wattwaechter/1-0-31.7.0', payload: '2.1' },
    { topic: 'wattwaechter/1-0-21.7.0', payload: '-140' },
  ]);
});

test('supports a custom topic prefix and skips unavailable readings', () => {
  assert.deepEqual(
    buildMqttMessages({ power: 10, consumption: null }, '/test/site/'),
    [{ topic: 'test/site/1-0-16.7.0', payload: '10' }],
  );
});

test('returns no messages for missing state or an empty prefix', () => {
  assert.deepEqual(buildMqttMessages(null), []);
  assert.deepEqual(buildMqttMessages({ power: 10 }, '///'), []);
});
