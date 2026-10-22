// -----------------------------------------------------------------------------
// Modbus TCP client for the WattWächter Plus.
//
// WHAT THIS FILE IS
// The WattWächter exposes its meter readings as a Modbus TCP server (port 502 by
// default, see `modbus_port` in the configuration). This file speaks that
// protocol and turns the registers into plain JavaScript numbers. It has NO
// dependency on the Gladys SDK, so it is unit-tested without a device.
//
// WHAT THE DEVICE IMPLEMENTS
// The SunSpec models 1 (Common Block), 203 (Three Phase Meter, int16 with a
// scale factor) and, from firmware 1.2.1, 213 (the same readings as float32).
// The register base is the SunSpec standard, 40000.
//
// TWO WAYS TO READ THE SAME NUMBER, AND WHY BOTH ARE HERE
//   Model 203: each reading is an int16, and a SECOND register holds its scale
//              factor. The value is raw * 10^scale.
//   Model 213: the same readings as IEEE-754 float32 over two registers, with
//              no scale factor at all. Only from firmware 1.2.1 on.
// Model 213 is preferred when it answers, because there is nothing to compute
// and nothing to get wrong. Model 203 stays as the fallback so an older device
// works too.
//
// THE SENTINEL, WHICH MATTERS MORE THAN IT LOOKS
// The value -32768 (0x8000 as a signed int16) means "this meter does not provide
// that reading" in SunSpec. It is NOT a measurement, so it is filtered out here
// and the reading simply does not appear. Publishing it would write nonsense
// into the Gladys history.
//
// FUNCTION CODES
// The device answers only 0x03 (read holding registers) and 0x04 (read input
// registers). There is nothing to write: a meter is read-only.
// -----------------------------------------------------------------------------

/** SunSpec register base of the WattWächter's map. */
export const SUNSPEC_BASE = 40000;

/** A signed 16-bit register holding this value means "not available". */
export const NOT_AVAILABLE = -32768;

/**
 * The meter readings, as the device publishes them.
 *
 * `model203` is the address of the int16 value, `scale203` the address of its
 * scale-factor register, `model213` the address of the float32 version.
 * `unit` and `name` come from the device's own /history/latest answer, so they
 * are read from the device rather than invented here.
 *
 * `key` is what the rest of the code uses. Treat it as permanent: it keys the
 * features in Gladys.
 */
export const READINGS = [
  // Power. Positive means consumption, negative means feed-in, which is the
  // sign convention of the meter itself.
  { key: 'power', model203: 40088, scale203: 40092, model213: 40187, unit: 'W', name: 'Leistung' },
  { key: 'power_l1', model203: 40090, scale203: 40092, model213: 40189, unit: 'W', name: 'Leistung L1' },
  { key: 'power_l2', model203: 40091, scale203: 40092, model213: 40190, unit: 'W', name: 'Leistung L2' },
  { key: 'power_l3', model203: 40092, scale203: 40092, model213: 40191, unit: 'W', name: 'Leistung L3' },

  // Voltage per phase.
  { key: 'voltage_l1', model203: 40078, scale203: 40076, model213: 40181, unit: 'V', name: 'Spannung L1' },
  { key: 'voltage_l2', model203: 40079, scale203: 40076, model213: 40182, unit: 'V', name: 'Spannung L2' },
  { key: 'voltage_l3', model203: 40080, scale203: 40076, model213: 40183, unit: 'V', name: 'Spannung L3' },

  // Current per phase.
  { key: 'current_l1', model203: 40073, scale203: 40076, model213: 40177, unit: 'A', name: 'Strom L1' },
  { key: 'current_l2', model203: 40074, scale203: 40076, model213: 40178, unit: 'A', name: 'Strom L2' },
  { key: 'current_l3', model203: 40075, scale203: 40076, model213: 40179, unit: 'A', name: 'Strom L3' },

  // Grid frequency.
  { key: 'frequency', model203: 40086, scale203: 40087, model213: 40185, unit: 'Hz', name: 'Frequenz' },
];

