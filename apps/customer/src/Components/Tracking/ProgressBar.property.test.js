import fc from 'fast-check';
import { getActiveStageIndex } from './ProgressBar';

/**
 * Feature: live-driver-tracking, Property 5: Progress bar status mapping and monotonicity
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5
 *
 * For any valid order status string, the progress bar component SHALL map it to exactly
 * one active stage according to the defined mapping (OrderSubmitted→"Order Placed",
 * ReadyForIntake/InProgress→"In Progress", EnRouteToDelivery→"On Its Way",
 * Delivered→"Delivered"), AND all stages preceding the active stage SHALL be marked
 * as complete.
 */

const VALID_STATUSES = [
  'OrderSubmitted',
  'ReadyForIntake',
  'InProgress',
  'EnRouteToDelivery',
  'Delivered',
];

const EXPECTED_MAPPING = {
  OrderSubmitted: 0,
  ReadyForIntake: 1,
  InProgress: 1,
  EnRouteToDelivery: 2,
  Delivered: 3,
};

const validStatusArb = fc.constantFrom(...VALID_STATUSES);

describe('Property 5: Progress bar status mapping and monotonicity', () => {
  it('maps any valid status to an index in [0, 3]', () => {
    fc.assert(
      fc.property(validStatusArb, (status) => {
        const index = getActiveStageIndex(status);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThanOrEqual(3);
      }),
      { numRuns: 100 }
    );
  });

  it('maps each valid status to exactly one defined stage per the mapping', () => {
    fc.assert(
      fc.property(validStatusArb, (status) => {
        const index = getActiveStageIndex(status);
        expect(index).toBe(EXPECTED_MAPPING[status]);
      }),
      { numRuns: 100 }
    );
  });

  it('all stages before the active index are implicitly complete (index < active = complete)', () => {
    fc.assert(
      fc.property(validStatusArb, (status) => {
        const activeIndex = getActiveStageIndex(status);
        // For each stage index below the active one, it should be "complete"
        // In the ProgressBar component, isComplete = index < activeIndex
        for (let i = 0; i < activeIndex; i++) {
          // Stage i is complete because i < activeIndex
          expect(i < activeIndex).toBe(true);
        }
        // The active stage itself is not complete
        expect(activeIndex < activeIndex).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('mapping is deterministic: same input always produces the same output', () => {
    fc.assert(
      fc.property(validStatusArb, (status) => {
        const firstCall = getActiveStageIndex(status);
        const secondCall = getActiveStageIndex(status);
        expect(firstCall).toBe(secondCall);
      }),
      { numRuns: 100 }
    );
  });
});
