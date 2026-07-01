import fc from 'fast-check';
import { buildOrderUrl, buildCustomerTrackingUrl, generateTicketHtml } from './ticketPrint';

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


/**
 * Feature: mobile-order-workflow, Property 7: Ticket URL generation produces correct patterns
 *
 * For any valid laundryId and orderId, the internal ticket URL SHALL follow the pattern
 * {baseUrl}/{laundryId}/admin/order/{orderId} and the customer ticket URL SHALL follow the
 * pattern {baseUrl}/{laundryId}/site/tracking?orderId={orderId}.
 *
 * **Validates: Requirements 8.2, 8.4**
 */
describe('Property 7: Ticket URL generation produces correct patterns', () => {
  const MOCK_ORIGIN = 'https://app.smartlaundrybasket.ai';

  beforeAll(() => {
    delete window.location;
    window.location = { origin: MOCK_ORIGIN };
  });

  afterAll(() => {
    window.location = { origin: MOCK_ORIGIN };
  });

  // Arbitrary for laundryId (numeric string)
  const laundryIdArb = fc.nat({ max: 9999 }).map((n) => String(n));

  // Arbitrary for orderId (format like "IS-1FCC7193" or "QP-ABC123")
  const orderIdArb = fc
    .tuple(
      fc.constantFrom('IS', 'O', 'ORD', 'QP'),
      fc.string({
        minLength: 4,
        maxLength: 10,
        unit: fc.constantFrom(...'ABCDEF0123456789'.split('')),
      })
    )
    .map(([prefix, hex]) => `${prefix}-${hex}`);

  // Arbitrary for custom domains (may be null/undefined/empty or a real domain)
  const domainArb = fc.domain();
  const emptyDomainArb = fc.constantFrom(null, undefined, '', '  ');
  const domainWithProtocolArb = fc.oneof(
    domainArb,
    domainArb.map((d) => `https://${d}`),
    domainArb.map((d) => `http://${d}`),
    emptyDomainArb
  );

  it('internal URL always contains /{laundryId}/admin/order/{orderId} path segment', () => {
    fc.assert(
      fc.property(
        laundryIdArb,
        orderIdArb,
        domainWithProtocolArb,
        (laundryId, orderId, domain) => {
          const url = buildOrderUrl(laundryId, orderId, domain);
          const expectedPath = `/${laundryId}/admin/order/${orderId}`;
          return url.includes(expectedPath);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('customer URL always contains /{laundryId}/site/tracking?orderId={orderId} path segment', () => {
    fc.assert(
      fc.property(
        laundryIdArb,
        orderIdArb,
        domainWithProtocolArb,
        (laundryId, orderId, domain) => {
          const url = buildCustomerTrackingUrl(laundryId, orderId, domain);
          const expectedPath = `/${laundryId}/site/tracking?orderId=${orderId}`;
          return url.includes(expectedPath);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('internal and customer URLs always have different path patterns', () => {
    fc.assert(
      fc.property(
        laundryIdArb,
        orderIdArb,
        domainWithProtocolArb,
        (laundryId, orderId, domain) => {
          const internalUrl = buildOrderUrl(laundryId, orderId, domain);
          const customerUrl = buildCustomerTrackingUrl(laundryId, orderId, domain);
          return internalUrl !== customerUrl;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('both URLs always start with a valid protocol (http:// or https://)', () => {
    fc.assert(
      fc.property(
        laundryIdArb,
        orderIdArb,
        domainWithProtocolArb,
        (laundryId, orderId, domain) => {
          const internalUrl = buildOrderUrl(laundryId, orderId, domain);
          const customerUrl = buildCustomerTrackingUrl(laundryId, orderId, domain);
          const validProtocol = (url) =>
            url.startsWith('http://') || url.startsWith('https://');
          return validProtocol(internalUrl) && validProtocol(customerUrl);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('neither URL contains double slashes except after protocol', () => {
    fc.assert(
      fc.property(
        laundryIdArb,
        orderIdArb,
        domainWithProtocolArb,
        (laundryId, orderId, domain) => {
          const internalUrl = buildOrderUrl(laundryId, orderId, domain);
          const customerUrl = buildCustomerTrackingUrl(laundryId, orderId, domain);
          const noDoubleSlashes = (url) => {
            const afterProtocol = url.replace(/^https?:\/\//, '');
            return !afterProtocol.includes('//');
          };
          return noDoubleSlashes(internalUrl) && noDoubleSlashes(customerUrl);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: mobile-order-workflow, Property 8: Both ticket types include order ID and customer name
 *
 * For any order with an orderId and customerName, both the internal ticket HTML and the
 * customer ticket HTML SHALL contain the orderId string and customerName string.
 *
 * **Validates: Requirements 8.7**
 */
describe('Property 8: Both ticket types include order ID and customer name', () => {
  const MOCK_ORIGIN = 'https://app.smartlaundrybasket.ai';

  beforeAll(() => {
    delete window.location;
    window.location = { origin: MOCK_ORIGIN };
  });

  afterAll(() => {
    window.location = { origin: MOCK_ORIGIN };
  });

  // Arbitrary for laundryId (numeric string)
  const laundryIdArb = fc.nat({ max: 9999 }).map((n) => String(n));

  // Arbitrary for orderId (format like "IS-1FCC7193" or "QP-ABC123")
  const orderIdArb = fc
    .tuple(
      fc.constantFrom('IS', 'O', 'ORD', 'QP'),
      fc.string({
        minLength: 4,
        maxLength: 10,
        unit: fc.constantFrom(...'ABCDEF0123456789'.split('')),
      })
    )
    .map(([prefix, hex]) => `${prefix}-${hex}`);

  // Arbitrary for customer names (non-empty strings with printable characters)
  const customerNameArb = fc.string({ minLength: 1, maxLength: 50, unit: fc.constantFrom(
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '.split('')
  )});

  it('internal ticket HTML contains the orderId', () => {
    fc.assert(
      fc.property(
        laundryIdArb,
        orderIdArb,
        customerNameArb,
        (laundryId, orderId, customerName) => {
          const html = generateTicketHtml({
            orderId,
            laundryId,
            customerName,
            ticketType: 'internal',
          });
          return html.includes(orderId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('internal ticket HTML contains the customerName', () => {
    fc.assert(
      fc.property(
        laundryIdArb,
        orderIdArb,
        customerNameArb,
        (laundryId, orderId, customerName) => {
          const html = generateTicketHtml({
            orderId,
            laundryId,
            customerName,
            ticketType: 'internal',
          });
          return html.includes(customerName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('customer ticket HTML contains the orderId', () => {
    fc.assert(
      fc.property(
        laundryIdArb,
        orderIdArb,
        customerNameArb,
        (laundryId, orderId, customerName) => {
          const html = generateTicketHtml({
            orderId,
            laundryId,
            customerName,
            ticketType: 'customer',
          });
          return html.includes(orderId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('customer ticket HTML contains the customerName', () => {
    fc.assert(
      fc.property(
        laundryIdArb,
        orderIdArb,
        customerNameArb,
        (laundryId, orderId, customerName) => {
          const html = generateTicketHtml({
            orderId,
            laundryId,
            customerName,
            ticketType: 'customer',
          });
          return html.includes(customerName);
        }
      ),
      { numRuns: 100 }
    );
  });
});
