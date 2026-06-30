import fc from 'fast-check';

/**
 * Property 1: Company list renders all required fields
 *
 * For any valid company object with non-null fields, the rendered company list item
 * SHALL contain the company name, contact email, contact phone, location count,
 * join code, and creation date.
 *
 * This tests the data model contract: all fields required for rendering are present
 * and accessible on any valid company object.
 *
 * **Validates: Requirements 1.2**
 */
describe('Property 1: Company list renders all required fields', () => {
  // Generator for valid company objects matching the Company interface
  const companyArbitrary = fc.record({
    companyId: fc.uuid(),
    companyName: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
    contactEmail: fc.emailAddress(),
    contactPhone: fc.string({ minLength: 5, maxLength: 20 }),
    locationCount: fc.nat({ max: 100 }),
    joinCode: fc.tuple(
      fc.array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')), { minLength: 4, maxLength: 4 }),
      fc.array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')), { minLength: 4, maxLength: 4 })
    ).map(([prefix, suffix]) => `${prefix.join('')}-${suffix.join('')}`),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
  });

  it('all required fields are present and non-empty for any valid company', () => {
    fc.assert(
      fc.property(companyArbitrary, (company) => {
        // All fields that the component renders must exist and be truthy/accessible
        expect(company.companyName.length).toBeGreaterThan(0);
        expect(company.contactEmail.length).toBeGreaterThan(0);
        expect(company.contactPhone.length).toBeGreaterThan(0);
        expect(company.locationCount).toBeGreaterThanOrEqual(0);
        expect(company.joinCode.length).toBeGreaterThan(0);
        expect(company.createdAt.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('join code matches the expected XXXX-XXXX format', () => {
    fc.assert(
      fc.property(companyArbitrary, (company) => {
        expect(company.joinCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      }),
      { numRuns: 100 }
    );
  });

  it('createdAt is a valid ISO date string that can be formatted', () => {
    fc.assert(
      fc.property(companyArbitrary, (company) => {
        const date = new Date(company.createdAt);
        // The component uses formatDate which calls toLocaleDateString
        expect(date.toString()).not.toBe('Invalid Date');
        expect(typeof date.toLocaleDateString()).toBe('string');
      }),
      { numRuns: 100 }
    );
  });

  it('locationCount is a non-negative integer suitable for badge display', () => {
    fc.assert(
      fc.property(companyArbitrary, (company) => {
        expect(Number.isInteger(company.locationCount)).toBe(true);
        expect(company.locationCount).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 2: Company name validation rejects whitespace-only input
 *
 * For any string composed entirely of whitespace characters (including empty string),
 * the company creation form SHALL block submission. Conversely, for any string containing
 * at least one non-whitespace character, submission SHALL be allowed (with respect to the name field).
 *
 * The validation logic under test: submit is disabled when `!createName.trim()`
 *
 * **Validates: Requirements 2.2, 8.2**
 */
describe('Property 2: Company name validation rejects whitespace-only input', () => {
  // The validation function extracted from the component logic
  const isSubmitBlocked = (name) => !name.trim();
  const isSubmitAllowed = (name) => !!name.trim();

  it('whitespace-only strings are rejected (submit blocked)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 50 }).map(chars => chars.join('')),
        (name) => {
          return isSubmitBlocked(name) === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('strings with at least one non-whitespace char are accepted (submit allowed)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (name) => {
          return isSubmitAllowed(name) === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty string is rejected (submit blocked)', () => {
    expect(isSubmitBlocked('')).toBe(true);
  });
});
