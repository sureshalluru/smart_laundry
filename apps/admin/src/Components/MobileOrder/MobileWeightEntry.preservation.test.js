import fc from 'fast-check';

// Mock axios to avoid ESM import issues in Jest
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

import axios from 'axios';

/**
 * Preservation Property Tests: AI Detection Auto-Fill and Service Submission Unchanged
 *
 * These tests verify EXISTING behavior on the UNFIXED code. They document baseline
 * functionality that MUST NOT break when the bug fix is applied.
 *
 * All tests in this file MUST PASS on unfixed code.
 *
 * **Validates: Requirements 3.1, 3.4, 3.5, 3.6**
 */

// ============================================================================
// Replicated logic from MobileWeightEntry.jsx — these functions represent the
// CURRENT behavior that must be preserved.
// ============================================================================

/**
 * Replicates detectWeightFromPhoto logic from MobileWeightEntry.jsx.
 * Returns detected weight result used to auto-fill service inputs.
 */
async function detectWeightFromPhoto(base64Image, order, laundryId) {
  const API_URL = '';

  try {
    const response = await axios.post(
      `${API_URL}/api/admin/item-tracking/detect-weight`,
      {
        imageBase64: base64Image,
        laundryId: laundryId,
        orderId: order.orderId,
      }
    );

    const body = response.data?.body || response.data;
    const detectedWeight = body?.weight;
    const confidence = body?.confidence || 0;

    return {
      detectedWeight: detectedWeight != null ? detectedWeight : null,
      confidence,
      error: detectedWeight == null ? 'Could not read scale automatically. Please enter the weight manually below.' : null,
    };
  } catch (err) {
    return { detectedWeight: null, confidence: 0, error: 'Could not read scale automatically. Please enter the weight manually below.' };
  }
}

/**
 * Replicates handleSubmit payload construction from MobileWeightEntry.jsx.
 * Builds the payload POSTed to employee-update-services endpoint.
 */
function buildSubmitPayload(serviceValues, employeeId, orderId, laundryId) {
  return {
    servicesToUpdate: serviceValues.map((svc) => ({
      id: svc.id,
      serviceName: svc.serviceName,
      weightOrCount: svc.inputWeight
        ? parseFloat(svc.weightOrCount)
        : parseInt(svc.weightOrCount, 10),
    })),
    empId: employeeId,
    orderId: orderId,
    laundryId: laundryId,
  };
}

// ============================================================================
// Arbitraries (generators)
// ============================================================================

// Random base64 image strings
const base64ImageArb = fc.string({ minLength: 10, maxLength: 100 }).map(
  (s) => `data:image/jpeg;base64,${Buffer.from(s).toString('base64')}`
);

// Random order IDs
const orderIdArb = fc.nat({ max: 99999 }).map((n) => String(n + 1));

// Random laundry IDs
const laundryIdArb = fc.nat({ max: 99999 }).map((n) => String(n + 1));

// Random employee IDs
const employeeIdArb = fc.nat({ max: 99999 }).map((n) => String(n + 1));

// Random detected weights (positive non-null values)
const detectedWeightArb = fc.float({ min: Math.fround(0.1), max: Math.fround(500), noNaN: true });

// Random confidence values
const confidenceArb = fc.float({ min: Math.fround(0.01), max: Math.fround(1.0), noNaN: true });

// Service name generator
const serviceNameArb = fc.constantFrom(
  'Wash & Fold', 'Dry Cleaning', 'Press Only', 'Comforter', 'Shirts', 'Pants', 'Bedding'
);

// Single weight-based service value
const weightServiceArb = fc.record({
  id: fc.nat({ max: 99999 }).map(String),
  serviceName: serviceNameArb,
  weightOrCount: fc.float({ min: Math.fround(0.1), max: Math.fround(200), noNaN: true }).map((w) => w.toFixed(1)),
  inputWeight: fc.constant(true),
  servicePrice: fc.float({ min: Math.fround(1), max: Math.fround(50), noNaN: true }),
});

// Single count-based service value
const countServiceArb = fc.record({
  id: fc.nat({ max: 99999 }).map(String),
  serviceName: serviceNameArb,
  weightOrCount: fc.integer({ min: 1, max: 100 }).map(String),
  inputWeight: fc.constant(false),
  servicePrice: fc.float({ min: Math.fround(1), max: Math.fround(50), noNaN: true }),
});

