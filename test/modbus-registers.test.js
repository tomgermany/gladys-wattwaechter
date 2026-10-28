import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTERS } from '../src/wattwaechter/modbus.js';

test('feed-in counter uses the WattWächter documented SunSpec registers', () => {
  const feedIn = COUNTERS.find((counter) => counter.key === 'feed_in');
  assert.ok(feedIn, 'feed_in counter must exist');
  assert.equal(feedIn.model203, 40108);
  assert.equal(feedIn.length203, 2);
  assert.equal(feedIn.scale203, 40124);
  assert.equal(feedIn.model213, 40237);
});

test('consumption counter keeps its documented register mapping', () => {
  const consumption = COUNTERS.find((counter) => counter.key === 'consumption');
  assert.ok(consumption, 'consumption counter must exist');
  assert.equal(consumption.model203, 40116);
  assert.equal(consumption.length203, 2);
  assert.equal(consumption.scale203, 40124);
  assert.equal(consumption.model213, 40245);
});
