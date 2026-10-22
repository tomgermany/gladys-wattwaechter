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
//
// THE ADDRESSES ARE THE DOCUMENTED ONES, ON THE WIRE, WITH NO OFFSET
// The vendor documentation is explicit: "Lies 2 Register ab Protokolladresse
// 40000". So the number it prints IS the protocol address to send. This file
// therefore sends the address as it stands.
//
// Two earlier versions got this wrong in opposite directions — subtracting 1,
// then subtracting 40000 — and a real device answered `Modbus exception 2`
// (illegal data address) for a documented register every time. The log line
// from that run reads `Modbus exception 2 for 40004 (asked for 40004, register
// 4)`, which is what pinned it down. The documentation also gives a self-test:
// reading two registers at 40000 must answer 21365 and 28243, which spells
// "SunS".
//
// TWO WAYS TO READ THE SAME NUMBER, AND WHY BOTH ARE HERE
//   Model 203: each reading is an int16, and a SEPARATE register holds its scale
//              factor. The value is raw * 10^scale.
//   Model 213: the same readings as IEEE-754 float32 over two registers, with
//              no scale factor at all. Only from firmware 1.2.1 on.
// Model 213 is preferred when it answers, because there is nothing to compute
// and nothing to get wrong. Model 203 stays as the fallback so an older device
// works too.
//
// THE SCALE FACTORS ARE PER GROUP, NOT ONE PER DEVICE
// Current has A_SF at 40076 (documented as -2, so 0.01 A), voltage has V_SF at
// 40085 (documented as -1, so 0.1 V), power has W_SF at 40092, frequency has
// Hz_SF at 40087. Using the current's factor for the voltage would scale every
// voltage by ten: the addresses alone cannot catch that, so each row below names
// its own scale register.
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

import { ModbusSocket } from './transport.js';

/**
 * The protocol address of the first register, as the device documents it.
 * Kept as a named constant so the self-test and any future offset question have
 * one place to look.
 */
export const SUNSPEC_BASE = 40000;

/** The two registers at 40000 must hold these, spelling "SunS" as text. */
export const SUNSPEC_ID = [21365, 28243];

/** A signed 16-bit register holding this value means "not available". */
export const NOT_AVAILABLE = -32768;

/**
 * The meter readings, as the device publishes them.
 *
 * `model203` is the address of the int16 value, `scale203` the address of its
 * OWN scale-factor register (see the note at the top), `model213` the address of
 * the float32 version. `unit` and `name` come from the device's own
 * /history/latest answer, so they are read from the device rather than invented.
 *
 * `key` is what the rest of the code uses. Treat it as permanent: it keys the
 * features in Gladys.
 */
export const READINGS = [
  // Power, the value the widget shows big. Positive means consumption,
  // negative means feed-in, which is the sign convention of the meter itself.
  // Scale register 40092 holds W_SF.
  { key: 'power', model203: 40088, scale203: 40092, model213: 40205, unit: 'W', name: 'Leistung' },
  { key: 'power_l1', model203: 40089, scale203: 40092, model213: 40207, unit: 'W', name: 'Leistung L1' },
  { key: 'power_l2', model203: 40090, scale203: 40092, model213: 40209, unit: 'W', name: 'Leistung L2' },
  { key: 'power_l3', model203: 40091, scale203: 40092, model213: 40211, unit: 'W', name: 'Leistung L3' },

  // Voltage per phase, with its own scale register 40085 (V_SF).
  { key: 'voltage_l1', model203: 40078, scale203: 40085, model213: 40189, unit: 'V', name: 'Spannung L1' },
  { key: 'voltage_l2', model203: 40079, scale203: 40085, model213: 40191, unit: 'V', name: 'Spannung L2' },
  { key: 'voltage_l3', model203: 40080, scale203: 40085, model213: 40193, unit: 'V', name: 'Spannung L3' },

  // Current per phase, with its own scale register 40076 (A_SF).
  { key: 'current_l1', model203: 40073, scale203: 40076, model213: 40181, unit: 'A', name: 'Strom L1' },
  { key: 'current_l2', model203: 40074, scale203: 40076, model213: 40183, unit: 'A', name: 'Strom L2' },
  { key: 'current_l3', model203: 40075, scale203: 40076, model213: 40185, unit: 'A', name: 'Strom L3' },

  // Grid frequency, with its own scale register 40087 (Hz_SF).
  { key: 'frequency', model203: 40086, scale203: 40087, model213: 40203, unit: 'Hz', name: 'Frequenz' },
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

/**
 * One Modbus TCP request, sent through the TCP transport.
 *
 * WHY THIS IS NOT AN HTTP CALL
 * Modbus TCP is a binary protocol on a plain socket: a 12-byte frame goes out,
 * a frame comes back. An HTTP request cannot carry it. An earlier version of
 * this file posted the frame to an HTTP URL and produced nothing but
 * `Failed to parse URL from 0,0,0,0,0,6,1,3,0,3,0,16` — the frame read as a URL
 * — before the mistake was found on a real device.
 *
 * `transport` is anything with `request(frame)`: the real `ModbusSocket`, or a
 * hand-written stand-in in the tests.
 */
class Connection {
  constructor(transport) {
    this.transport = transport;
  }

  /**
   * Read `count` registers starting at `address`, function code 0x03.
   *
   * An exception from the device is re-thrown with the register that actually
   * went on the wire: "illegal data address" is only diagnosable when the log
   * says which register was asked for. That line is what found the offset bug.
   */
  async readHolding(address, count, unitId = 1) {
    const frame = buildReadRequest(address, count, unitId);
    const wireAddress = frame[8] * 256 + frame[9];
    try {
      const bytes = await this.transport.request(frame);
      return parseReadAnswer(bytes, address, count);
    } catch (err) {
      throw new ModbusError(`${err.message} (asked for ${address}, on the wire ${wireAddress})`);
    }
  }
}

/**
 * Build the 12-byte Modbus TCP read request for function code 0x03.
 *
 * The address goes on the wire exactly as documented: no offset, no base to
 * subtract. See the note at the top of this file for the two rounds this cost.
 */
export function buildReadRequest(address, count, unitId = 1) {
  const frame = new Uint8Array(12);
  const view = new DataView(frame.buffer);
  view.setUint16(0, 0); // transaction id
  view.setUint16(2, 0); // protocol id
  view.setUint16(4, 6); // length: unit + function + 4 payload bytes
  frame[6] = unitId;
  frame[7] = 0x03; // read holding registers
  view.setUint16(8, address);
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
   * @param {object} [options.transport] anything with `request(frame)`; the real
   *   `ModbusSocket` is the default, and the tests pass a stand-in
   */
  constructor({ host, port = 502, timeoutMs = 5000, transport } = {}) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
    // The transport is the socket. Wiring it here, rather than reaching for
    // `fetch`, is what makes this a Modbus client and not an HTTP client.
    this.transport = transport ?? new ModbusSocket({ host, port, responseTimeoutMs: timeoutMs });
    this.connection = new Connection(this.transport);
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

  /**
   * The self-test the documentation describes: the first two registers must
   * spell "SunS". A cheap way to confirm the addressing before reading
   * anything else, and to say so clearly when it fails.
   */
  async checkSunSpecId() {
    const values = await this.connection.readHolding(SUNSPEC_BASE, 2);
    const ok = values[0] === SUNSPEC_ID[0] && values[1] === SUNSPEC_ID[1];
    if (!ok) throw new ModbusError(`Not a SunSpec map: 40000 answered ${values.join(', ')}`);
    return true;
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
