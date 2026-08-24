import fc from 'fast-check';
import { applyCorrection } from './correction';
import { aggregateTallies } from './tally';
import type { CategoryTally, DetectionEvent } from '../types';

const CATEGORY_POOL = ['shirts', 'pants', 'towels', 'sheets'];

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

/** Build tallies from unique-id detections and return both the map and ids. */
const talliesArb: fc.Arbitrary<{
  tallies: Map<string, CategoryTally>;
  ids: number[];
}> = fc
  .array(fc.constantFrom(...CATEGORY_POOL), { minLength: 1, maxLength: 40 })
  .map((categories) => {
    const events = categories.map((cat, i) => makeDetection(i + 1, cat));
    return {
      tallies: aggregateTallies(events),
      ids: events.map((e) => e.clothId),
    };
  });

function totalItems(tallies: ReadonlyMap<string, CategoryTally>): number {
  return [...tallies.values()].reduce((acc, t) => acc + t.count, 0);
}

// Feature: realtime-garment-counter-ipad, Property 5: Category correction
// preserves total and marks modified — For any set of category tallies and any
// item within them, correcting that item to a new category removes it from its
// original tally, adds it to the target tally, marks it modified, and leaves
// the total number of items unchanged.
// Validates: Requirements 3.3, 3.7
describe('Property 5: Category correction preserves total and marks modified', () => {
  it('moves the item, marks it modified, and preserves the grand total', () => {
    fc.assert(
      fc.property(
        talliesArb,
        fc.constantFrom(...CATEGORY_POOL),
        fc.nat(),
        ({ tallies, ids }, targetCategory, idPick) => {
          const clothId = ids[idPick % ids.length];
          const before = totalItems(tallies);

          const next = applyCorrection(tallies, clothId, targetCategory);

          // total item count unchanged
          expect(totalItems(next)).toBe(before);

          // the item now lives in the target category, marked modified
          const target = next.get(targetCategory);
          expect(target).toBeDefined();
          const moved = target?.items.find((i) => i.clothId === clothId);
          expect(moved).toBeDefined();
          expect(moved?.isModified).toBe(true);
          expect(moved?.clothType).toBe(targetCategory);

          // the item appears in exactly one category overall
          const occurrences = [...next.values()].reduce(
            (acc, t) => acc + t.items.filter((i) => i.clothId === clothId).length,
            0,
          );
          expect(occurrences).toBe(1);

          // counts stay consistent with items arrays
          for (const t of next.values()) {
            expect(t.count).toBe(t.items.length);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does not mutate the input tallies', () => {
    fc.assert(
      fc.property(talliesArb, fc.constantFrom(...CATEGORY_POOL), ({ tallies, ids }, target) => {
        const snapshot = JSON.stringify([...tallies.entries()]);
        applyCorrection(tallies, ids[0], target);
        expect(JSON.stringify([...tallies.entries()])).toBe(snapshot);
      }),
      { numRuns: 100 },
    );
  });

  it('leaves totals unchanged when the item id is not present', () => {
    fc.assert(
      fc.property(talliesArb, fc.constantFrom(...CATEGORY_POOL), ({ tallies }, target) => {
        const before = totalItems(tallies);
        const next = applyCorrection(tallies, 999_999, target);
        expect(totalItems(next)).toBe(before);
      }),
      { numRuns: 100 },
    );
  });
});
