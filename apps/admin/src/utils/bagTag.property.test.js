import fc from 'fast-check';
import { buildOrderUrl, generateBagTagHtml } from './ticketPrint';

/**
 * Bag-tag printing (scale-integration-bag-tags spec).
 *
 * generateBagTagHtml produces one compact label per physical bag. Each label
 * carries a QR that resolves to the SAME employee order page as the ticket QR
 * (buildOrderUrl). These property tests validate the invariants that let bags
 * be reliably matched back to an order and reprinted identically.
 *
 * **Validates: Requirements 3.1, 3.2, 3.4, 3.7**
 */
describe('generateBagTagHtml', () => {
  const MOCK_ORIGIN = 'https://app.smartlaundrybasket.ai';

  beforeAll(() => {
    delete window.location;
    window.location = { origin: MOCK_ORIGIN };
  });

  afterAll(() => {
    window.location = { origin: MOCK_ORIGIN };
  });

  const laundryIdArb = fc.nat({ max: 9999 }).map((n) => String(n));

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

  const domainArb = fc.domain();
  const emptyDomainArb = fc.constantFrom(null, undefined, '', '  ');
  const domainWithProtocolArb = fc.oneof(
    domainArb,
    domainArb.map((d) => `https://${d}`),
    emptyDomainArb
  );

  // 1..10 bags
  const bagsArb = fc.integer({ min: 1, max: 10 });

  // Count non-overlapping occurrences of a substring
  const countOccurrences = (haystack, needle) => {
    if (!needle) return 0;
    let count = 0;
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
      count += 1;
      idx = haystack.indexOf(needle, idx + needle.length);
    }
    return count;
  };

  /**
   * Property 1: one label block per bag.
   * For N bags there are exactly N "Bag n of N" labels and N QR containers.
   * **Validates: Requirement 3.1**
   */
  it('renders exactly one label (and one QR container) per bag', () => {
    fc.assert(
      fc.property(
        laundryIdArb,
        orderIdArb,
        domainWithProtocolArb,
        bagsArb,
        (laundryId, orderId, domain, bags) => {
          const html = generateBagTagHtml({
            orderId,
            laundryId,
            userDomain: domain,
            bags,
            storeName: 'Test Store',
            customerName: 'Jane Doe',
            intakeDate: '2026-08-28',
          });

          const labelBlocks = countOccurrences(html, 'class="bag-label"');
          const qrContainers = countOccurrences(html, 'id="bag-qr-');
          const bagOfLabels = countOccurrences(html, ` of ${bags}<`);

          return (
            labelBlocks === bags &&
            qrContainers === bags &&
            bagOfLabels === bags
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: the QR data equals buildOrderUrl(...) — same scan target as the ticket.
   * **Validates: Requirement 3.4**
   */
  it('encodes the employee order URL (buildOrderUrl) in every QR', () => {
    fc.assert(
      fc.property(
        laundryIdArb,
        orderIdArb,
        domainWithProtocolArb,
        bagsArb,
        (laundryId, orderId, domain, bags) => {
          const html = generateBagTagHtml({
            orderId,
            laundryId,
            userDomain: domain,
            bags,
            storeName: 'Test Store',
            customerName: 'Jane Doe',
            intakeDate: '2026-08-28',
          });

          const expectedUrl = buildOrderUrl(laundryId, orderId, domain);
          // One QRCode.toDataURL call per bag, each with the expected URL
          const qrCalls = countOccurrences(
            html,
            `QRCode.toDataURL('${expectedUrl}'`
          );
          return qrCalls === bags;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: label always contains order id, "Bag n of N", customer, intake date.
   * **Validates: Requirement 3.2**
   */
  it('includes order id, bag numbering, customer name, and intake date', () => {
    fc.assert(
      fc.property(
        laundryIdArb,
        orderIdArb,
        bagsArb,
        (laundryId, orderId, bags) => {
          const customerName = 'Jane Doe';
          const intakeDate = '2026-08-28';
          const html = generateBagTagHtml({
            orderId,
            laundryId,
            bags,
            storeName: 'Test Store',
            customerName,
            intakeDate,
          });

          return (
            html.includes(`Order ${orderId}`) &&
            html.includes(`Bag 1 of ${bags}`) &&
            html.includes(`Bag ${bags} of ${bags}`) &&
            html.includes(customerName) &&
            html.includes(intakeDate)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: per-bag weight is shown only when provided.
   * A bag with a weight renders "{weight} {unit}"; a bag without does not
   * gain a spurious weight line.
   * **Validates: Requirement 3.3 / 2.3**
   */
  it('renders weight only for bags that have one', () => {
    fc.assert(
      fc.property(
        laundryIdArb,
        orderIdArb,
        fc.integer({ min: 2, max: 6 }),
        (laundryId, orderId, bags) => {
          // Give only bag 1 a weight
          const bagWeights = [{ bagNumber: 1, weight: '12.3' }];
          const html = generateBagTagHtml({
            orderId,
            laundryId,
            bags,
            storeName: 'Test Store',
            customerName: 'Jane Doe',
            intakeDate: '2026-08-28',
            bagWeights,
            weightUnit: 'lb',
          });

          // exactly one weight line for the single weighed bag
          const weightLines = countOccurrences(html, 'class="bt-weight"');
          return weightLines === 1 && html.includes('12.3 lb');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('renders no weight line when no bagWeights are supplied', () => {
    const html = generateBagTagHtml({
      orderId: 'IS-ABC123',
      laundryId: '42',
      bags: 3,
      storeName: 'Test Store',
      customerName: 'Jane Doe',
      intakeDate: '2026-08-28',
    });
    expect(html.includes('class="bt-weight"')).toBe(false);
  });

  /**
   * Property 5: reprint stability — same inputs produce byte-identical output,
   * so a reprint yields the same tags (same QR target) as the original.
   * **Validates: Requirement 3.7**
   */
  it('is deterministic for identical inputs (stable reprints)', () => {
    fc.assert(
      fc.property(
        laundryIdArb,
        orderIdArb,
        domainWithProtocolArb,
        bagsArb,
        (laundryId, orderId, domain, bags) => {
          const opts = {
            orderId,
            laundryId,
            userDomain: domain,
            bags,
            storeName: 'Test Store',
            customerName: 'Jane Doe',
            intakeDate: '2026-08-28',
          };
          return generateBagTagHtml(opts) === generateBagTagHtml(opts);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('defaults to a single label when bags is missing or invalid', () => {
    const single = generateBagTagHtml({
      orderId: 'IS-ABC123',
      laundryId: '42',
      storeName: 'Test Store',
      customerName: 'Jane Doe',
      intakeDate: '2026-08-28',
    });
    expect(countOccurrences(single, 'class="bag-label"')).toBe(1);
    expect(single.includes('Bag 1 of 1')).toBe(true);
  });
});
