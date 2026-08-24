import { PollingService, DEFAULT_POLL_INTERVAL_MS } from './pollingService';
import type { DetectionEvent } from '../types';

function makeDetection(clothId: number): DetectionEvent {
  return {
    clothId,
    clothType: 'shirts',
    filePath: 'p',
    date: '2026-01-01T00:00:00.000Z',
    isModified: false,
    washType: 'Before Wash',
    transId: 'T1',
    operatorName: 'op',
    uniqId: 'u1',
    status: 'ok',
  };
}

describe('PollingService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls at the 500ms cadence while running and stops cleanly', async () => {
    const getLatestCloth = vi.fn(async () => null);
    const svc = new PollingService({ ec2: { getLatestCloth } });
    expect(DEFAULT_POLL_INTERVAL_MS).toBe(500);

    svc.start();
    expect(svc.isRunning).toBe(true);
    // Each interval kicks off a poll; await async resolution between ticks.
    await vi.advanceTimersByTimeAsync(500 * 3);
    expect(getLatestCloth).toHaveBeenCalledTimes(3);

    svc.stop();
    expect(svc.isRunning).toBe(false);
    await vi.advanceTimersByTimeAsync(500 * 3);
    expect(getLatestCloth).toHaveBeenCalledTimes(3); // no more after stop
  });

  it('emits onDetection only for new (strictly increasing) cloth ids', async () => {
    const responses = [
      makeDetection(1),
      makeDetection(1), // duplicate — not new
      makeDetection(3), // new
      makeDetection(2), // older — not new
    ];
    let i = 0;
    const getLatestCloth = vi.fn(async () => responses[i++] ?? null);
    const seen: number[] = [];
    const svc = new PollingService({
      ec2: { getLatestCloth },
      onDetection: (e) => seen.push(e.clothId),
    });

    svc.start();
    await vi.advanceTimersByTimeAsync(500 * responses.length);
    svc.stop();
    expect(seen).toEqual([1, 3]);
  });

  it('fires onConnectionChange on reachability transitions', async () => {
    let ok = true;
    const getLatestCloth = vi.fn(async () => {
      if (!ok) throw new Error('network');
      return null;
    });
    const changes: boolean[] = [];
    const svc = new PollingService({
      ec2: { getLatestCloth },
      onConnectionChange: (c) => changes.push(c),
    });

    svc.start();
    await vi.advanceTimersByTimeAsync(500);
    ok = false;
    await vi.advanceTimersByTimeAsync(500);
    ok = true;
    await vi.advanceTimersByTimeAsync(500);
    svc.stop();

    expect(changes).toEqual([true, false, true]);
  });
});
