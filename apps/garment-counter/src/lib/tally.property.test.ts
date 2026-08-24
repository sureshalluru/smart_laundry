import fc from 'fast-check';
import {
  aggregateTallies,
  deriveCategories,
  isLowConfidence,
  LOW_CONFIDENCE_THRESHOLD,
} from './tally';
import type { DetectionEvent } from '../types';

const CATEGORY_POOL = ['shirts', 'pants', 'towels', 'sheets', 'jackets'];

/** Arbitrary DetectionEvent with a category drawn from a small pool. */
function detectionArb(withConfidence: boolean): fc.Arbitrary<DetectionEvent> {
  return fc.record({
    clothId: fc.integer({ min: 0, max: 100_000 }),
    clothType: fc.constantFrom(...CATEGORY_POOL),
    filePath: fc.constant('p'),
    date: fc.constant('2026-01-01T00:00:00.000Z'),
    isModified: fc.boolean(),
    washType: fc.constantFrom('Before Wash', 'After Wash'),
    transId: fc.constant('T1'),
    operatorName: fc.constant('op'),
    uniqId: fc.constant('u1'),
    status: fc.constant('ok'),
    confidence: withConfidence
      ? fc.integer({ min: 0, max: 100 })
      : fc.constant(undefined),
  });
}

const eventStreamArb = fc.array(detectionArb(false), { maxLength: 150 });

// Feature: realtime-garment-counter-ipad, Property 2: Tally aggregation
// correctness by cloth_type — For any stream of detection events, each
// category count equals the number of events whose cloth_type matches, and the
// sum of all category counts equals the total number of aggregated events.
// Validates: Requirements 1.2, 1.3, 5.2
describe('Property 2: Tally aggregation correctness by cloth_type', () => {
  it('each category count equals its matching-event count; sum equals total', () => {
    fc.assert(
      fc.property(eventStreamArb, (events) => {
        const tallies = aggregateTallies(events);

        // per-category count matches the number of matching events
        for (const [category, tally] of tallies) {
          const expected = events.filter((e) => e.clothType === category).length;
          expect(tally.count).toBe(expected);
          expect(tally.items.length).toBe(expected);
          expect(tally.items.every((i) => i.clothType === category)).toBe(true);
        }

        // sum of counts equals total number of events
        const sum = [...tallies.values()].reduce((acc, t) => acc + t.count, 0);
        expect(sum).toBe(events.length);
      }),
      { numRuns: 100 },
    );
  });

  it('seed categories always appear, counted correctly even when unseen', () => {
    fc.assert(
      fc.property(
        eventStreamArb,
        fc.uniqueArray(fc.constantFrom(...CATEGORY_POOL), { maxLength: 5 }),
        (events, seeds) => {
          const tallies = aggregateTallies(events, seeds);
          for (const seed of seeds) {
            expect(tallies.has(seed)).toBe(true);
          }
          // seeding never changes the total count
          const sum = [...tallies.values()].reduce((acc, t) => acc + t.count, 0);
          expect(sum).toBe(events.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: realtime-garment-counter-ipad, Property 3: Low-confidence flagging —
// For any detection event with a confidence score, the event is flagged as
// low-confidence if and only if its confidence is below 70.
// Validates: Requirements 1.5
describe('Property 3: Low-confidence flagging', () => {
  it('flags iff confidence is a number strictly below the threshold', () => {
    fc.assert(
      fc.property(detectionArb(true), (event) => {
        const conf = event.confidence as number;
        expect(isLowConfidence(event)).toBe(conf < LOW_CONFIDENCE_THRESHOLD);
      }),
      { numRuns: 100 },
    );
  });

  it('never flags an event without a confidence score', () => {
    fc.assert(
      fc.property(detectionArb(false), (event) => {
        expect(isLowConfidence(event)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: realtime-garment-counter-ipad, Property 15: Dynamic category set
// equals distinct observed cloth_types — For any stream of detection events,
// the set of active categories equals the union of the persisted known
// categories and the set of distinct cloth_type values observed.
// Validates: Requirements 12.1, 12.2
describe('Property 15: Dynamic category set equals distinct observed cloth_types', () => {
  it('derived categories equal the union of known and observed', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ maxLength: 8 }), { maxLength: 6 }),
        eventStreamArb,
        (known, events) => {
          const derived = deriveCategories(known, events);
          const expected = new Set<string>(known);
          for (const e of events) expected.add(e.clothType);

          // same membership, no duplicates
          expect(new Set(derived)).toEqual(expected);
          expect(derived.length).toBe(expected.size);
        },
      ),
      { numRuns: 100 },
    );
  });
});
