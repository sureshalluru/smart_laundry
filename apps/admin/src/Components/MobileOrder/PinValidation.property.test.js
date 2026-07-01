import fc from 'fast-check';

/**
 * PIN Validation Logic - Pure function extracted from the backend validate-pin endpoint.
 *
 * The backend logic:
 *   SELECT emp_id, role, first_name, last_name FROM shop.employees
 *   WHERE passcode = %s AND laundry_id = %s AND is_active = TRUE
 *
 * We model this as a pure function that takes a list of employee records and
 * a (passcode, laundryId) pair, returning the validation result.
 */
function validatePin(employees, passcode, laundryId) {
  if (!passcode || !laundryId) {
    return { isValidated: false, error: 'Missing required parameters: laundryId or passcode' };
  }

  const match = employees.find(
    (emp) => emp.passcode === passcode && emp.laundryId === laundryId && emp.isActive === true
  );

  if (!match) {
    return { isValidated: false, error: 'Invalid PIN' };
  }

  const fullName = `${match.firstName} ${match.lastName}`.trim();
  return { isValidated: true, empId: match.empId, role: match.role, fullName };
}

/**
 * Feature: mobile-order-workflow, Property 1: PIN validation matches on passcode AND laundry_id
 *
 * For any 4-digit passcode and laundry_id combination, the validate-pin endpoint SHALL return
 * isValidated: true with the correct emp_id if and only if there exists an active employee record
 * in shop.employees where passcode matches the submitted value AND laundry_id matches the
 * submitted laundry_id.
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 10.2**
 */