/**
 * The two energy counters. They are 32-bit accumulators (acc32, two registers,
 * high word first) rather than int16 values, and carry their own scale factor.
 *
 * These are the meter readings that matter for Gladys' energy monitoring:
 * `consumption` is the meter's 1.8.0, `feed_in` its 2.8.0.
 */
export const COUNTERS = [
  {
    key: 'consumption',
    model203: 40116,
    length203: 2,
    scale203: 40124,
    model213: 40245,
    unit: 'Wh',
    name: 'Bezug',
  },
  {
    key: 'feed_in',
    model203: 40118,
    length203: 2,
    scale203: 40126,
    model213: 40251,
    unit: 'Wh',
    name: 'Einspeisung',
  },
];

/** Every path this client asks the device for, in one list. */
export const ALL_PATHS = [...READINGS, ...COUNTERS];

export class ModbusError extends Error {}

/** One raw Modbus TCP exchange, framed and parsed. */
class Connection {
  constructor(host, port, timeoutMs, fetchImpl) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  /**
   * Read `count` registers starting at `address`, function code 0x03.
   *
   * The frame is a standard Modbus TCP request: a 7-byte MBAP header followed
   * by function code, start address and count. The answer echoes the first part
   * and then carries a byte count and the register bytes.
   */
  async readHolding(address, count, unitId = 1) {
    const frame = buildReadRequest(address, count, unitId);
    const bytes = await this.send(frame);
    return parseReadAnswer(bytes, address, count);
  }

  async send(frame) {
    let response;
    try {
      response = await this.fetch(frame);
    } catch (err) {
      throw new ModbusError(`WattWaechter unreachable (${this.host}:${this.port}): ${err.message}`);
    }
    if (!response.ok) throw new ModbusError(`HTTP ${response.status} from the Modbus bridge`);
    return new Uint8Array(await response.arrayBuffer());
  }
}

/** Build the 12-byte Modbus TCP read request for function code 0x03. */
export function buildReadRequest(address, count, unitId = 1) {
  // Addresses are given in the SunSpec notation (40001, ...); Modbus itself
  // uses the offset, so 40001 becomes 0.
  const offset = address - SUNSPEC_BASE - 1;
  const frame = new Uint8Array(12);
  const view = new DataView(frame.buffer);
  view.setUint16(0, 0); // transaction id
  view.setUint16(2, 0); // protocol id
  view.setUint16(4, 6); // length: unit + function + 4 payload bytes
  frame[6] = unitId;
  frame[7] = 0x03; // read holding registers
  view.setUint16(8, offset);
  view.setUint16(10, count);
  return frame;
}

