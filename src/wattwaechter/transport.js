// -----------------------------------------------------------------------------
// A raw TCP transport for Modbus.
//
// WHY THIS FILE EXISTS, SEPARATE FROM modbus.js
// Modbus TCP is a binary protocol over a plain TCP socket. It is NOT HTTP. So
// this file carries the socket and modbus.js carries the protocol. Keeping them
// apart means the register map and the frame parsing stay testable without
// opening a socket, and the socket stays replaceable.
//
// WHAT A MODBUS CLIENT ACTUALLY DOES
// It opens one TCP connection to the device on its Modbus port, sends a 12-byte
// request, reads the answer back, and keeps the connection open for the next
// question. Reconnecting per register would be slow and, on some devices,
// refused outright.
//
// HOW MANY CONNECTIONS A DEVICE WILL TAKE
// The WattWächter allows at most TWO Modbus clients at a time. Keeping one open
// for the poll is fine; leaving extra ones behind is not, because they eat the
// two slots.
//
// TWO WAYS TO GIVE A CONNECTION BACK, AND WHICH ONE TO USE
//   reset()  destroys the socket and returns AT ONCE. The handle is gone on our
//            side, but the device learns about it a moment later, when the FIN
//            arrives — so for a few milliseconds it still counts the slot as
//            taken. Fine for a recovery path that is about to open a new one
//            anyway; not fine when the next thing is another connect, because
//            that connect can land in the gap and be refused.
//   close()  ends the socket and WAITS for it to report 'close'. By then the
//            handle is really down, and the device has had the FIN. Use this
//            before opening a replacement.
// A real log is what separates them: `Meter ready` appeared twice, seven seconds
// apart, and the device reported two active connections afterwards.
//
// THE AWKWARD PART: KNOWING WHEN THE ANSWER ENDS
// A TCP stream has no message boundaries, so a single read may return half a
// frame, or two frames at once. The Modbus MBAP header solves this: its fifth
// and sixth bytes say how many bytes follow, so a complete frame is 6 + that
// length. The reader waits for the header, learns the length, then waits for the
// rest. That logic is the whole reason this file is longer than three lines.
//
// TIMEOUTS
// Two clocks: one for the connection, one per answer. A device that accepts the
// connection and then goes quiet would otherwise hang the poll forever.
// -----------------------------------------------------------------------------

import { connect as netConnect } from 'node:net';

export class TransportError extends Error {}

export class ModbusSocket {
  /**
   * @param {object} options
   * @param {string} options.host
   * @param {number} [options.port]
   * @param {number} [options.connectTimeoutMs]
   * @param {number} [options.responseTimeoutMs]
   * @param {Function} [options.socketFactory] injectable, for the tests
   */
  constructor({
    host,
    port = 502,
    connectTimeoutMs = 5000,
    responseTimeoutMs = 5000,
    socketFactory = netConnect,
  } = {}) {
    this.host = host;
    this.port = port;
    this.connectTimeoutMs = connectTimeoutMs;
    this.responseTimeoutMs = responseTimeoutMs;
    this.socketFactory = socketFactory;
    this.socket = null;
    // Modbus is strictly one question, one answer, so there is never more than
    // one request in flight.
    this.pending = null;
    this.buffered = Buffer.alloc(0);
  }

  /** True while a usable connection is open. */
  get isOpen() {
    return Boolean(this.socket && !this.socket.destroyed);
  }

