import fc from 'fast-check';
import { tagWithSessionMode } from './sessionTagging';
import type { DetectionEvent, WashMode } from '../types';

// Feature: realtime-garment-counter-ipad, Property 13: Session-mode tagging of
// recorded items — For any active counting session with a given mode and any
// stream of detections recorded during it, every recorded item carries the
// session's mode as its wash type.
// Validates: Requirements 4.4, 4.5

const detectionArb: fc.Arbitrary<DetectionEvent> = fc.record({
  clothId: fc.integer({ min: 0, max: 100_000 }),
  clothType: fc.constantFrom('shirts', 'pants', 'towels'),
  filePath: fc.constant('p'),
  date: fc.constant('2026-01-01T00:00:00.000Z'),
  isModified: fc.boolean(),
  // deliberately arbitrary/foreign wash type on the incoming event
  washType: fc.constantFrom('Before Wash', 'After Wash', 'garbage', ''),
  transId: fc.constant('T1'),
  operatorName: fc.constant('op'),
  uniqId: fc.constant('u1'),
  status: fc.constant('ok'),
});

describe('Property 13: Session-mode tagging of recorded items', () => {
  it('every recorded item carries the session mode as washType', () => {
    fc.assert(
      fc.property(
        fc.array(detectionArb, { maxLength: 50 }),
        fc.constantFrom<WashMode>('Before Wash', 'After Wash'),
        (events, mode) => {
          const tagged = events.map((e) => tagWithSessionMode(e, mode));
          expect(tagged.every((t) => t.washType === mode)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('preserves all other fields and does not mutate the input', () => {
    fc.assert(
      fc.property(detectionArb, fc.constantFrom<WashMode>('Before Wash', 'After Wash'), (event, mode) => {
        const snapshot = JSON.stringify(event);
        const tagged = tagWithSessionMode(event, mode);
        // input untouched
        expect(JSON.stringify(event)).toBe(snapshot);
        // only washType changes
        expect(tagged).toEqual({ ...event, washType: mode });
      }),
      { numRuns: 100 },
    );
  });
});
