import fc from 'fast-check';
import { buildOrderUrl } from './ticketPrint';

/**
 * Property 1: URL construction produces valid order URLs
 *
 * For any laundry domain (including null/empty) and any valid order ID and laundry ID,
 * the buildOrderUrl function SHALL produce a URL that:
 * - Starts with https:// when a custom domain is provided
 * - Contains the laundryId and orderId in the path pattern /{laundryId}/admin/order/{orderId}
 * - Falls back to the default origin when no custom domain is configured
 * - Never produces a URL with double slashes in the path segment
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */
describe('Property 1: URL construction produces valid order URLs', () => {
  const MOCK_ORIGIN = 'https://app.smartlaundrybasket.ai';

  beforeAll(() => {
    delete window.location;
    window.location = { origin: MOCK_ORIGIN };
  });

  afterAll(() => {
    window.location = { origin: MOCK_ORIGIN };
  });

  // Arbitrary for non-empty domain strings (like "example.com", "my-laundry.net")
  const domainArb = fc.domain();

  // Arbitrary for laundryId (numeric string or short alphanumeric)
  const laundryIdArb = fc.nat({ max: 9999 }).map(n => String(n));

  // Arbitrary for orderId (format like "IS-1FCC7193" or "O-ABC123")
  const orderIdArb = fc.tuple(
    fc.constantFrom('IS', 'O', 'ORD', 'QP'),
    fc.string({ minLength: 4, maxLength: 10, unit: fc.constantFrom(
      ...'ABCDEF0123456789'.split('')
    )})
  ).map(([prefix, hex]) => `${prefix}-${hex}`);

  // Arbitrary for domains that may have trailing slashes
  const domainWithTrailingSlashArb = fc.tuple(
    domainArb,
    fc.constantFrom('', '/', '//', '///')
  ).map(([d, suffix]) => d + suffix);

  // Arbitrary for "empty-like" domains (null, undefined, empty, whitespace)
  const emptyDomainArb = fc.constantFrom(null, undefined, '', '  ', '\t', '   ');

  it('starts with https:// when a custom domain is provided (without http prefix)', () => {
    fc.assert(
      fc.property(
        domainWithTrailingSlashArb,
        laundryIdArb,
        orderIdArb,
        (domain, laundryId, orderId) => {
          const url = buildOrderUrl(laundryId, orderId, domain);
          return url.startsWith('https://');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('starts with https:// when custom domain is provided with https:// prefix', () => {
    fc.assert(
      fc.property(
        domainWithTrailingSlashArb.map(d => `https://${d}`),
        laundryIdArb,
        orderIdArb,
        (domain, laundryId, orderId) => {
          const url = buildOrderUrl(laundryId, orderId, domain);
          return url.startsWith('https://');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('contains /{laundryId}/admin/order/{orderId} in the path', () => {
    fc.assert(
      fc.property(
        fc.oneof(domainWithTrailingSlashArb, emptyDomainArb),
        laundryIdArb,
        orderIdArb,
        (domain, laundryId, orderId) => {
          const url = buildOrderUrl(laundryId, orderId, domain);
          const expectedPath = `/${laundryId}/admin/order/${orderId}`;
          return url.includes(expectedPath);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('never produces double slashes in the path segment (after protocol)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          domainWithTrailingSlashArb,
          domainWithTrailingSlashArb.map(d => `https://${d}`),
          emptyDomainArb
        ),
        laundryIdArb,
        orderIdArb,
        (domain, laundryId, orderId) => {
          const url = buildOrderUrl(laundryId, orderId, domain);
          // Strip protocol (https:// or http://) and check remaining for double slashes
          const afterProtocol = url.replace(/^https?:\/\//, '');
          return !afterProtocol.includes('//');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('falls back to window.location.origin when no custom domain is provided', () => {
    fc.assert(
      fc.property(
        emptyDomainArb,
        laundryIdArb,
        orderIdArb,
        (domain, laundryId, orderId) => {
          const url = buildOrderUrl(laundryId, orderId, domain);
          return url.startsWith(MOCK_ORIGIN);
        }
      ),
      { numRuns: 100 }
    );
  });
});
