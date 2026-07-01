import fc from 'fast-check';

// Mock axios to avoid ESM import issues in Jest
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

import { checkSessionValidity } from './EmployeeAuthContext';

/**
 * Feature: mobile-order-workflow, Property 9: Session scoping enforces laundry_id match
 *
 * For any authenticated session with laundry_id = X, the isAuthenticated function SHALL return
 * true when called with laundry_id X, and SHALL return false when called with any laundry_id Y
 * where Y ≠ X.
 *
 * **Validates: Requirements 9.2, 9.3**
 */
describe('Property 9: Session scoping enforces laundry_id match', () => {
  // Arbitrary: laundryId as a numeric string (representing real laundry IDs)
  const laundryIdArb = fc.integer({ min: 1, max: 9999 }).map(String);

  // Arbitrary: employeeId
  const employeeIdArb = fc
    .tuple(
      fc.constantFrom('EMP-', 'E-', 'STAFF-'),
      fc.nat({ max: 999 }).map((n) => String(n).padStart(3, '0'))
    )
    .map(([prefix, num]) => `${prefix}${num}`);

  // Arbitrary: role
  const roleArb = fc.constantFrom('Attendant', 'Manager', 'Driver');

  // Arbitrary: full name
  const fullNameArb = fc
    .tuple(
      fc.constantFrom('Alice', 'Bob', 'Carlos', 'Diana', 'Eve'),
      fc.constantFrom('Smith', 'Jones', 'Lee', 'Garcia', 'Kim')
    )
    .map(([first, last]) => `${first} ${last}`);

  it('returns true when checked with the matching laundryId', () => {
    fc.assert(
      fc.property(laundryIdArb, employeeIdArb, roleArb, fullNameArb, (laundryId, empId, role, fullName) => {
        const session = {
          employeeId: empId,
          laundryId: String(laundryId),
          role,
          fullName,
          authenticatedAt: new Date().toISOString(),
        };

        const result = checkSessionValidity(session, laundryId);
        return result === true;
      }),
      { numRuns: 100 }
    );
  });

  it('returns false when checked with a different laundryId', () => {
    fc.assert(
      fc.property(laundryIdArb, laundryIdArb, (sessionLaundryId, checkLaundryId) => {
        // Ensure the two laundry IDs are different
        fc.pre(sessionLaundryId !== checkLaundryId);

        const session = {
          employeeId: 'EMP-001',
          laundryId: String(sessionLaundryId),
          role: 'Attendant',
          fullName: 'Test Employee',
          authenticatedAt: new Date().toISOString(),
        };

        const result = checkSessionValidity(session, checkLaundryId);
        return result === false;
      }),
      { numRuns: 100 }
    );
  });

  it('returns false for null/undefined session regardless of laundryId', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined),
        fc.oneof(laundryIdArb, fc.constant(undefined), fc.constant(null)),
        (session, laundryId) => {
          const result = checkSessionValidity(session, laundryId);
          return result === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns true for any valid session when no laundryId is provided (scope-agnostic)', () => {
    fc.assert(
      fc.property(laundryIdArb, (sessionLaundryId) => {
        const session = {
          employeeId: 'EMP-001',
          laundryId: String(sessionLaundryId),
          role: 'Attendant',
          fullName: 'Test Employee',
          authenticatedAt: new Date().toISOString(),
        };

        // No laundryId provided — should be scope-agnostic (return true)
        const resultNoArg = checkSessionValidity(session);
        const resultUndefined = checkSessionValidity(session, undefined);
        const resultNull = checkSessionValidity(session, null);
        const resultEmpty = checkSessionValidity(session, '');

        return (
          resultNoArg === true &&
          resultUndefined === true &&
          resultNull === true &&
          resultEmpty === true
        );
      }),
      { numRuns: 100 }
    );
  });
});
