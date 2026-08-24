import fc from 'fast-check';
import { AudioService } from './audioService';
import { aggregateTallies } from '../lib/tally';
import { buildComparisons, shouldAlert } from '../lib/discrepancy';
import type { CategoryTally, DetectionEvent } from '../types';

const CATEGORY_POOL = ['shirts', 'pants', 'towels'];

function makeDetection(clothId: number, clothType: string): DetectionEvent {
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

/**
 * Simulate processing an event stream: aggregate a tally, decide whether to
 * alert, and fire audio for each detection + the alarm if an alert triggers.
 * Returns the resulting visual state (tallies snapshot + alert flag).
 */
function processStream(
  events: DetectionEvent[],
  before: Map<string, CategoryTally>,
  audio: AudioService,
): { tallies: Array<[string, number]>; alert: boolean } {
  const after = aggregateTallies(events);
  for (const _event of events) {
    void _event;
    audio.playDetectionBeep();
  }
  const comparisons = buildComparisons(before, after);
  const alert = shouldAlert(comparisons);
  if (alert) {
    audio.playDiscrepancyAlarm();
  }
  const talliesSnapshot = [...after.entries()]
    .map(([cat, t]) => [cat, t.count] as [string, number])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return { tallies: talliesSnapshot, alert };
}

// Feature: realtime-garment-counter-ipad, Property 10: Mute suppresses audio
// only — For any stream of detection and discrepancy events processed while
// muted, the audio service is never invoked, yet the resulting tallies and
// visual state are identical to processing the same stream while unmuted.
// Validates: Requirements 8.4
describe('Property 10: Mute suppresses audio only', () => {
  const streamArb = fc
    .array(fc.constantFrom(...CATEGORY_POOL), { maxLength: 40 })
    .map((cats) => cats.map((c, i) => makeDetection(i + 1, c)));

  const beforeArb: fc.Arbitrary<Map<string, CategoryTally>> = fc
    .array(fc.tuple(fc.constantFrom(...CATEGORY_POOL), fc.nat({ max: 20 })), {
      maxLength: 3,
    })
    .map((pairs) => {
      const m = new Map<string, CategoryTally>();
      for (const [cat, count] of pairs) m.set(cat, { category: cat, count, items: [] });
      return m;
    });

  it('muted produces identical visual state but zero audio calls', () => {
    fc.assert(
      fc.property(streamArb, beforeArb, (events, before) => {
        // Unmuted run — count audio invocations.
        const unmuted = new AudioService({ muted: false });
        const beepSpy = vi.spyOn(unmuted, 'playDetectionBeep');
        const alarmSpy = vi.spyOn(unmuted, 'playDiscrepancyAlarm');
        const unmutedResult = processStream(events, before, unmuted);

        // Muted run — spy on the audio-producing path to prove silence,
        // keeping the real implementations intact so the mute guard runs.
        const muted = new AudioService({ muted: true });
        const beepSpyM = vi.spyOn(muted, 'playDetectionBeep');
        const alarmSpyM = vi.spyOn(muted, 'playDiscrepancyAlarm');
        // ensureContext is only reached after the mute guard passes; if muted
        // short-circuits correctly it is never called.
        const ctxSpy = vi.spyOn(
          muted as unknown as { ensureContext: () => unknown },
          'ensureContext',
        );
        const mutedResult = processStream(events, before, muted);

        // Visual state identical regardless of mute.
        expect(mutedResult).toEqual(unmutedResult);

        // The processor still *calls* the API the same number of times...
        expect(beepSpyM).toHaveBeenCalledTimes(beepSpy.mock.calls.length);
        expect(alarmSpyM).toHaveBeenCalledTimes(alarmSpy.mock.calls.length);
        // ...but no audio context is ever touched while muted.
        expect(ctxSpy).not.toHaveBeenCalled();

        beepSpy.mockRestore();
        alarmSpy.mockRestore();
      }),
      { numRuns: 100 },
    );
  });
});
