/**
 * Extract the order id (used as `trans_id`) from a scanned QR/barcode payload.
 *
 * Supported payload formats, in priority order:
 *  1. A URL whose path ends in `/order/{orderId}` or that carries an `order`
 *     or `orderId` query parameter (e.g. an admin/customer tracking link).
 *  2. A prefixed token `order:{orderId}`.
 *  3. A bare order identifier string.
 *
 * Returns the trimmed order id, or `null` if the payload is empty/whitespace.
 * The extraction is round-trip safe: encoding a valid order id via
 * {@link encodeOrderId} and scanning it returns the original id unchanged.
 *
 * @remarks Requirement 6.7.
 */
export function extractOrderId(payload: string): string | null {
  if (typeof payload !== 'string') return null;
  const trimmed = payload.trim();
  if (trimmed === '') return null;

  // 1. URL forms
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const q = url.searchParams.get('orderId') ?? url.searchParams.get('order');
      if (q && q.trim() !== '') return q.trim();

      const segments = url.pathname.split('/').filter(Boolean);
      const orderIdx = segments.lastIndexOf('order');
      if (orderIdx !== -1 && orderIdx + 1 < segments.length) {
        return decodeURIComponent(segments[orderIdx + 1]);
      }
      // fall back to the last non-empty path segment
      if (segments.length > 0) {
        return decodeURIComponent(segments[segments.length - 1]);
      }
      return null;
    } catch {
      // malformed URL — fall through to token/bare handling
    }
  }

  // 2. Prefixed token `order:{id}`
  const prefixMatch = /^order:(.+)$/i.exec(trimmed);
  if (prefixMatch) {
    const id = prefixMatch[1].trim();
    return id === '' ? null : id;
  }

  // 3. Bare identifier
  return trimmed;
}

/**
 * Encode an order id into the canonical `order:{id}` QR payload form. Provided
 * for round-trip testing and for generating scannable tickets.
 */
export function encodeOrderId(orderId: string): string {
  return `order:${orderId}`;
}