describe('Property 1: PIN validation matches on passcode AND laundry_id', () => {
  // Arbitrary: 4-digit passcode (string from "0000" to "9999")
  const passcodeArb = fc.integer({ min: 0, max: 9999 }).map((n) => String(n).padStart(4, '0'));

  // Arbitrary: laundry_id (numeric string, e.g. "1" to "100")
  const laundryIdArb = fc.integer({ min: 1, max: 100 }).map(String);

  // Arbitrary: employee record
  const employeeArb = fc.record({
    empId: fc.tuple(fc.constantFrom('EMP-', 'E-', 'STAFF-'), fc.nat({ max: 999 }).map((n) => String(n).padStart(3, '0'))).map(([prefix, num]) => `${prefix}${num}`),
    passcode: passcodeArb,
    laundryId: laundryIdArb,
    isActive: fc.boolean(),
    firstName: fc.constantFrom('Alice', 'Bob', 'Carlos', 'Diana', 'Eve'),
    lastName: fc.constantFrom('Smith', 'Jones', 'Lee', 'Garcia', 'Kim'),
    role: fc.constantFrom('Attendant', 'Manager', 'Driver'),
  });

  // Arbitrary: list of employees (1 to 10)
  const employeesArb = fc.array(employeeArb, { minLength: 1, maxLength: 10 });

  it('returns isValidated: true when passcode AND laundryId match an active employee', () => {
    fc.assert(
      fc.property(employeesArb, fc.nat({ max: 9 }), (employees, indexSeed) => {
        // Ensure at least one active employee exists
        const activeEmployees = employees.filter((e) => e.isActive);
        fc.pre(activeEmployees.length > 0);

        // Pick one active employee to validate against
        const target = activeEmployees[indexSeed % activeEmployees.length];

        const result = validatePin(employees, target.passcode, target.laundryId);

        // Must return isValidated: true with the correct emp_id
        return (
          result.isValidated === true &&
          result.empId === target.empId &&
          result.role === target.role
        );
      }),
      { numRuns: 100 }
    );
  });

  it('returns isValidated: false when passcode does not match any active employee for the given laundryId', () => {
    fc.assert(
      fc.property(employeesArb, passcodeArb, laundryIdArb, (employees, passcode, laundryId) => {
        // Precondition: no active employee has this exact passcode + laundryId combination
        const hasMatch = employees.some(
          (e) => e.passcode === passcode && e.laundryId === laundryId && e.isActive
        );
        fc.pre(!hasMatch);

        const result = validatePin(employees, passcode, laundryId);

        return result.isValidated === false;
      }),
      { numRuns: 100 }
    );
  });

  it('returns isValidated: false when laundryId does not match even if passcode matches another location', () => {
    fc.assert(
      fc.property(employeesArb, laundryIdArb, laundryIdArb, (employees, correctLaundryId, wrongLaundryId) => {
        // Ensure the two laundry IDs are different
        fc.pre(correctLaundryId !== wrongLaundryId);

        // Find an active employee at correctLaundryId
        const activeAtCorrect = employees.filter(
          (e) => e.laundryId === correctLaundryId && e.isActive
        );
        fc.pre(activeAtCorrect.length > 0);

        // Ensure no active employee at wrongLaundryId has the same passcode
        const target = activeAtCorrect[0];
        const hasMatchAtWrong = employees.some(
          (e) => e.passcode === target.passcode && e.laundryId === wrongLaundryId && e.isActive
        );
        fc.pre(!hasMatchAtWrong);

        // Validate with the correct passcode but wrong laundryId
        const result = validatePin(employees, target.passcode, wrongLaundryId);

        return result.isValidated === false;
      }),
      { numRuns: 100 }
    );
  });

  it('returns isValidated: false for inactive employee records even with correct passcode and laundryId', () => {
    fc.assert(
      fc.property(employeesArb, fc.nat({ max: 9 }), (employees, indexSeed) => {
        // Find employees that are inactive
        const inactiveEmployees = employees.filter((e) => !e.isActive);
        fc.pre(inactiveEmployees.length > 0);

        const target = inactiveEmployees[indexSeed % inactiveEmployees.length];

        // Ensure no active employee shares the same passcode + laundryId
        const hasActiveMatch = employees.some(
          (e) => e.passcode === target.passcode && e.laundryId === target.laundryId && e.isActive
        );
        fc.pre(!hasActiveMatch);

        const result = validatePin(employees, target.passcode, target.laundryId);

        return result.isValidated === false;
      }),
      { numRuns: 100 }
    );
  });

  it('validation result is deterministic: same inputs always produce same output', () => {
    fc.assert(
      fc.property(employeesArb, passcodeArb, laundryIdArb, (employees, passcode, laundryId) => {
        const result1 = validatePin(employees, passcode, laundryId);
        const result2 = validatePin(employees, passcode, laundryId);

        return (
          result1.isValidated === result2.isValidated &&
          result1.empId === result2.empId &&
          result1.role === result2.role
        );
      }),
      { numRuns: 100 }
    );
  });

  it('validates BOTH passcode AND laundryId must match (conjunction)', () => {
    fc.assert(
      fc.property(
        employeeArb,
        passcodeArb,
        laundryIdArb,
        (employee, randomPasscode, randomLaundryId) => {
          // Force the employee to be active
          const activeEmployee = { ...employee, isActive: true };
          const employees = [activeEmployee];

          const resultBothMatch = validatePin(employees, activeEmployee.passcode, activeEmployee.laundryId);
          const resultOnlyPasscode = validatePin(employees, activeEmployee.passcode, randomLaundryId);
          const resultOnlyLaundryId = validatePin(employees, randomPasscode, activeEmployee.laundryId);
          const resultNeitherMatch = validatePin(employees, randomPasscode, randomLaundryId);

          // Both match → validated
          const bothMatchCorrect = resultBothMatch.isValidated === true;

          // Only passcode matches (wrong laundryId) → not validated (unless randomLaundryId happens to equal the employee's)
          const onlyPasscodeCorrect =
            randomLaundryId === activeEmployee.laundryId || resultOnlyPasscode.isValidated === false;

          // Only laundryId matches (wrong passcode) → not validated (unless randomPasscode happens to equal the employee's)
          const onlyLaundryIdCorrect =
            randomPasscode === activeEmployee.passcode || resultOnlyLaundryId.isValidated === false;

          // Neither matches → not validated
          const neitherCorrect =
            (randomPasscode === activeEmployee.passcode && randomLaundryId === activeEmployee.laundryId) ||
            resultNeitherMatch.isValidated === false;

          return bothMatchCorrect && onlyPasscodeCorrect && onlyLaundryIdCorrect && neitherCorrect;
        }
      ),
      { numRuns: 100 }
    );
  });
});