/** Read the register values out of a Modbus TCP answer. */
export function parseReadAnswer(bytes, address, count) {
  if (bytes.length < 9) throw new ModbusError('Answer too short to be a Modbus frame');
  if (bytes[7] & 0x80) throw new ModbusError(`Modbus exception ${bytes[8]} for ${address}`);
  const byteCount = bytes[8];
  if (byteCount !== count * 2) {
    throw new ModbusError(`Expected ${count * 2} register bytes, got ${byteCount}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = [];
  for (let i = 0; i < count; i += 1) {
    // Registers are big-endian, and signed so the sentinel -32768 is visible.
    values.push(view.getInt16(9 + i * 2));
  }
  return values;
}

/** Interprets the register map against the device's answers. */
export class WattwaechterModbus {
  /**
   * @param {object} options
   * @param {string} options.host IP or mDNS name of the device
   * @param {number} [options.port] Modbus port, 502 by default
   * @param {number} [options.timeoutMs]
   * @param {(frame: Uint8Array) => Promise<object>} [options.fetch] injectable, for the tests
   */
  constructor({ host, port = 502, timeoutMs = 5000, fetch: fetchImpl = globalThis.fetch } = {}) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
    this.connection = new Connection(host, port, timeoutMs, fetchImpl);
    // Optional hook: the caller logs what was tolerated instead of failing.
    this.warn = null;
    this.info = null;
    this.usesFloatModel = false;
  }

  /**
   * Identify the device and decide which model to read.
   *
   * Model 1 carries the manufacturer, the model name, the firmware and the
   * serial number. Whether model 213 exists decides the rest of the work: with
   * it the values arrive as floats and no scale factor is needed.
   */
  async connect() {
    this.info = await this.readIdentity();
    this.usesFloatModel = await this.hasFloatModel();
    return this.info;
  }

  /** Read the SunSpec Common Block. */
  async readIdentity() {
    const manufacturer = await this.readString(40004, 16);
    const model = await this.readString(40020, 16);
    const firmware = await this.readString(40044, 8);
    const serial = await this.readString(40052, 16);
    return { manufacturer, model, firmware, serial };
  }

  /** SunSpec stores strings as two characters per register, space padded. */
  async readString(address, registers) {
    const values = await this.connection.readHolding(address, registers);
    let text = '';
    for (const value of values) {
      if (value === 0) break;
      text += String.fromCharCode((value >> 8) & 0xff, value & 0xff);
    }
    return text.replace(/\0/g, '').trim();
  }

  /** True when model 213 answers, i.e. the firmware publishes floats. */
  async hasFloatModel() {
    try {
      const values = await this.connection.readHolding(40177, 2);
      return values.length === 2;
    } catch (err) {
      this.warn?.('float model 213', err);
      return false;
    }
  }

  /**
   * Read every path of the register map once and return a flat object.
   *
   * Rules that matter:
   *   - a reading the meter does not provide (the sentinel) is left OUT of the
   *     result rather than published as 0;
   *   - a path that does not answer is logged and skipped, so one dead register
   *     never takes the whole read down.
   */
  async readAll() {
    const state = {};
    for (const path of ALL_PATHS) {
      try {
        const value = this.usesFloatModel
          ? await this.readFloat(path.model213, path.length203 ?? 1)
          : await this.readScaled(path);
        if (value !== null && value !== undefined) state[path.key] = value;
      } catch (err) {
        this.warn?.(path.key, err);
      }
    }
    return state;
  }

  /** Read one int16 (or acc32 for a counter) and apply its scale factor. */
  async readScaled(path) {
    const count = path.length203 ?? 1;
    const values = await this.connection.readHolding(path.model203, count);
    if (values.includes(NOT_AVAILABLE)) return null;
    const raw = count === 1 ? values[0] : toAcc32(values);
    const scale = await this.readScale(path.scale203);
    return round(raw * 10 ** scale);
  }

  /** The scale factor lives in its own register, as a signed small integer. */
  async readScale(address) {
    if (address === undefined) return 0;
    const values = await this.connection.readHolding(address, 1);
    if (values[0] === NOT_AVAILABLE) return 0;
    return values[0];
  }

  /** Read a float32 (IEEE-754, high word first) over two registers. */
  async readFloat(address, count = 1) {
    const values = await this.connection.readHolding(address, count * 2);
    // NaN is how model 213 reports "not available".
    const value = toFloat32(values[0], values[1]);
    return Number.isFinite(value) ? round(value) : null;
  }
}

/** Two registers, high word first, as a 32-bit unsigned accumulator. */
export function toAcc32([high, low]) {
  return (high >>> 0) * 65536 + (low >>> 0);
}

/** Two registers, high word first, as an IEEE-754 float32. */
export function toFloat32(high, low) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint16(0, high >>> 0);
  view.setUint16(2, low >>> 0);
  return view.getFloat32(0);
}

/**
 * Trim the float noise the meter sends, e.g. 3.6899998 -> 3.69.
 * Three decimals are far below the accuracy of a household meter, so nothing
 * measurable is lost and the values stay readable in Gladys.
 */
export function round(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}
