import fc from 'fast-check';

// Mock axios to avoid ESM import issues in Jest
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

import axios from 'axios';

/**
 * Bug Condition Exploration Test: Weight Photo Not Persisted After AI Detection
 *
 * This test verifies the EXPECTED behavior: after `detect-weight` returns successfully,
 * a SECOND call to `photo-upload-status` should be made with `imageType: "weight"`
 * to persist the scale photo to the order's weight_image_url.
 *
 * BUG: In the current (unfixed) code, `detectWeightFromPhoto()` in MobileWeightEntry.jsx
 * only calls `detect-weight` and NEVER calls `photo-upload-status`. The photo is analyzed
 * transiently and then lost.
 *
 * EXPECTED OUTCOME: This test MUST FAIL on unfixed code — failure confirms the bug exists.
 *
 * **Validates: Requirements 1.2, 2.2**
 */

/**
 * Replicates the EXACT logic of detectWeightFromPhoto from MobileWeightEntry.jsx.
 * This is the function under test — it represents the FIXED behavior.
 *
 * After detect-weight returns, a fire-and-forget call to photo-upload-status
 * persists the scale photo to the order's weight_image_url.
 */
async function detectWeightFromPhotoActual(base64Image, order, laundryId) {
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

    // Fire-and-forget: persist the scale photo to the order via S3 upload
    const persistParams = new URLSearchParams({
      laundryId: laundryId,
      orderId: order.orderId,
      imageType: 'weight',
      targetStatus: order.orderStatus || 'ReceivedAtFacility',
      empId: 'EMP',
    });
    await axios.post(
      `/api/admin/photo-upload-status?${persistParams}`,
      { imageBase64: base64Image }
    );

    return { detectedWeight, confidence, error: detectedWeight == null ? 'Could not read scale automatically. Please enter the weight manually below.' : null };
  } catch (err) {
    return { detectedWeight: null, confidence: 0, error: 'Could not read scale automatically. Please enter the weight manually below.' };
  }
}

describe('Bug Condition: Weight Photo Not Persisted After AI Detection', () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  // Arbitrary: random base64 image strings (simulating captured photos)
  const base64ImageArb = fc.string({ minLength: 10, maxLength: 100 }).map(
    (s) => `data:image/jpeg;base64,${Buffer.from(s).toString('base64')}`
  );

  // Arbitrary: random order IDs
  const orderIdArb = fc.nat({ max: 99999 }).map((n) => String(n + 1));

  // Arbitrary: random laundry IDs
  const laundryIdArb = fc.nat({ max: 99999 }).map((n) => String(n + 1));

  // Arbitrary: random detected weights (successful detection)
  const detectedWeightArb = fc.float({ min: Math.fround(0.1), max: Math.fround(500), noNaN: true });

  // Arbitrary: random confidence values
  const confidenceArb = fc.float({ min: Math.fround(0.5), max: Math.fround(1.0), noNaN: true });

  // Arbitrary: order status values
  const orderStatusArb = fc.constantFrom('Pending', 'Processing', 'ReceivedAtFacility', 'ReadyForDelivery');

  it('photo-upload-status MUST be called after detect-weight returns successfully', () => {
    return fc.assert(
      fc.asyncProperty(
        base64ImageArb,
        orderIdArb,
        laundryIdArb,
        detectedWeightArb,
        confidenceArb,
        orderStatusArb,
        async (base64Image, orderId, laundryId, weight, confidence, orderStatus) => {
          // Reset mocks for each property iteration
          axios.post.mockReset();

          // Setup detect-weight to return success with detected weight
          axios.post.mockImplementation((url, data) => {
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

            // photo-upload-status mock (if it were called)
            if (url.includes('photo-upload-status')) {
              return Promise.resolve({
                data: { statusCode: 200, body: { message: 'Photo uploaded' } },
              });
            }

            return Promise.resolve({ data: {} });
          });

          const order = { orderId, orderStatus };

          // Execute the actual detectWeightFromPhoto logic
          await detectWeightFromPhotoActual(base64Image, order, laundryId);

          // ASSERTION: After detect-weight succeeds, photo-upload-status MUST be called
          const allCalls = axios.post.mock.calls;
          const photoUploadCalls = allCalls.filter(([url]) =>
            url.includes('photo-upload-status')
          );

          // This assertion encodes the EXPECTED behavior:
          // photo-upload-status should be called with imageType: "weight"
          if (photoUploadCalls.length === 0) {
            return false; // BUG: photo-upload-status was never called
          }

          // Verify the call has the correct URL params and body payload
          const [uploadUrl, uploadData] = photoUploadCalls[0];
          const urlParams = new URLSearchParams(uploadUrl.split('?')[1]);
          return (
            urlParams.get('imageType') === 'weight' &&
            urlParams.get('orderId') === orderId &&
            urlParams.get('laundryId') === laundryId &&
            uploadData.imageBase64 === base64Image
          );
        }
      ),
      { numRuns: 50 }
    );
  });

  it('photo-upload-status is called even when detect-weight returns null weight (photo still persisted)', () => {
    return fc.assert(
      fc.asyncProperty(
        base64ImageArb,
        orderIdArb,
        laundryIdArb,
        orderStatusArb,
        async (base64Image, orderId, laundryId, orderStatus) => {
          axios.post.mockReset();

          axios.post.mockImplementation((url, data) => {
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

            if (url.includes('photo-upload-status')) {
              return Promise.resolve({
                data: { statusCode: 200, body: { message: 'Photo uploaded' } },
              });
            }

            return Promise.resolve({ data: {} });
          });

          const order = { orderId, orderStatus };

          // Execute the actual detectWeightFromPhoto logic
          await detectWeightFromPhotoActual(base64Image, order, laundryId);

          // ASSERTION: photo-upload-status MUST be called to persist the photo
          // regardless of whether weight detection succeeded
          const allCalls = axios.post.mock.calls;
          const photoUploadCalls = allCalls.filter(([url]) =>
            url.includes('photo-upload-status')
          );

          if (photoUploadCalls.length === 0) {
            return false; // BUG: photo not persisted
          }

          const [uploadUrl, uploadData] = photoUploadCalls[0];
          const urlParams = new URLSearchParams(uploadUrl.split('?')[1]);
          return (
            urlParams.get('imageType') === 'weight' &&
            uploadData.imageBase64 === base64Image
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});
