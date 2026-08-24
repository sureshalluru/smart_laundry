import fc from 'fast-check';
import { DetectionDeduper, selectNewDetections } from './detectionDedup';
import type { DetectionEvent } from '../types';

// Feature: realtime-garment-counter-ipad, Property 1: New-detection
// deduplication — For any sequence of polling responses containing arbitrary
// cloth_id values (duplicates, out-of-order, and gaps), a detection is "new"
// iff its cloth_id is strictly greater than the highest seen so far; the
// highest-seen value is monotonically non-decreasing, and every cloth_id
// greater than the last-seen value is processed exactly once.
// Validates: Requirements 1.1, 2.2, 9.3

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

describe('Property 1: New-detection deduplication', () => {
  // Sequences may include duplicates, out-of-order values, and gaps.
  const idSequenceArb = fc.array(fc.integer({ min: 0, max: 500 }), {
    maxLength: 200,
  });

  it('accept() returns true iff strictly greater; watermark is monotonic', () => {
    fc.assert(
      fc.property(idSequenceArb, (ids) => {
        const deduper = new DetectionDeduper();
        let prevHighest = deduper.highest;
        for (const id of ids) {
          const wasNew = deduper.accept(id);
          // new iff strictly greater than the previous watermark
          expect(wasNew).toBe(id > prevHighest);
          // watermark never decreases
          expect(deduper.highest).toBeGreaterThanOrEqual(prevHighest);
          prevHighest = deduper.highest;
        }
      }),
      { numRuns: 100 },
    );
  });

  it('processes each id > initial exactly once, never skips, never double-counts', () => {
    fc.assert(
      fc.property(idSequenceArb, (ids) => {
        const deduper = new DetectionDeduper();
        const processed: number[] = [];
        for (const id of ids) {
          if (deduper.accept(id)) processed.push(id);
        }
        // Every processed id is strictly increasing (exactly-once, in order)
        for (let i = 1; i < processed.length; i++) {
          expect(processed[i]).toBeGreaterThan(processed[i - 1]);
        }
        // The set of processed ids equals the running-maxima of the sequence:
        // an id is processed iff it exceeds all ids before it.
        const expected: number[] = [];
        let max = Number.NEGATIVE_INFINITY;
        for (const id of ids) {
          if (id > max) {
            expected.push(id);
            max = id;
          }
        }
        expect(processed).toEqual(expected);
        // Final watermark is the overall max (or unchanged if empty)
        expect(deduper.highest).toBe(
          ids.length ? Math.max(...ids) : Number.NEGATIVE_INFINITY,
        );
      }),
      { numRuns: 100 },
    );
  });

  it('selectNewDetections returns distinct ids > highestSeen, sorted ascending (offline catch-up)', () => {
    fc.assert(
      fc.property(
        idSequenceArb,
        fc.integer({ min: -1, max: 500 }),
        (ids, highestSeen) => {
          const batch = ids.map(makeDetection);
          const { newDetections, highestSeen: newWatermark } =
            selectNewDetections(batch, highestSeen);

          const outIds = newDetections.map((d) => d.clothId);
          // all strictly greater than the prior watermark
          for (const id of outIds) expect(id).toBeGreaterThan(highestSeen);
          // sorted ascending and distinct
          for (let i = 1; i < outIds.length; i++) {
            expect(outIds[i]).toBeGreaterThan(outIds[i - 1]);
          }
          // equals the distinct set of ids above the watermark
          const expected = [...new Set(ids.filter((id) => id > highestSeen))].sort(
            (a, b) => a - b,
          );
          expect(outIds).toEqual(expected);
          // watermark advances to max of (prior, any new ids)
          const expectedWatermark = expected.length
            ? Math.max(highestSeen, ...expected)
            : highestSeen;
          expect(newWatermark).toBe(expectedWatermark);
        },
      ),
      { numRuns: 100 },
    );
  });
});
