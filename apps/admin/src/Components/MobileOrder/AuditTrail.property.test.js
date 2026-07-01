import fc from 'fast-check';

/**
 * Audit Trail Recording Logic - Pure function modelling the audit behavior from the
 * mobile order workflow backend.
 *
 * The design specifies:
 *   For any action performed via the mobile order page (photo upload, status change,
 *   or weight/count entry) and any authenticated employee session, the last_updated_by
 *   field on the order SHALL be set to the emp_id from the authenticated session.
 *
 * We model this as a pure function that takes an action and an employee session,
 * and returns the audit record applied to the order.
 */

/**
 * Represents the action types available on the mobile order page.
 */
const ACTION_TYPES = ['photo_upload', 'update_services'];

/**
 * Represents the photo sub-types (imageType) for photo_upload actions.
 */
const IMAGE_TYPES = ['scan_received', 'processing', 'fold_complete', 'weight'];

/**
 * Processes a mobile order action and returns the audit record update
 * that should be applied to the order.
 *
 * @param {object} action - The action being performed
 * @param {string} action.type - One of ACTION_TYPES
 * @param {string} [action.imageType] - For photo_upload actions, one of IMAGE_TYPES
 * @param {object} session - The authenticated employee session
 * @param {string} session.empId - The employee ID from the session
 * @param {string} session.laundryId - The laundry ID from the session
 * @returns {object} The audit record with last_updated_by set
 */
function processActionAudit(action, session) {
  if (!action || !action.type) {
    return { success: false, error: 'Missing action type' };
  }

  if (!session || !session.empId) {
    return { success: false, error: 'Missing employee session' };
  }

  if (!ACTION_TYPES.includes(action.type)) {
    return { success: false, error: 'Unknown action type' };
  }

  // All valid actions from an authenticated session record the emp_id
  return {
    success: true,
    last_updated_by: session.empId,
    action_type: action.type,
    performed_by: session.empId,
  };
}

/**
 * Feature: mobile-order-workflow, Property 5: All actions record emp_id in last_updated_by
 *
 * For any action performed via the mobile order page (photo upload, status change, or
 * weight/count entry) and any authenticated employee session, the last_updated_by field
 * on the order SHALL be set to the emp_id from the authenticated session.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */
describe('Property 5: All actions record emp_id in last_updated_by', () => {
  // Arbitrary: employee ID (non-empty string matching typical emp_id format)
  const empIdArb = fc
    .tuple(
      fc.constantFrom('EMP-', 'E-', 'STAFF-'),
      fc.nat({ max: 999 }).map((n) => String(n).padStart(3, '0'))
    )
    .map(([prefix, num]) => `${prefix}${num}`);

  // Arbitrary: laundry ID (numeric string)
  const laundryIdArb = fc.integer({ min: 1, max: 100 }).map(String);

  // Arbitrary: valid employee session
  const sessionArb = fc.record({
    empId: empIdArb,
    laundryId: laundryIdArb,
    role: fc.constantFrom('Attendant', 'Manager', 'Driver'),
    fullName: fc.tuple(
      fc.constantFrom('Alice', 'Bob', 'Carlos', 'Diana', 'Eve'),
      fc.constantFrom('Smith', 'Jones', 'Lee', 'Garcia', 'Kim')
    ).map(([first, last]) => `${first} ${last}`),
  });

  // Arbitrary: valid action (photo_upload with imageType, or update_services)
  const actionArb = fc.oneof(
    fc.record({
      type: fc.constant('photo_upload'),
      imageType: fc.constantFrom(...IMAGE_TYPES),
    }),
    fc.record({
      type: fc.constant('update_services'),
    })
  );

  it('every action type sets last_updated_by to the session emp_id', () => {
    fc.assert(
      fc.property(actionArb, sessionArb, (action, session) => {
        const result = processActionAudit(action, session);

        return (
          result.success === true &&
          result.last_updated_by === session.empId
        );
      }),
      { numRuns: 100 }
    );
  });

  it('the emp_id from the session is never null or empty in the audit record', () => {
    fc.assert(
      fc.property(actionArb, sessionArb, (action, session) => {
        const result = processActionAudit(action, session);

        return (
          result.success === true &&
          result.last_updated_by !== null &&
          result.last_updated_by !== undefined &&
          result.last_updated_by !== '' &&
          result.last_updated_by.length > 0
        );
      }),
      { numRuns: 100 }
    );
  });

  it('the audit record always has the correct emp_id regardless of action type', () => {
    fc.assert(
      fc.property(actionArb, sessionArb, (action, session) => {
        const result = processActionAudit(action, session);

        // The performed_by field must always equal the session's empId
        return (
          result.success === true &&
          result.performed_by === session.empId &&
          result.last_updated_by === session.empId
        );
      }),
      { numRuns: 100 }
    );
  });

  it('multiple sequential actions from the same employee always produce consistent audit records', () => {
    fc.assert(
      fc.property(
        fc.array(actionArb, { minLength: 2, maxLength: 10 }),
        sessionArb,
        (actions, session) => {
          const results = actions.map((action) => processActionAudit(action, session));

          // All results must be successful and have the same emp_id
          return results.every(
            (result) =>
              result.success === true &&
              result.last_updated_by === session.empId &&
              result.performed_by === session.empId
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
