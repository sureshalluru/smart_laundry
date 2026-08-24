import fc from 'fast-check';
import { normalizeDetection } from './normalizeDetection';

// Feature: realtime-garment-counter-ipad, Property 4: Detection normalization
// well-formedness — For any valid raw EC2 /single_cloth/ response payload,
// normalizing it SHALL produce a DetectionEvent containing all required fields
// with values correctly mapped from the raw payload.
// Validates: Requirements 2.3

/** Arbitrary for a well-formed raw /single_cloth/ payload plus expectations. */
const validRawArb = fc.record({
  cloth_id: fc.integer({ min: 0, max: 1_000_000 }),
  cloth_type: fc.string({ minLength: 1, maxLength: 20 }),
  file_path: fc.string({ minLength: 1, maxLength: 40 }),
  date: fc
    .date({
      min: new Date('2000-01-01T00:00:00.000Z'),
      max: new Date('2100-01-01T00:00:00.000Z'),
      noInvalidDate: true,
    })
    .map((d) => d.toISOString()),
  ismodified: fc.boolean(),
  wash_type: fc.constantFrom('Before Wash', 'After Wash'),
  trans_id: fc.string({ minLength: 1, maxLength: 12 }),
  operator_name: fc.string({ minLength: 1, maxLength: 20 }),
  uniq_id: fc.uuid(),
  status: fc.string({ minLength: 1, maxLength: 12 }),
});

describe('Property 4: Detection normalization well-formedness', () => {
  it('maps every required field from any valid raw payload', () => {
    fc.assert(
      fc.property(validRawArb, (raw) => {
        const event = normalizeDetection(raw);
        expect(event).not.toBeNull();
        if (!event) return;
        expect(event.clothId).toBe(raw.cloth_id);
        expect(event.clothType).toBe(raw.cloth_type);
        expect(event.filePath).toBe(raw.file_path);
        expect(event.date).toBe(raw.date);
        expect(event.isModified).toBe(raw.ismodified);
        expect(event.washType).toBe(raw.wash_type);
        expect(event.transId).toBe(raw.trans_id);
        expect(event.operatorName).toBe(raw.operator_name);
        expect(event.uniqId).toBe(raw.uniq_id);
        expect(event.status).toBe(raw.status);
      }),
      { numRuns: 100 },
    );
  });

  it('carries confidence through only when the raw payload provides a finite number', () => {
    fc.assert(
      fc.property(
        validRawArb,
        fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
        (raw, confidence) => {
          const event = normalizeDetection({ ...raw, confidence });
          expect(event).not.toBeNull();
          if (!event) return;
          if (confidence === undefined) {
            expect(event.confidence).toBeUndefined();
          } else {
            expect(event.confidence).toBe(confidence);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null when any required field is missing', () => {
    const requiredKeys = [
      'cloth_id',
      'cloth_type',
      'file_path',
      'date',
      'wash_type',
      'trans_id',
      'operator_name',
      'uniq_id',
      'status',
    ] as const;

    fc.assert(
      fc.property(
        validRawArb,
        fc.constantFrom(...requiredKeys),
        (raw, keyToDrop) => {
          const broken: Record<string, unknown> = { ...raw };
          delete broken[keyToDrop];
          expect(normalizeDetection(broken)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null for non-object inputs', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.integer(),
          fc.string(),
          fc.boolean(),
        ),
        (bad) => {
          expect(normalizeDetection(bad)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
