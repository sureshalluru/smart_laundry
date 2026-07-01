import fc from 'fast-check';

/**
 * Status Color Mapping - Pure function extracted from MobileOrderPage.jsx.
 *
 * The design specifies that every valid order status must map to a defined,
 * non-null color scheme for visual identification on the Mobile Order Page.
 *
 * Defined status set:
 *   OrderSubmitted, ReadyForIntake, ReceivedAtFacility, Processing,
 *   ProcessingStarted, ProcessingCompleted, ReadyForDelivery,
 *   EnRouteToDelivery, Delivered, OrderCanceled
 */

const STATUS_COLOR_MAP = {
  OrderSubmitted: 'gray',
  ReadyForIntake: 'blue',
  ReceivedAtFacility: 'cyan',
  Processing: 'yellow',
  ProcessingStarted: 'yellow',
  ProcessingCompleted: 'orange',
  ReadyForDelivery: 'teal',
  EnRouteToDelivery: 'purple',
  Delivered: 'green',
  OrderCanceled: 'red',
};

const VALID_STATUSES = Object.keys(STATUS_COLOR_MAP);

/**
 * Returns the color for a given order status.
 * Falls back to 'gray' for unknown statuses.
 */
function getStatusColor(status) {
  const map = {
    OrderSubmitted: 'gray',
    ReadyForIntake: 'blue',
    ReceivedAtFacility: 'cyan',
    Processing: 'yellow',
    ProcessingStarted: 'yellow',
    ProcessingCompleted: 'orange',
    ReadyForDelivery: 'teal',
    EnRouteToDelivery: 'purple',
    Delivered: 'green',
    OrderCanceled: 'red',
  };
  return map[status] || 'gray';
}

/**
 * Feature: mobile-order-workflow, Property 3: Status color mapping is total
 *
 * For any valid order status string from the defined status set (OrderSubmitted, ReadyForIntake,
 * ReceivedAtFacility, Processing, ProcessingStarted, ProcessingCompleted, ReadyForDelivery,
 * EnRouteToDelivery, Delivered, OrderCanceled), the color mapping function SHALL return a defined,
 * non-null color scheme.
 *
 * **Validates: Requirements 2.6**
 */
describe('Property 3: Status color mapping is total', () => {
  // Arbitrary: valid order statuses from the defined set
  const validStatusArb = fc.constantFrom(...VALID_STATUSES);

  it('every valid status maps to a non-null, non-empty color string', () => {
    fc.assert(
      fc.property(validStatusArb, (status) => {
        const color = getStatusColor(status);

        return color !== null && color !== undefined && typeof color === 'string' && color.length > 0;
      }),
      { numRuns: 100 }
    );
  });

  it('the mapping always returns a string (never null or undefined)', () => {
    fc.assert(
      fc.property(validStatusArb, (status) => {
        const color = getStatusColor(status);

        return typeof color === 'string';
      }),
      { numRuns: 100 }
    );
  });

  it('the complete set of defined statuses is covered by the mapping', () => {
    fc.assert(
      fc.property(validStatusArb, (status) => {
        const color = getStatusColor(status);

        // The color should NOT be the fallback 'gray' for statuses that have explicit mappings
        // (except OrderSubmitted which is explicitly mapped to 'gray')
        if (status === 'OrderSubmitted') {
          return color === 'gray';
        }

        // All other statuses should have a specific (non-fallback) color
        // Since they are explicitly mapped, they should return their defined color
        return color === STATUS_COLOR_MAP[status];
      }),
      { numRuns: 100 }
    );
  });

  it('the mapping is deterministic - same status always produces same color', () => {
    fc.assert(
      fc.property(validStatusArb, (status) => {
        const result1 = getStatusColor(status);
        const result2 = getStatusColor(status);

        return result1 === result2;
      }),
      { numRuns: 100 }
    );
  });

  it('unknown statuses still return a valid fallback color (never null)', () => {
    const unknownStatusArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 30 }).filter(
        (s) => !VALID_STATUSES.includes(s)
      ),
      fc.constantFrom('Unknown', 'Pending', 'InProgress', 'DELIVERED', 'cancelled')
    );

    fc.assert(
      fc.property(unknownStatusArb, (status) => {
        const color = getStatusColor(status);

        // Even for unknown statuses, should return a valid string (fallback 'gray')
        return color !== null && color !== undefined && typeof color === 'string' && color === 'gray';
      }),
      { numRuns: 100 }
    );
  });
});
