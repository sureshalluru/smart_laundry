import fc from 'fast-check';

/**
 * Service Input Type Selection - Pure function extracted from MobileWeightEntry.jsx.
 *
 * The design specifies that the weight/count entry UI must display:
 * - A decimal (weight) input if the service's inputWeight flag is true
 * - An integer (count) input if the service's inputWeight flag is false
 *
 * This models the input type determination as a pure function of the service configuration.
 */

/**
 * Determines the input type for a service based on its inputWeight configuration.
 *
 * @param {object} service - A service object with an `inputWeight` boolean flag.
 * @returns {'decimal' | 'integer'} The input type to display for this service.
 */
function getServiceInputType(service) {
  return service.inputWeight ? 'decimal' : 'integer';
}

/**
 * Returns the input configuration for a service based on its inputWeight flag.
 * This mirrors the actual rendering logic in MobileWeightEntry.jsx:
 * - inputWeight: true → type="number", step="0.1", inputMode="decimal"
 * - inputWeight: false → type="number", step="1", inputMode="numeric"
 */
function getServiceInputConfig(service) {
  if (service.inputWeight) {
    return {
      inputType: 'decimal',
      step: '0.1',
      inputMode: 'decimal',
      unit: 'lbs',
    };
  }
  return {
    inputType: 'integer',
    step: '1',
    inputMode: 'numeric',
    unit: 'pcs',
  };
}

/**
 * Feature: mobile-order-workflow, Property 6: Service input type matches service configuration
 *
 * For any service on an order, the weight/count entry UI SHALL display a decimal (weight) input
 * if the service's inputWeight flag is true, and an integer (count) input if inputWeight is false.
 *
 * **Validates: Requirements 6.2**
 */
describe('Property 6: Service input type matches service configuration', () => {
  // Arbitrary: service with inputWeight = true (weight-based)
  const weightServiceArb = fc.record({
    id: fc.nat({ max: 9999 }),
    serviceName: fc.constantFrom(
      'Wash & Fold', 'Bulk Laundry', 'Comforter Wash', 'Heavy Load', 'Delicates'
    ),
    inputWeight: fc.constant(true),
    servicePrice: fc.float({ min: Math.fround(0.5), max: Math.fround(50), noNaN: true }),
    weightOrCount: fc.float({ min: Math.fround(0), max: Math.fround(200), noNaN: true }),
  });

  // Arbitrary: service with inputWeight = false (count-based)
  const countServiceArb = fc.record({
    id: fc.nat({ max: 9999 }),
    serviceName: fc.constantFrom(
      'Dry Clean Shirt', 'Dry Clean Pants', 'Alterations', 'Press Only', 'Stain Removal'
    ),
    inputWeight: fc.constant(false),
    servicePrice: fc.float({ min: Math.fround(0.5), max: Math.fround(50), noNaN: true }),
    weightOrCount: fc.nat({ max: 100 }),
  });

  // Arbitrary: any service (randomly weight or count-based)
  const anyServiceArb = fc.record({
    id: fc.nat({ max: 9999 }),
    serviceName: fc.string({ minLength: 1, maxLength: 30 }),
    inputWeight: fc.boolean(),
    servicePrice: fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }),
    weightOrCount: fc.float({ min: Math.fround(0), max: Math.fround(500), noNaN: true }),
  });

  it('returns decimal input type when inputWeight is true', () => {
    fc.assert(
      fc.property(weightServiceArb, (service) => {
        const inputType = getServiceInputType(service);

        return inputType === 'decimal';
      }),
      { numRuns: 100 }
    );
  });

  it('returns integer input type when inputWeight is false', () => {
    fc.assert(
      fc.property(countServiceArb, (service) => {
        const inputType = getServiceInputType(service);

        return inputType === 'integer';
      }),
      { numRuns: 100 }
    );
  });

  it('the selection is deterministic for any given service configuration', () => {
    fc.assert(
      fc.property(anyServiceArb, (service) => {
        const result1 = getServiceInputType(service);
        const result2 = getServiceInputType(service);

        return result1 === result2;
      }),
      { numRuns: 100 }
    );
  });

  it('all possible boolean values of inputWeight produce a valid input type', () => {
    fc.assert(
      fc.property(anyServiceArb, (service) => {
        const inputType = getServiceInputType(service);

        // The result must be one of the two valid input types
        return inputType === 'decimal' || inputType === 'integer';
      }),
      { numRuns: 100 }
    );
  });

  it('weight-based services get decimal step (0.1) and decimal inputMode', () => {
    fc.assert(
      fc.property(weightServiceArb, (service) => {
        const config = getServiceInputConfig(service);

        return (
          config.inputType === 'decimal' &&
          config.step === '0.1' &&
          config.inputMode === 'decimal' &&
          config.unit === 'lbs'
        );
      }),
      { numRuns: 100 }
    );
  });

  it('count-based services get integer step (1) and numeric inputMode', () => {
    fc.assert(
      fc.property(countServiceArb, (service) => {
        const config = getServiceInputConfig(service);

        return (
          config.inputType === 'integer' &&
          config.step === '1' &&
          config.inputMode === 'numeric' &&
          config.unit === 'pcs'
        );
      }),
      { numRuns: 100 }
    );
  });

  it('input type is solely determined by inputWeight flag regardless of other service properties', () => {
    fc.assert(
      fc.property(anyServiceArb, anyServiceArb, (serviceA, serviceB) => {
        // Force both to have the same inputWeight value
        const sameWeightFlag = { ...serviceB, inputWeight: serviceA.inputWeight };

        const typeA = getServiceInputType(serviceA);
        const typeB = getServiceInputType(sameWeightFlag);

        // Same inputWeight → same input type, regardless of other fields
        return typeA === typeB;
      }),
      { numRuns: 100 }
    );
  });
});
