import type { DetectionEvent, WashMode } from '../types';
import { normalizeDetection } from '../lib/normalizeDetection';
import { normalizeBaseUrl } from '../lib/jetsonUrl';

export interface EC2ServiceOptions {
  /** Base URL of the EC2 backend, e.g. "http://54.209.208.218:8000". */
  baseUrl: string;
  /** Injected fetch (defaults to global fetch); simplifies testing. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

export interface MoveClothResult {
  mismatchResolved: boolean;
  newStatus?: string;
}

export interface TransactionSummary {
  transId: string;
  uniqId: string;
  type: string;
  operatorName: string;
  date: string;
}

/** Per-order rollup for the dashboard: Before/After totals + mismatch flag. */
export interface OrderSummary {
  transId: string;
  operatorName: string;
  date: string;
  beforeTotal: number;
  afterTotal: number;
  beforeByCategory: Record<string, number>;
  afterByCategory: Record<string, number>;
  hasBefore: boolean;
  hasAfter: boolean;
  mismatch: boolean;
}

/**
 * Client for the EC2 backend: detection polling, corrections, cloth counts,
 * Before-Wash checks, and history (Req 11.3). All detection payloads pass
 * through {@link normalizeDetection} so callers only ever see the normalized
 * {@link DetectionEvent} shape.
 */
export class EC2Service {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: EC2ServiceOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    // Bind to the global so native fetch keeps its `this`; calling it as a
    // class method otherwise throws "Illegal invocation" in the browser.
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private async request(
    path: string,
    init: RequestInit,
    externalSignal?: AbortSignal,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    try {
      return await this.fetchImpl(this.url(path), { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Poll `GET /single_cloth/` for the latest detection. Returns the normalized
   * event, or `null` when the payload is empty or malformed (the caller skips
   * the cycle without crashing).
   *
   * @remarks Requirements 2.3, 10.2.
   */
  async getLatestCloth(signal?: AbortSignal): Promise<DetectionEvent | null> {
    const res = await this.request('/single_cloth/', { method: 'GET' }, signal);
    if (!res.ok) {
      throw new Error(`getLatestCloth failed with HTTP ${res.status}`);
    }
    const data = await res.json().catch(() => null);
    return normalizeDetection(data);
  }

  /**
   * Correct the most-recent cloth's category via `POST /single_cloth/`.
   *
   * @remarks Requirement 3.2.
   */
  async correctCloth(params: {
    clothId: number;
    category: string;
  }): Promise<{ success: boolean }> {
    const res = await this.request('/single_cloth/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloth_id: params.clothId, category: params.category }),
    });
    if (!res.ok) {
      throw new Error(`correctCloth failed with HTTP ${res.status}`);
    }
    return { success: true };
  }

  /**
   * Move a cloth to a different category via `POST /move_cloth/` (discrepancy
   * resolution). Returns the resolution outcome reported by the backend.
   *
   * @remarks Requirements 3.4, 5.5, 5.6.
   */
  async moveCloth(params: {
    clothId: number;
    targetCategory: string;
    transId: string;
  }): Promise<MoveClothResult> {
    const res = await this.request('/move_cloth/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cloth_id: params.clothId,
        target_category: params.targetCategory,
        trans_id: params.transId,
      }),
    });
    if (!res.ok) {
      throw new Error(`moveCloth failed with HTTP ${res.status}`);
    }
    const data = (await res.json().catch(() => ({}))) as {
      mismatch_resolved?: boolean;
      new_status?: string;
    };
    return {
      mismatchResolved: data.mismatch_resolved === true,
      newStatus: data.new_status,
    };
  }

  /**
   * Fetch all items for a session via
   * `GET /cloth_count/single_transaction/?uniq_id=X`, normalizing each row and
   * dropping any malformed entries.
   *
   * @remarks Requirement 5.2.
   */
  async getTransactionItems(uniqId: string): Promise<DetectionEvent[]> {
    const qs = new URLSearchParams({ uniq_id: uniqId });
    const res = await this.request(
      `/cloth_count/single_transaction/?${qs.toString()}`,
      { method: 'GET' },
    );
    if (!res.ok) {
      throw new Error(`getTransactionItems failed with HTTP ${res.status}`);
    }
    const data = await res.json().catch(() => null);
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((row) => normalizeDetection(row))
      .filter((e): e is DetectionEvent => e !== null);
  }

