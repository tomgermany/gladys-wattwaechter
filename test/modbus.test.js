import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReadRequest,
  parseReadAnswer,
  toAcc32,
  toFloat32,
  round,
  NOT_AVAILABLE,
  SUNSPEC_BASE,
  WattwaechterModbus,
} from '../src/wattwaechter/modbus.js';

/** Build a Modbus answer frame for the given register values. */
function answer(values, unitId = 1) {
  const bytes = new Uint8Array(9 + values.length * 2);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0);
  view.setUint16(2, 0);
  view.setUint16(4, values.length * 2 + 3);
  bytes[6] = unitId;
  bytes[7] = 0x03;
  bytes[8] = values.length * 2;
  values.forEach((v, i) => view.setInt16(9 + i * 2, v));
  return bytes;
}

/** A fake transport: address -> register values. */
function fakeFetch(store, calls = []) {
  return async (frame) => {
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const offset = view.getUint16(8);
    const count = view.getUint16(10);
    const address = offset + SUNSPEC_BASE + 1;
    calls.push({ address, count });
    const values = store[address];
    if (!values) return { ok: false, status: 502, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, arrayBuffer: async () => answer(values.slice(0, count)).buffer };
  };
}

test('the read request is a well-formed Modbus TCP frame', () => {
  const frame = buildReadRequest(40073, 1);
  assert.equal(frame.length, 12);
  const view = new DataView(frame.buffer);
  assert.equal(view.getUint16(4), 6);
  assert.equal(frame[6], 1);
  assert.equal(frame[7], 0x03);
  // 40073 with the SunSpec base 40000 means offset 72.
  assert.equal(view.getUint16(8), 72);
  assert.equal(view.getUint16(10), 1);
});

test('an answer is parsed as big-endian signed registers', () => {
  assert.deepEqual(parseReadAnswer(answer([1234, -586]), 40073, 2), [1234, -586]);
});

test('a Modbus exception is reported with its code', () => {
  const bytes = new Uint8Array([0, 0, 0, 0, 0, 3, 1, 0x83, 0x02]);
  assert.throws(() => parseReadAnswer(bytes, 40177, 1), /Modbus exception 2/);
});

test('acc32 and float32 are assembled high word first', () => {
  assert.equal(toAcc32([0, 2511]), 2511);
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, 3.69);
  const view = new DataView(buffer);
  assert.equal(round(toFloat32(view.getUint16(0), view.getUint16(2))), 3.69);
});

test('the sentinel means not available and is filtered out', async () => {
  const store = { 40088: [NOT_AVAILABLE], 40092: [0] };
  const modbus = new WattwaechterModbus({ host: '1.2.3.4', fetch: fakeFetch(store) });
  const value = await modbus.readScaled({ key: 'power', model203: 40088, scale203: 40092 });
  assert.equal(value, null);
});

test('a scaled int16 is multiplied by ten to the scale factor', async () => {
  const store = { 40073: [123], 40076: [-2] };
  const modbus = new WattwaechterModbus({ host: '1.2.3.4', fetch: fakeFetch(store) });
  const value = await modbus.readScaled({ key: 'current_l1', model203: 40073, scale203: 40076 });
  assert.equal(value, 1.23);
});

test('the float model is detected and used when it answers', async () => {
  const store = {
    40004: [0x536d, 0x6172],
    40020: [0x5761, 0x7474],
    40044: [0x312e, 0x322e],
    40052: [0x4142, 0x4344],
    40177: [0x0000, 0x0000],
    40187: [0x4061, 0x47ae],
  };
  const modbus = new WattwaechterModbus({ host: '1.2.3.4', fetch: fakeFetch(store) });
  await modbus.connect();
  assert.equal(modbus.usesFloatModel, true);
  assert.equal(modbus.info.manufacturer, 'Smar');
  assert.equal(round(await modbus.readFloat(40187, 1)), 3.52);
});

test('a reading the device does not answer is skipped, not fatal', async () => {
  const store = { 40020: [0x5761, 0x7474] };
  const warns = [];
  const modbus = new WattwaechterModbus({ host: '1.2.3.4', fetch: fakeFetch(store) });
  modbus.warn = (what) => warns.push(what);
  const state = await modbus.readAll();
  assert.deepEqual(state, {});
  assert.ok(warns.length > 0, 'the skipped paths are reported');
});
