import type { DetectionEvent } from '../types';
import type { EC2Service } from './ec2Service';
import { DetectionDeduper } from '../lib/detectionDedup';

export const DEFAULT_POLL_INTERVAL_MS = 500;

export interface PollingCallbacks {
  /** Fired once per new detection (strictly increasing cloth_id). */
  onDetection?: (event: DetectionEvent) => void;
  /** Fired when a poll cycle throws. */
  onError?: (error: unknown) => void;
  /** Fired when EC2 reachability changes (true = reachable). */
  onConnectionChange?: (connected: boolean) => void;
}

export interface PollingServiceOptions extends PollingCallbacks {
  ec2: Pick<EC2Service, 'getLatestCloth'>;
  intervalMs?: number;
  /** Injected timers (defaults to global) for testability with fake timers. */
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
  /** Seed the highest-seen cloth_id, e.g. when resuming a session. */
  initialHighestClothId?: number;
}

/**
 * Polls the EC2 `/single_cloth/` endpoint on a fixed cadence while running.
 *
 * - Emits `onDetection` only for new detections (via {@link DetectionDeduper}),
 *   so duplicates and offline-gap catch-up are handled correctly (Req 1.1,
 *   2.2, 9.3).
 * - Tracks EC2 reachability and fires `onConnectionChange` on transitions,
 *   driving the "Cloud" indicator (Req 10.2).
 * - Uses an `AbortController` so stopping the session cancels the in-flight
 *   request immediately, and never overlaps poll cycles.
 * - Stops polling entirely when no session is active (Req 2.6).
 *
 * @remarks Requirements 2.1, 2.6, 9.3, 10.2.
 */
export class PollingService {
  private readonly ec2: Pick<EC2Service, 'getLatestCloth'>;
  private readonly intervalMs: number;
  private readonly callbacks: PollingCallbacks;
  private readonly setIntervalImpl: typeof setInterval;
  private readonly clearIntervalImpl: typeof clearInterval;

  private deduper: DetectionDeduper;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private abortController: AbortController | null = null;
  private inFlight = false;
  private lastConnected: boolean | null = null;

  constructor(options: PollingServiceOptions) {
    this.ec2 = options.ec2;
    this.intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.callbacks = {
      onDetection: options.onDetection,
      onError: options.onError,
      onConnectionChange: options.onConnectionChange,
    };
    // Bind to the global so native timers keep their `this`; calling them as
    // class methods otherwise throws "Illegal invocation" in the browser.
    this.setIntervalImpl = options.setIntervalImpl ?? globalThis.setInterval.bind(globalThis);
    this.clearIntervalImpl =
      options.clearIntervalImpl ?? globalThis.clearInterval.bind(globalThis);
    this.deduper = new DetectionDeduper(
      options.initialHighestClothId ?? Number.NEGATIVE_INFINITY,
    );
  }

  get isRunning(): boolean {
    return this.timerId !== null;
  }

  /** Highest cloth_id seen so far (for resuming/session persistence). */
  get highestClothId(): number {
    return this.deduper.highest;
  }

  /** Begin polling. No-op if already running. */
  start(): void {
    if (this.timerId !== null) return;
    this.timerId = this.setIntervalImpl(() => {
      void this.pollOnce();
    }, this.intervalMs);
  }

  /** Stop polling and cancel any in-flight request. */
  stop(): void {
    if (this.timerId !== null) {
      this.clearIntervalImpl(this.timerId);
      this.timerId = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.inFlight = false;
  }

  private setConnected(connected: boolean): void {
    if (this.lastConnected !== connected) {
      this.lastConnected = connected;
      this.callbacks.onConnectionChange?.(connected);
    }
  }

  /** Run a single poll cycle. Skips if a previous cycle is still in flight. */
  private async pollOnce(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    this.abortController = new AbortController();
    try {
      const event = await this.ec2.getLatestCloth(this.abortController.signal);
      this.setConnected(true);
      if (event && this.deduper.accept(event.clothId)) {
        this.callbacks.onDetection?.(event);
      }
    } catch (error) {
      this.setConnected(false);
      this.callbacks.onError?.(error);
    } finally {
      this.inFlight = false;
      this.abortController = null;
    }
  }
}
