import fc from 'fast-check';
import { buildStartTransactionUrl } from './jetsonUrl';
import type { WashMode } from '../types';

// Feature: realtime-garment-counter-ipad, Property 8: Transaction-start URL
// contains all required encoded parameters — For any valid session params, the
// constructed Jetson GET /transaction/ URL contains all required query params,
// and each value is URL-encoded such that decoding reproduces the original.
// Validates: Requirements 6.2
describe('Property 8: Transaction-start URL contains all required encoded parameters', () => {
  const paramsArb = fc.record({
    transId: fc.string({ minLength: 1, maxLength: 20 }),
    type: fc.constantFrom<WashMode>('Before Wash', 'After Wash'),
    operatorName: fc.string({ minLength: 1, maxLength: 30 }),
    uniqId: fc.uuid(),
    date: fc
      .date({
        min: new Date('2000-01-01T00:00:00.000Z'),
        max: new Date('2100-01-01T00:00:00.000Z'),
        noInvalidDate: true,
      })
      .map((d) => d.toISOString()),
  });

  it('includes every required param, decodable back to the exact input', () => {
    fc.assert(
      fc.property(
        fc.webUrl().filter((u) => u.length > 0),
        paramsArb,
        (base, params) => {
          const url = buildStartTransactionUrl(base, params);
          const parsed = new URL(url);

          expect(parsed.pathname.endsWith('/transaction/')).toBe(true);

          const sp = parsed.searchParams;
          expect(sp.get('id')).toBe(params.transId);
          expect(sp.get('type')).toBe(params.type);
          expect(sp.get('operator_name')).toBe(params.operatorName);
          expect(sp.get('uniq_id')).toBe(params.uniqId);
          expect(sp.get('date')).toBe(params.date);
        },
      ),
      { numRuns: 100 },
    );
  });
});
