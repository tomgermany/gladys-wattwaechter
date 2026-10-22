import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULT_CONFIG } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig keeps user values over the defaults', () => {
  const config = normalizeConfig({ host: '192.168.0.6', power_max: 4000 });
  assert.equal(config.host, '192.168.0.6');
  assert.equal(config.power_max, 4000);
});

test('normalizeConfig coerces numeric strings coming from a form', () => {
  const config = normalizeConfig({ modbus_port: '1502', poll_frequency: '120' });
  assert.equal(config.modbus_port, 1502);
  assert.equal(config.poll_frequency, 120);
});

test('normalizeConfig trims the host and the token', () => {
  const config = normalizeConfig({ host: '  192.168.0.6  ', read_token: ' abc123 ' });
  assert.equal(config.host, '192.168.0.6');
  assert.equal(config.read_token, 'abc123');
});

test('a negative lower power limit is accepted', () => {
  assert.equal(normalizeConfig({ power_min: -2500 }).power_min, -2500);
});