  /**
   * Fetch the Before Wash items for an order via
   * `GET /cloth_count/before_wash/?trans_id=X`. Used to build the comparison
   * baseline when running After Wash (the iPad knows the order id but not the
   * prior Before Wash session's uniq_id, so this resolves it server-side).
   *
   * @remarks Requirements 4.6, 5.2.
   */
  async getBeforeWashItems(transId: string): Promise<DetectionEvent[]> {
    const qs = new URLSearchParams({ trans_id: transId });
    const res = await this.request(
      `/cloth_count/before_wash/?${qs.toString()}`,
      { method: 'GET' },
    );
    if (!res.ok) {
      throw new Error(`getBeforeWashItems failed with HTTP ${res.status}`);
    }
    const data = await res.json().catch(() => null);
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((row) => normalizeDetection(row))
      .filter((e): e is DetectionEvent => e !== null);
  }

  /**
   * Check whether a "Before Wash" transaction exists for an order via
   * `GET /transaction/check/{trans_id}/`.
   *
   * @remarks Requirement 4.2.
   */
  async checkBeforeWash(transId: string): Promise<{ exists: boolean }> {
    const res = await this.request(
      `/transaction/check/${encodeURIComponent(transId)}/`,
      { method: 'GET' },
    );
    if (!res.ok) {
      throw new Error(`checkBeforeWash failed with HTTP ${res.status}`);
    }
    const data = (await res.json().catch(() => ({}))) as {
      exists?: boolean;
      before_wash_exists?: boolean;
    };
    return { exists: data.exists === true || data.before_wash_exists === true };
  }

  /**
   * Fetch the per-order dashboard summary via `GET /orders/summary/`: Before
   * and After Wash totals per category plus a mismatch flag for each order.
   */
  async getOrdersSummary(): Promise<OrderSummary[]> {
    const res = await this.request('/orders/summary/', { method: 'GET' });
    if (!res.ok) {
      throw new Error(`getOrdersSummary failed with HTTP ${res.status}`);
    }
    const data = await res.json().catch(() => null);
    const rows = Array.isArray(data) ? data : [];
    return rows.map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      return {
        transId: String(r.trans_id ?? ''),
        operatorName: String(r.operator_name ?? ''),
        date: String(r.date ?? ''),
        beforeTotal: Number(r.before_total ?? 0),
        afterTotal: Number(r.after_total ?? 0),
        beforeByCategory: (r.before_by_category as Record<string, number>) ?? {},
        afterByCategory: (r.after_by_category as Record<string, number>) ?? {},
        hasBefore: r.has_before === true,
        hasAfter: r.has_after === true,
        mismatch: r.mismatch === true,
      } satisfies OrderSummary;
    });
  }

  /**
   * Fetch transaction history for an operator. Returns a loosely-typed summary
   * list; the History screen renders these read-only.
   *
   * @remarks Requirement 11.3.
   */
  async getTransactionHistory(operatorName: string): Promise<TransactionSummary[]> {
    const qs = new URLSearchParams({ operator_name: operatorName });
    const res = await this.request(`/transaction/history/?${qs.toString()}`, {
      method: 'GET',
    });
    if (!res.ok) {
      throw new Error(`getTransactionHistory failed with HTTP ${res.status}`);
    }
    const data = await res.json().catch(() => null);
    const rows = Array.isArray(data) ? data : [];
    return rows.map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      return {
        transId: String(r.trans_id ?? ''),
        uniqId: String(r.uniq_id ?? ''),
        type: String(r.type ?? r.wash_type ?? ''),
        operatorName: String(r.operator_name ?? ''),
        date: String(r.date ?? ''),
      } satisfies TransactionSummary;
    });
  }
}

export type { WashMode };
