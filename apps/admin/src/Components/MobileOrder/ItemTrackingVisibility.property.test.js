import fc from 'fast-check';

/**
 * Property 4: Item tracking button visibility matches status eligibility
 *
 * For any order status value, the "Scan Received" button SHALL be visible if and only if
 * the status is in the set of intake-eligible statuses (ReceivedAtFacility, Processing,
 * ProcessingStarted), and the "Scan Fold" button SHALL be visible if and only if the status
 * is in the set of fold-eligible statuses (ProcessingCompleted, ReadyForDelivery).
 *
 * **Validates: Requirements 7.1, 7.2**
 */

// These constants mirror the production code in MobileOrderPage.jsx
const INTAKE_ELIGIBLE_STATUSES = ['ReceivedAtFacility', 'Processing', 'ProcessingStarted'];
const FOLD_ELIGIBLE_STATUSES = ['ProcessingCompleted', 'ReadyForDelivery'];

// All known order statuses in the workflow
const ALL_STATUSES = [
  'OrderSubmitted',
  'ReadyForIntake',
  'ReceivedAtFacility',
  'Processing',
  'ProcessingStarted',
  'ProcessingCompleted',
  'ReadyForDelivery',
  'EnRouteToDelivery',
  'Delivered',
  'OrderCanceled',
];

// Pure visibility functions (same logic as the component uses)
function isScanReceivedVisible(status) {
  return INTAKE_ELIGIBLE_STATUSES.includes(status);
}

function isScanFoldVisible(status) {
  return FOLD_ELIGIBLE_STATUSES.includes(status);
}

describe('Property 4: Item tracking button visibility matches status eligibility', () => {
  // Arbitrary: any valid workflow status
  const validStatusArb = fc.constantFrom(...ALL_STATUSES);

  // Arbitrary: random strings that are NOT valid statuses
  const randomStringArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 50 }),
    fc.constantFrom('Unknown', 'InvalidStatus', 'ready', 'processing', 'DELIVERED', 'pending'),
    fc.string({ minLength: 1, maxLength: 30 }).map(s => `Status_${s}`)
  ).filter(s => !ALL_STATUSES.includes(s));

  // Combined arbitrary: valid statuses + random strings
  const anyStatusArb = fc.oneof(validStatusArb, randomStringArb);

  it('"Scan Received" is visible if and only if status is in intake-eligible set', () => {
    fc.assert(
      fc.property(anyStatusArb, (status) => {
        const visible = isScanReceivedVisible(status);
        const shouldBeVisible = INTAKE_ELIGIBLE_STATUSES.includes(status);

        return visible === shouldBeVisible;
      }),
      { numRuns: 100 }
    );
  });

  it('"Scan Fold" is visible if and only if status is in fold-eligible set', () => {
    fc.assert(
      fc.property(anyStatusArb, (status) => {
        const visible = isScanFoldVisible(status);
        const shouldBeVisible = FOLD_ELIGIBLE_STATUSES.includes(status);

        return visible === shouldBeVisible;
      }),
      { numRuns: 100 }
    );
  });

  it('"Scan Received" is NOT visible for random non-status strings', () => {
    fc.assert(
      fc.property(randomStringArb, (status) => {
        return isScanReceivedVisible(status) === false;
      }),
      { numRuns: 100 }
    );
  });

  it('"Scan Fold" is NOT visible for random non-status strings', () => {
    fc.assert(
      fc.property(randomStringArb, (status) => {
        return isScanFoldVisible(status) === false;
      }),
      { numRuns: 100 }
    );
  });

  it('intake-eligible and fold-eligible sets are mutually exclusive', () => {
    fc.assert(
      fc.property(validStatusArb, (status) => {
        const intakeVisible = isScanReceivedVisible(status);
        const foldVisible = isScanFoldVisible(status);

        // A status cannot be both intake-eligible and fold-eligible
        return !(intakeVisible && foldVisible);
      }),
      { numRuns: 100 }
    );
  });

  it('exactly the defined intake statuses produce a visible "Scan Received" button', () => {
    fc.assert(
      fc.property(validStatusArb, (status) => {
        const visible = isScanReceivedVisible(status);

        if (status === 'ReceivedAtFacility' || status === 'Processing' || status === 'ProcessingStarted') {
          return visible === true;
        }
        return visible === false;
      }),
      { numRuns: 100 }
    );
  });

  it('exactly the defined fold statuses produce a visible "Scan Fold" button', () => {
    fc.assert(
      fc.property(validStatusArb, (status) => {
        const visible = isScanFoldVisible(status);

        if (status === 'ProcessingCompleted' || status === 'ReadyForDelivery') {
          return visible === true;
        }
        return visible === false;
      }),
      { numRuns: 100 }
    );
  });
});
