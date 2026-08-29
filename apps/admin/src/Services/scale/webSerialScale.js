/**
 * Web Serial transport for a digital scale (scale-integration-bag-tags spec).
 *
 * Talks to a USB/serial bench scale via the Web Serial API (Chromium only).
 * The connection MUST be opened from a user gesture (browser requirement).
 * Each newline-delimited line is fed through the pure parseWeight() and the
 * resulting Reading is delivered to the caller's onReading callback.
 *
 * No React dependency — the useScale() hook wraps this.
 */

import { parseWeight } from './parseWeight';

export function isWebSerialSupported() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export class WebSerialScale {
  constructor({ baudRate = 9600 } = {}) {
    this.baudRate = baudRate;
    this.port = null;
    this.reader = null;
    this._keepReading = false;
    this._buffer = '';
  }

  get isConnected() {
    return !!this.port;
  }

  /**
   * Prompt the user to pick a serial port and open it. Must be called from a
   * click/tap handler. Returns true on success.
   *
   * @param {(reading: import('./scaleTypes').Reading) => void} onReading
   */
  async connect(onReading) {
    if (!isWebSerialSupported()) {
      throw new Error('Web Serial not supported in this browser');
    }
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: this.baudRate });
    this._keepReading = true;
    this._readLoop(onReading); // fire and forget
    return true;
  }

  async _readLoop(onReading) {
    const decoder = new TextDecoderStream();
    const readableClosed = this.port.readable.pipeTo(decoder.writable).catch(() => {});
    this.reader = decoder.readable.getReader();

    try {
      while (this._keepReading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (!value) continue;
        this._buffer += value;

        let idx;
        while ((idx = this._buffer.search(/[\r\n]/)) !== -1) {
          const line = this._buffer.slice(0, idx);
          this._buffer = this._buffer.slice(idx + 1);
          if (line.trim()) {
            try {
              onReading(parseWeight(line));
            } catch (_) {
              /* never let a bad callback kill the loop */
            }
          }
        }
      }
    } catch (_) {
      /* read error — treated as disconnect by caller via disconnect() */
    } finally {
      try { this.reader.releaseLock(); } catch (_) {}
      await readableClosed;
    }
  }

  async disconnect() {
    this._keepReading = false;
    try {
      if (this.reader) await this.reader.cancel();
    } catch (_) {}
    try {
      if (this.port) await this.port.close();
    } catch (_) {}
    this.reader = null;
    this.port = null;
    this._buffer = '';
  }
}
