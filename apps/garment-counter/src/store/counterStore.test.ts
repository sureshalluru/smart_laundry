import { createCounterStore, type StoreDeps } from './counterStore';
import { TransactionConflictError } from '../services/jetsonService';
import type { DetectionEvent } from '../types';

function makeDetection(clothId: number, clothType = 'shirts'): DetectionEvent {
  return {
    clothId,
    clothType,
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

/** Build injectable deps with sensible defaults; override per test. */
function makeDeps(overrides: {
  checkBeforeWash?: () => Promise<{ exists: boolean }>;
  startTransaction?: () => Promise<{ success: boolean }>;
  correctCloth?: () => Promise<{ success: boolean }>;
  getBeforeWashItems?: () => Promise<import('../types').DetectionEvent[]>;
} = {}): { deps: StoreDeps; audio: { beeps: number; muted: boolean } } {
  const audioState = { beeps: 0, muted: false };
  const audio = {
    playDetectionBeep: () => {
      audioState.beeps += 1;
    },
    playDiscrepancyAlarm: () => {},
    setMuted: (m: boolean) => {
      audioState.muted = m;
    },
    get isMuted() {
      return audioState.muted;
    },
  };

  const deps: StoreDeps = {
    makeEc2: () =>
      ({
        getLatestCloth: async () => null,
        correctCloth: overrides.correctCloth ?? (async () => ({ success: true })),
        moveCloth: async () => ({ mismatchResolved: true }),
        getTransactionItems: async () => [],
        getBeforeWashItems: overrides.getBeforeWashItems ?? (async () => []),
        checkBeforeWash:
          overrides.checkBeforeWash ?? (async () => ({ exists: true })),
      }) as never,
    makeJetson: () =>
      ({
        startTransaction:
          overrides.startTransaction ?? (async () => ({ success: true })),
        stopTransaction: async () => ({ success: true }),
      }) as never,
    audio,
    makePolling: () => ({ start: () => {}, stop: () => {} }),
  };

  return { deps, audio: audioState };
}

describe('counterStore', () => {
  beforeEach(() => {
    // ensure crypto.randomUUID exists in jsdom
    if (!('randomUUID' in crypto)) {
      (crypto as unknown as { randomUUID: () => string }).randomUUID = () =>
        '00000000-0000-4000-8000-000000000000';
    }
  });

  it('blocks starting a session without an order id (Req 6.1)', async () => {
    const { deps } = makeDeps();
    const store = createCounterStore(deps);
    const ok = await store.getState().startSession({
      transId: '',
      mode: 'Before Wash',
      operatorName: 'Jane',
    });
    expect(ok).toBe(false);
    expect(store.getState().session).toBeNull();
    expect(store.getState().startError).toMatch(/order/i);
  });

  it('blocks After Wash when no Before Wash exists (Req 4.3)', async () => {
    const { deps } = makeDeps({ checkBeforeWash: async () => ({ exists: false }) });
    const store = createCounterStore(deps);
    const ok = await store.getState().startSession({
      transId: 'T1',
      mode: 'After Wash',
      operatorName: 'Jane',
    });
    expect(ok).toBe(false);
    expect(store.getState().startError).toMatch(/before wash/i);
  });

  it('surfaces the 409 conflict message on start (Req 6.3)', async () => {
    const { deps } = makeDeps({
      startTransaction: async () => {
        throw new TransactionConflictError();
      },
    });
    const store = createCounterStore(deps);
    const ok = await store.getState().startSession({
      transId: 'T1',
      mode: 'Before Wash',
      operatorName: 'Jane',
    });
    expect(ok).toBe(false);
    expect(store.getState().startError).toMatch(/already running/i);
  });

  it('starts a session, tags detections with the session mode, and beeps', async () => {
    const { deps, audio } = makeDeps();
    const store = createCounterStore(deps);
    await store.getState().startSession({
      transId: 'T1',
      mode: 'After Wash',
      operatorName: 'Jane',
    });
    expect(store.getState().session?.isActive).toBe(true);

    store.getState().addDetection(makeDetection(1, 'shirts'));
    store.getState().addDetection(makeDetection(2, 'pants'));

    const items = store.getState().items;
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.washType === 'After Wash')).toBe(true);
    expect(store.getState().tallies.get('shirts')?.count).toBe(1);
    expect(audio.beeps).toBe(2);
  });

  it('correctCategory moves the item only after the backend confirms', async () => {
    const { deps } = makeDeps();
    const store = createCounterStore(deps);
    await store.getState().startSession({
      transId: 'T1',
      mode: 'Before Wash',
      operatorName: 'Jane',
    });
    store.getState().addDetection(makeDetection(1, 'shirts'));
    await store.getState().correctCategory(1, 'pants');

    expect(store.getState().tallies.get('shirts')?.count).toBe(0);
    expect(store.getState().tallies.get('pants')?.count).toBe(1);
    expect(store.getState().items[0].isModified).toBe(true);
  });

  it('toggleMute flips mute and propagates to the audio service', () => {
    const { deps, audio } = makeDeps();
    const store = createCounterStore(deps);
    expect(store.getState().settings.audioMuted).toBe(false);
    store.getState().toggleMute();
    expect(store.getState().settings.audioMuted).toBe(true);
    expect(audio.muted).toBe(true);
  });

  it('finalizeCount sets finalized and recomputes the comparison', async () => {
    const { deps } = makeDeps({
      getBeforeWashItems: async () => [makeDetection(101, 'shirts')],
    });
    const store = createCounterStore(deps);
    await store.getState().startSession({
      transId: 'ORD-1',
      mode: 'After Wash',
      operatorName: 'Jane',
    });
    expect(store.getState().finalized).toBe(false);
    store.getState().finalizeCount();
    expect(store.getState().finalized).toBe(true);
    // finalizing freezes ingestion so verified totals cannot shift
    expect(store.getState().paused).toBe(true);
    // before had 1 shirt, after has 0 -> a discrepancy row exists post-finalize
    const shirts = store.getState().discrepancies.find((d) => d.category === 'shirts');
    expect(shirts?.difference).toBe(-1);

    // detections after finalize are buffered, not applied to the totals
    store.getState().addDetection(makeDetection(9, 'shirts'));
    expect(store.getState().items).toHaveLength(0);
    expect(store.getState().pendingItems).toHaveLength(1);
  });

  it('After Wash computes discrepancies against the before-wash baseline', async () => {
    // Before Wash had 2 shirts; After Wash will get only 1 -> mismatch.
    const { deps } = makeDeps({
      getBeforeWashItems: async () => [
        makeDetection(101, 'shirts'),
        makeDetection(102, 'shirts'),
      ],
    });
    const store = createCounterStore(deps);
    await store.getState().startSession({
      transId: 'ORD-9',
      mode: 'After Wash',
      operatorName: 'Jane',
    });

    // one shirt counted after wash
    store.getState().addDetection(makeDetection(1, 'shirts'));

    const shirts = store
      .getState()
      .discrepancies.find((d) => d.category === 'shirts');
    expect(shirts).toBeDefined();
    expect(shirts?.beforeCount).toBe(2);
    expect(shirts?.afterCount).toBe(1);
    expect(shirts?.difference).toBe(-1);
  });

  it('pause buffers new detections; resume flushes them without loss', async () => {
    const { deps, audio } = makeDeps();
    const store = createCounterStore(deps);
    await store.getState().startSession({
      transId: 'T1',
      mode: 'Before Wash',
      operatorName: 'Jane',
    });

    store.getState().addDetection(makeDetection(1, 'shirts'));
    expect(store.getState().tallies.get('shirts')?.count).toBe(1);

    // Pause, then detections arrive — visible tally stays frozen, buffered.
    store.getState().togglePause();
    expect(store.getState().paused).toBe(true);
    const beepsBeforePause = audio.beeps;
    store.getState().addDetection(makeDetection(2, 'shirts'));
    store.getState().addDetection(makeDetection(3, 'pants'));

    expect(store.getState().items).toHaveLength(1); // still only the first
    expect(store.getState().pendingItems).toHaveLength(2);
    expect(store.getState().tallies.get('shirts')?.count).toBe(1);
    expect(audio.beeps).toBe(beepsBeforePause); // no beeps while paused

    // Resume flushes the buffered items in.
    store.getState().togglePause();
    expect(store.getState().paused).toBe(false);
    expect(store.getState().pendingItems).toHaveLength(0);
    expect(store.getState().items).toHaveLength(3);
    expect(store.getState().tallies.get('shirts')?.count).toBe(2);
    expect(store.getState().tallies.get('pants')?.count).toBe(1);
  });
});
