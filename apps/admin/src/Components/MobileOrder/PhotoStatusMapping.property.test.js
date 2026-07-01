import fc from 'fast-check';

/**
 * Photo Action → Target Status Mapping - Pure function extracted from the mobile order workflow.
 *
 * The design specifies that each photo action type maps to exactly one target status:
 *   scan_received → ReceivedAtFacility
 *   processing → Processing
 *   fold_complete → ReadyForDelivery
 *
 * The mapping is bijective: each action maps to exactly one status, and no two actions
 * map to the same status.
 */

const PHOTO_ACTION_STATUS_MAP = {
  scan_received: 'ReceivedAtFacility',
  processing: 'Processing',
  fold_complete: 'ReadyForDelivery',
};

/**
 * Returns the target status for a given photo action type.
 * Returns null for unknown action types.
 */
function getTargetStatusForAction(actionType) {
  if (!actionType || typeof actionType !== 'string') {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(PHOTO_ACTION_STATUS_MAP, actionType)) {
    return PHOTO_ACTION_STATUS_MAP[actionType];
  }
  return null;
}

/**
 * Returns the action type for a given target status (reverse lookup).
 * Returns null if no action maps to the given status.
 */
function getActionForTargetStatus(targetStatus) {
  if (!targetStatus || typeof targetStatus !== 'string') {
    return null;
  }
  const entry = Object.entries(PHOTO_ACTION_STATUS_MAP).find(
    ([, status]) => status === targetStatus
  );
  return entry ? entry[0] : null;
}

/**
 * Feature: mobile-order-workflow, Property 4: Photo upload action maps to correct target status
 *
 * For any photo action type in {scan_received, processing, fold_complete}, successful photo upload
 * SHALL set the order status to the corresponding target status (ReceivedAtFacility, Processing,
 * ReadyForDelivery respectively), and the mapping SHALL be bijective (each action maps to exactly
 * one status).
 *
 * **Validates: Requirements 3.3, 4.3, 5.3**
 */
describe('Property 4: Photo upload action maps to correct target status', () => {
  // Arbitrary: valid photo action types
  const validActionArb = fc.constantFrom('scan_received', 'processing', 'fold_complete');

  // Arbitrary: valid target statuses
  const validTargetStatusArb = fc.constantFrom('ReceivedAtFacility', 'Processing', 'ReadyForDelivery');

  // Arbitrary: unknown/invalid action types
  const unknownActionArb = fc.oneof(
    fc.string({ minLength: 0, maxLength: 30 }).filter(
      (s) => !['scan_received', 'processing', 'fold_complete'].includes(s)
    ),
    fc.constantFrom('', 'unknown', 'scan_receive', 'PROCESSING', 'fold', 'complete', 'weight')
  );

  it('each valid action type maps to exactly one target status', () => {
    fc.assert(
      fc.property(validActionArb, (actionType) => {
        const targetStatus = getTargetStatusForAction(actionType);

        // Must return a non-null string
        return targetStatus !== null && typeof targetStatus === 'string' && targetStatus.length > 0;
      }),
      { numRuns: 100 }
    );
  });

  it('the mapping is correct for all defined action types', () => {
    fc.assert(
      fc.property(validActionArb, (actionType) => {
        const targetStatus = getTargetStatusForAction(actionType);

        // Verify the exact mapping
        if (actionType === 'scan_received') return targetStatus === 'ReceivedAtFacility';
        if (actionType === 'processing') return targetStatus === 'Processing';
        if (actionType === 'fold_complete') return targetStatus === 'ReadyForDelivery';
        return false;
      }),
      { numRuns: 100 }
    );
  });

  it('the mapping is bijective - no two actions map to the same status', () => {
    fc.assert(
      fc.property(validActionArb, validActionArb, (action1, action2) => {
        const status1 = getTargetStatusForAction(action1);
        const status2 = getTargetStatusForAction(action2);

        // If two different actions produce the same status, bijectivity is violated
        if (action1 !== action2) {
          return status1 !== status2;
        }
        // Same action must always produce same status (deterministic)
        return status1 === status2;
      }),
      { numRuns: 100 }
    );
  });

  it('the reverse mapping is consistent - each target status maps back to exactly one action', () => {
    fc.assert(
      fc.property(validTargetStatusArb, (targetStatus) => {
        const actionType = getActionForTargetStatus(targetStatus);

        // Must return a non-null action
        if (actionType === null) return false;

        // The forward mapping of that action must return the original status
        const roundTrip = getTargetStatusForAction(actionType);
        return roundTrip === targetStatus;
      }),
      { numRuns: 100 }
    );
  });

  it('unknown action types return null (handled gracefully)', () => {
    fc.assert(
      fc.property(unknownActionArb, (actionType) => {
        const targetStatus = getTargetStatusForAction(actionType);
        return targetStatus === null;
      }),
      { numRuns: 100 }
    );
  });

  it('the mapping is deterministic - same action always produces same status', () => {
    fc.assert(
      fc.property(validActionArb, (actionType) => {
        const result1 = getTargetStatusForAction(actionType);
        const result2 = getTargetStatusForAction(actionType);

        return result1 === result2;
      }),
      { numRuns: 100 }
    );
  });
});
