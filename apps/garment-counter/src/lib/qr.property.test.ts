import fc from 'fast-check';
import { encodeOrderId, extractOrderId } from './qr';

// Feature: realtime-garment-counter-ipad, Property 9: QR order-id extraction
// round-trip — For any order identifier encoded into the supported QR/barcode
// payload format, scanning and extracting the order id returns the original
// identifier unchanged.
// Validates: Requirements 6.7
describe('Property 9: QR order-id extraction round-trip', () => {
  // Order ids: non-empty, no leading/trailing whitespace, no ':' (reserved by
  // the order:{id} token form).
  const orderIdArb = fc
    .string({ minLength: 1, maxLength: 24 })
    .map((s) => s.replace(/[:\s]/g, ''))
    .filter((s) => s.length > 0);

  it('encodeOrderId -> extractOrderId returns the original id', () => {
    fc.assert(
      fc.property(orderIdArb, (orderId) => {
        expect(extractOrderId(encodeOrderId(orderId))).toBe(orderId);
      }),
      { numRuns: 100 },
    );
  });

  it('a bare order id round-trips unchanged', () => {
    fc.assert(
      fc.property(orderIdArb, (orderId) => {
        expect(extractOrderId(orderId)).toBe(orderId);
      }),
      { numRuns: 100 },
    );
  });

  it('extracts the id from a /order/{id} tracking URL', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 999_999 }).map(String),
        (orderId) => {
          const url = `https://app.example.com/42/admin/order/${orderId}`;
          expect(extractOrderId(url)).toBe(orderId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null for empty/whitespace payloads', () => {
    fc.assert(
      fc.property(fc.constantFrom('', '   ', '\t', '\n  '), (payload) => {
        expect(extractOrderId(payload)).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