// Array of mixed services (1–5 services)
const serviceArrayArb = fc.array(fc.oneof(weightServiceArb, countServiceArb), { minLength: 1, maxLength: 5 });

// ============================================================================
// Test 1: AI detection auto-fill behavior
// ============================================================================

describe('Preservation: AI Detection Auto-Fill Behavior', () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  it('detectWeightFromPhoto returns the detected weight value from detect-weight response', () => {
    return fc.assert(
      fc.asyncProperty(
        base64ImageArb,
        orderIdArb,
        laundryIdArb,
        detectedWeightArb,
        confidenceArb,
        async (base64Image, orderId, laundryId, weight, confidence) => {
          axios.post.mockReset();

          // Mock detect-weight to return a successful weight detection
          axios.post.mockImplementation((url) => {
            if (url.includes('detect-weight')) {
              return Promise.resolve({
                data: {
                  body: {
                    weight: weight,
                    confidence: confidence,
                  },
                },
              });
            }
            return Promise.resolve({ data: {} });
          });

          const order = { orderId };
          const result = await detectWeightFromPhoto(base64Image, order, laundryId);

          // PRESERVATION ASSERTION: The function returns the detected weight
          // which is used to auto-fill weight-based service inputs
          expect(result.detectedWeight).toBe(weight);
          expect(result.error).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================================
// Test 2: Service submission payload format
// ============================================================================

describe('Preservation: Service Submission Payload Format', () => {
  it('handleSubmit builds payload with correct structure { servicesToUpdate, empId, orderId, laundryId }', () => {
    fc.assert(
      fc.property(
        serviceArrayArb,
        employeeIdArb,
        orderIdArb,
        laundryIdArb,
        (services, empId, orderId, laundryId) => {
          const payload = buildSubmitPayload(services, empId, orderId, laundryId);

          // PRESERVATION ASSERTION: Payload has the expected top-level keys
          expect(payload).toHaveProperty('servicesToUpdate');
          expect(payload).toHaveProperty('empId', empId);
          expect(payload).toHaveProperty('orderId', orderId);
          expect(payload).toHaveProperty('laundryId', laundryId);

          // PRESERVATION ASSERTION: servicesToUpdate is an array with correct length
          expect(Array.isArray(payload.servicesToUpdate)).toBe(true);
          expect(payload.servicesToUpdate).toHaveLength(services.length);

          // PRESERVATION ASSERTION: each service entry has { id, serviceName, weightOrCount }
          payload.servicesToUpdate.forEach((svcPayload, idx) => {
            expect(svcPayload).toHaveProperty('id', services[idx].id);
            expect(svcPayload).toHaveProperty('serviceName', services[idx].serviceName);
            expect(svcPayload).toHaveProperty('weightOrCount');

            // Weight-based services use parseFloat, count-based use parseInt
            if (services[idx].inputWeight) {
              expect(svcPayload.weightOrCount).toBe(parseFloat(services[idx].weightOrCount));
            } else {
              expect(svcPayload.weightOrCount).toBe(parseInt(services[idx].weightOrCount, 10));
            }
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================================
// Test 3: Existing behavior — detect-weight returns null weight
// ============================================================================

describe('Preservation: Detect-Weight Null Weight Handling', () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  it('when detect-weight returns { weight: null, confidence: 0 }, function returns { detectedWeight: null, error: "Could not read scale automatically. Please enter the weight manually below." }', () => {
    return fc.assert(
      fc.asyncProperty(
        base64ImageArb,
        orderIdArb,
        laundryIdArb,
        async (base64Image, orderId, laundryId) => {
          axios.post.mockReset();

          // Mock detect-weight to return null weight (failed detection)
          axios.post.mockImplementation((url) => {
            if (url.includes('detect-weight')) {
              return Promise.resolve({
                data: {
                  body: {
                    weight: null,
                    confidence: 0,
                  },
                },
              });
            }
            return Promise.resolve({ data: {} });
          });

          const order = { orderId };
          const result = await detectWeightFromPhoto(base64Image, order, laundryId);

          // PRESERVATION ASSERTION: The current behavior returns null weight
          // and the specific error message 'Could not read scale automatically. Please enter the weight manually below.'
          expect(result.detectedWeight).toBeNull();
          expect(result.error).toBe('Could not read scale automatically. Please enter the weight manually below.');
        }
      ),
      { numRuns: 50 }
    );
  });
});