  /** Open the connection if it is not open yet. Resolves when it is usable. */
  async open() {
    if (this.isOpen) return;
    this.socket = await new Promise((resolve, reject) => {
      const socket = this.socketFactory({ host: this.host, port: this.port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new TransportError(`Connection to ${this.host}:${this.port} timed out`));
      }, this.connectTimeoutMs);

      socket.once('connect', () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(new TransportError(`${this.host}:${this.port}: ${err.message}`));
      });
    });
    this.socket.on('data', (chunk) => this.onData(chunk));
    this.socket.on('error', (err) => this.fail(err));
    this.socket.on('close', () => this.fail(new TransportError('Connection closed')));
  }

  /** Send one request and resolve with its complete answer frame. */
  async request(frame) {
    await this.open();
    if (this.pending) throw new TransportError('A request is already in flight');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // A request that never answers leaves the connection in an unknown
        // state, so drop it: the next request then starts from a fresh socket
        // instead of inheriting the stuck one.
        this.fail(new TransportError(`No answer within ${this.responseTimeoutMs} ms`));
      }, this.responseTimeoutMs);

      this.pending = {
        resolve: (bytes) => {
          clearTimeout(timer);
          resolve(bytes);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      this.socket.write(frame);
    });
  }

  /**
   * Collect bytes until a whole Modbus frame is there.
   *
   * The MBAP header's length field counts the bytes that follow it, so a whole
   * frame is `6 + length` bytes. Anything beyond belongs to the next answer and
   * stays in the buffer.
   */
  onData(chunk) {
    this.buffered = Buffer.concat([this.buffered, chunk]);
    if (!this.pending) return;

    if (this.buffered.length < 6) return;
    const length = this.buffered.readUInt16BE(4);
    const total = 6 + length;
    if (this.buffered.length < total) return;

    const frame = this.buffered.subarray(0, total);
    this.buffered = this.buffered.subarray(total);
    const pending = this.pending;
    this.pending = null;
    pending.resolve(new Uint8Array(frame));
  }

  /**
   * Drop the connection on purpose, so the next request opens a fresh one.
   *
   * WHY THIS EXISTS
   * The WattWächter allows at most two Modbus clients at a time. A connection
   * left open after a read is not free: it eats one of those two slots, and the
   * connection test in the Configuration screen — which opens its own — is then
   * refused or times out.
   *
   * WHAT IT DOES NOT DO
   * It does not wait. `destroy()` returns immediately, and the device only frees
   * the slot once the FIN reaches it. Use `close()` when a new connection is
   * about to be opened; this one is for recovery paths where waiting would not
   * help anyway.
   */
  reset() {
    const socket = this.socket;
    this.socket = null;
    this.pending = null;
    this.buffered = Buffer.alloc(0);
    if (socket && !socket.destroyed) socket.destroy();
  }

  /** Reject whatever is waiting and drop the connection. */
  fail(err) {
    const pending = this.pending;
    this.pending = null;
    this.socket = null;
    if (!pending) return;
    pending.reject(err instanceof TransportError ? err : new TransportError(err.message));
  }

  /**
   * Close cleanly and WAIT for the handle to be down. Called before opening a
   * replacement, and on shutdown.
   *
   * WHY IT CANNOT SIMPLY AWAIT THE 'close' EVENT
   * A socket that is already destroyed — one that hit an error, or one `reset()`
   * has just thrown away — never fires 'close' again. Waiting on that event would
   * leave the promise pending forever, and the caller with it. So three cases are
   * separated:
   *   - nothing to close    -> return
   *   - already destroyed   -> return, the handle is down by definition
   *   - still open          -> end() and wait, with a short ceiling in case the
   *                           event never comes
   * The ceiling is a backstop, not the normal path: a healthy socket reports
   * 'close' within milliseconds.
   */
  async close() {
    const socket = this.socket;
    this.socket = null;
    this.pending = null;
    this.buffered = Buffer.alloc(0);

    if (!socket) return;
    // Already down: `reset()`, an error, or the other end hung up. Nothing to
    // signal, and no event will arrive.
    if (socket.destroyed) return;

    await new Promise((resolve) => {
      // Settled once, whichever comes first. `settle` guards against resolving
      // twice when both the event and the timer fire.
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(ceiling);
        resolve();
      };
      const ceiling = setTimeout(settle, 1000);
      socket.once('close', settle);
      socket.end();
    });
  }
}
