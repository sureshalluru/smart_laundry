import fc from 'fast-check';

// Mock axios to avoid ESM import issues in Jest
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

import { checkSessionValidity } from './EmployeeAuthContext';

/**
 * Property 3: Employee session validity respects time and scope
 *
 * For any employee session with a given authenticatedAt timestamp and laundryId:
 * - isAuthenticated() SHALL return true for any check time within 8 hours of authenticatedAt
 * - isAuthenticated() SHALL return false for any check time at or beyond 8 hours after authenticatedAt
 * - Access SHALL be granted for any order belonging to the session's laundryId
 * - Access SHALL be denied for any order belonging to a different laundryId
 *
 * **Validates: Requirements 6.4, 6.6**
 */
describe('Property 3: Employee session validity respects time and scope', () => {
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

  // Arbitrary for laundryId (numeric string)
  const laundryIdArb = fc.nat({ max: 9999 }).map(n => String(n));

  // Arbitrary for employeeId
  const employeeIdArb = fc.tuple(
    fc.constantFrom('EMP', 'E', 'STAFF'),
    fc.nat({ max: 999 }).map(n => String(n).padStart(3, '0'))
  ).map(([prefix, num]) => `${prefix}${num}`);

  // Arbitrary for a base timestamp (any date within a reasonable range)
  const baseTimestampArb = fc.date({
    min: new Date('2020-01-01T00:00:00.000Z'),
    max: new Date('2030-12-31T23:59:59.999Z'),
  });

  // Arbitrary for offset within 8 hours (exclusive of boundary): 0ms to just under 8h
  const offsetWithinTTLArb = fc.nat({ max: SESSION_TTL_MS - 1 });

  // Arbitrary for offset at or beyond 8 hours: 8h to 8h + 24h
  const offsetBeyondTTLArb = fc.integer({ min: 0, max: 24 * 60 * 60 * 1000 })
    .map(extra => SESSION_TTL_MS + extra);

  /**
   * Helper to create a valid session object with given authenticatedAt and laundryId.
   */
  function createSession(authenticatedAt, laundryId) {
    const authDate = new Date(authenticatedAt);
    const expiresAt = new Date(authDate.getTime() + SESSION_TTL_MS);
    return {
      employeeId: 'EMP001',
      laundryId: String(laundryId),
      role: 'Employee',
      fullName: 'Test Employee',
      authenticatedAt: authDate.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  it('returns true for any check time within 8 hours of authenticatedAt', () => {
    fc.assert(
      fc.property(
        baseTimestampArb,
        offsetWithinTTLArb,
        laundryIdArb,
        (baseDate, offsetMs, laundryId) => {
          const session = createSession(baseDate, laundryId);
          const checkTime = new Date(baseDate.getTime() + offsetMs);

          // Mock Date.now and new Date() to return checkTime
          const originalDate = global.Date;
          const mockNow = checkTime.getTime();
          const MockDate = class extends originalDate {
            constructor(...args) {
              if (args.length === 0) {
                super(mockNow);
              } else {
                super(...args);
              }
            }
            static now() { return mockNow; }
          };
          global.Date = MockDate;

          try {
            const result = checkSessionValidity(session, laundryId);
            return result === true;
          } finally {
            global.Date = originalDate;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns false for any check time at or beyond 8 hours after authenticatedAt', () => {
    fc.assert(
      fc.property(
        baseTimestampArb,
        offsetBeyondTTLArb,
        laundryIdArb,
        (baseDate, offsetMs, laundryId) => {
          const session = createSession(baseDate, laundryId);
          const checkTime = new Date(baseDate.getTime() + offsetMs);

          const originalDate = global.Date;
          const mockNow = checkTime.getTime();
          const MockDate = class extends originalDate {
            constructor(...args) {
              if (args.length === 0) {
                super(mockNow);
              } else {
                super(...args);
              }
            }
            static now() { return mockNow; }
          };
          global.Date = MockDate;

          try {
            const result = checkSessionValidity(session, laundryId);
            return result === false;
          } finally {
            global.Date = originalDate;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('grants access for matching laundryId', () => {
    fc.assert(
      fc.property(
        baseTimestampArb,
        offsetWithinTTLArb,
        laundryIdArb,
        (baseDate, offsetMs, laundryId) => {
          const session = createSession(baseDate, laundryId);
          const checkTime = new Date(baseDate.getTime() + offsetMs);

          const originalDate = global.Date;
          const mockNow = checkTime.getTime();
          const MockDate = class extends originalDate {
            constructor(...args) {
              if (args.length === 0) {
                super(mockNow);
              } else {
                super(...args);
              }
            }
            static now() { return mockNow; }
          };
          global.Date = MockDate;

          try {
            // Same laundryId should grant access
            const result = checkSessionValidity(session, laundryId);
            return result === true;
          } finally {
            global.Date = originalDate;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('denies access for a different laundryId', () => {
    fc.assert(
      fc.property(
        baseTimestampArb,
        offsetWithinTTLArb,
        laundryIdArb,
        laundryIdArb,
        (baseDate, offsetMs, sessionLaundryId, requestLaundryId) => {
          // Only test when laundryIds are actually different
          fc.pre(sessionLaundryId !== requestLaundryId);

          const session = createSession(baseDate, sessionLaundryId);
          const checkTime = new Date(baseDate.getTime() + offsetMs);

          const originalDate = global.Date;
          const mockNow = checkTime.getTime();
          const MockDate = class extends originalDate {
            constructor(...args) {
              if (args.length === 0) {
                super(mockNow);
              } else {
                super(...args);
              }
            }
            static now() { return mockNow; }
          };
          global.Date = MockDate;

          try {
            // Different laundryId should deny access
            const result = checkSessionValidity(session, requestLaundryId);
            return result === false;
          } finally {
            global.Date = originalDate;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
