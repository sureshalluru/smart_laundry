/**
 * Audio feedback via the Web Audio API. Provides a short detection beep and a
 * longer, louder discrepancy alarm. All playback is suppressed while muted,
 * and any AudioContext failure (e.g. autoplay policy) degrades gracefully to
 * no sound so the caller's visual feedback still runs.
 *
 * @remarks Requirements 8.1, 8.2, 8.3, 8.4.
 */
export class AudioService {
  private ctx: AudioContext | null = null;
  private muted: boolean;

  constructor(options: { muted?: boolean } = {}) {
    this.muted = options.muted ?? false;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** Lazily create/resume the AudioContext; returns null if unavailable. */
  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** Play a single tone. Silently no-ops when muted or audio is unavailable. */
  private tone(frequency: number, durationMs: number, volume: number): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(volume, now);
      // brief fade-out to avoid clicks
      gain.gain.linearRampToValueAtTime(0.0001, now + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durationMs / 1000);
    } catch {
      // ignore — visual feedback still applies
    }
  }

  /** Short confirmation beep (< 200ms). Req 8.1. */
  playDetectionBeep(): void {
    this.tone(880, 120, 0.2);
  }

  /** Longer, louder alarm distinct from the beep (>= 1s). Req 8.2. */
  playDiscrepancyAlarm(): void {
    this.tone(300, 1000, 0.5);
  }
}
