import type { WashMode } from '../types';
import {
  buildStartTransactionUrl,
  buildStopTransactionBody,
  normalizeBaseUrl,
  type StartTransactionParams,
} from '../lib/jetsonUrl';

/**
 * Error thrown when the Jetson reports a conflicting transaction (HTTP 409):
 * another transaction is already running on the camera system.
 *
 * @remarks Requirement 6.3.
 */
export class TransactionConflictError extends Error {
  constructor(message = 'Another transaction is already running on the camera system') {
    super(message);
    this.name = 'TransactionConflictError';
  }
}

export interface JetsonServiceOptions {
  /** Base URL of the Jetson device, e.g. "http://192.168.1.100:8000". */
  baseUrl: string;
  /** Injected fetch (defaults to global fetch); simplifies testing. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

/**
 * Client for the Jetson device. Handles only starting/stopping transactions
 * and a lightweight health check over the local network (Req 11.2).
 */
export class JetsonService {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: JetsonServiceOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    // Bind to the global so native fetch keeps its `this`; calling it as a
    // class method otherwise throws "Illegal invocation" in the browser.
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  private withTimeout(signal?: AbortSignal): {
    signal: AbortSignal;
    cancel: () => void;
  } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return { signal: controller.signal, cancel: () => clearTimeout(timer) };
  }

  /**
   * Start a counting transaction via `GET /transaction/`.
   *
   * @throws {TransactionConflictError} when the device responds 409.
   * @remarks Requirements 6.2, 6.3.
   */
  async startTransaction(params: {
    transId: string;
    type: WashMode;
    operatorName: string;
    uniqId: string;
    date: string;
    cam?: string;
  }): Promise<{ success: boolean }> {
    const urlParams: StartTransactionParams = {
      transId: params.transId,
      type: params.type,
      operatorName: params.operatorName,
      uniqId: params.uniqId,
      date: params.date,
      cam: params.cam,
    };
    const url = buildStartTransactionUrl(this.baseUrl, urlParams);

    const { signal, cancel } = this.withTimeout();
    try {
      const res = await this.fetchImpl(url, { method: 'GET', signal });
      if (res.status === 409) {
        throw new TransactionConflictError();
      }
      if (!res.ok) {
        throw new Error(`Jetson start failed with HTTP ${res.status}`);
      }
      return { success: true };
    } finally {
      cancel();
    }
  }

  /**
   * Stop the active transaction via `POST /transaction/` with a form body of
   * `{ status: "0", uniq_id }`.
   *
   * @remarks Requirement 6.5.
   */
  async stopTransaction(params: { uniqId: string }): Promise<{ success: boolean }> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/transaction/`;
    const body = buildStopTransactionBody(params.uniqId);

    const { signal, cancel } = this.withTimeout();
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal,
      });
      if (!res.ok) {
        throw new Error(`Jetson stop failed with HTTP ${res.status}`);
      }
      return { success: true };
    } finally {
      cancel();
    }
  }

  /**
   * Lightweight reachability probe used to drive the "Camera" indicator.
   * Resolves `true` if the device responds at all, `false` on any error.
   *
   * @remarks Requirement 10.3.
   */
  async healthCheck(): Promise<boolean> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/`;
    const { signal, cancel } = this.withTimeout();
    try {
      await this.fetchImpl(url, { method: 'GET', signal });
      return true;
    } catch {
      return false;
    } finally {
      cancel();
    }
  }
}
