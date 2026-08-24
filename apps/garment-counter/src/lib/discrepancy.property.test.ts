import fc from 'fast-check';
import {
  allDiscrepanciesResolved,
  buildComparisons,
  isDiscrepancy,
  shouldAlert,
} from './discrepancy';
import type { CategoryComparison, CategoryTally } from '../types';

const CATEGORY_POOL = ['shirts', 'pants', 'towels', 'sheets', 'jackets'];

/** Arbitrary tally map: subset of categories with arbitrary counts. */
const tallyMapArb: fc.Arbitrary<Map<string, CategoryTally>> = fc
  .array(
    fc.tuple(fc.constantFrom(...CATEGORY_POOL), fc.nat({ max: 50 })),
    { maxLength: 5 },
  )
  .map((pairs) => {
    const map = new Map<string, CategoryTally>();
    for (const [category, count] of pairs) {
      map.set(category, { category, count, items: [] });
    }
    return map;
  });

// Feature: realtime-garment-counter-ipad, Property 6: Discrepancy comparison
// builder correctness — For any pair of Before/After tallies, the comparison
// contains one row per category present in either tally, each difference is
// afterCount - beforeCount, a row is a discrepancy iff its difference is
// nonzero, and the alert triggers iff at least one row is a discrepancy.
// Validates: Requirements 5.1, 5.4
describe('Property 6: Discrepancy comparison builder correctness', () => {
  it('one row per category in either tally, correct differences and alert trigger', () => {
    fc.assert(
      fc.property(tallyMapArb, tallyMapArb, (before, after) => {
        const rows = buildComparisons(before, after);

        const expectedCategories = new Set([...before.keys(), ...after.keys()]);
        // exactly one row per category present in either tally
        expect(rows.length).toBe(expectedCategories.size);
        expect(new Set(rows.map((r) => r.category))).toEqual(expectedCategories);

        for (const row of rows) {
          const b = before.get(row.category)?.count ?? 0;
          const a = after.get(row.category)?.count ?? 0;
          expect(row.beforeCount).toBe(b);
          expect(row.afterCount).toBe(a);
          expect(row.difference).toBe(a - b);
          expect(isDiscrepancy(row)).toBe(a - b !== 0);
        }

        // alert triggers iff at least one row differs
        const anyDiff = rows.some((r) => r.difference !== 0);
        expect(shouldAlert(rows)).toBe(anyDiff);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: realtime-garment-counter-ipad, Property 7: Alert dismissed only when
// all discrepancies resolved — For any set of discrepancies with arbitrary
// resolved flags, the alert is dismissed iff every discrepancy is resolved.
// Validates: Requirements 5.7
describe('Property 7: Alert dismissed only when all discrepancies resolved', () => {
  const rowArb: fc.Arbitrary<CategoryComparison> = fc
    .tuple(
      fc.constantFrom(...CATEGORY_POOL),
      fc.integer({ min: -20, max: 20 }), // difference (0 => not a discrepancy)
      fc.boolean(), // isResolved
    )
    .map(([category, difference, isResolved]) => ({
      category,
      beforeCount: 0,
      afterCount: difference,
      difference,
      isResolved,
    }));

  it('dismisses iff every discrepant row is resolved', () => {
    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 12 }), (rows) => {
        const discrepancies = rows.filter((r) => r.difference !== 0);
        const expected = discrepancies.every((r) => r.isResolved);
        expect(allDiscrepanciesResolved(rows)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('non-discrepant (resolved-irrelevant) rows never block dismissal', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom(...CATEGORY_POOL).map<CategoryComparison>((category) => ({
            category,
            beforeCount: 5,
            afterCount: 5,
            difference: 0,
            isResolved: false, // unresolved but not a discrepancy
          })),
          { maxLength: 8 },
        ),
        (zeroDiffRows) => {
          // no discrepancies at all => always dismissible
          expect(allDiscrepanciesResolved(zeroDiffRows)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
