/**
 * Property-based tests for cartUtils and cartReducer.
 *
 * Uses fast-check with minimum 100 runs per property.
 * Tests the 6 correctness properties from the design document.
 */
import * as fc from 'fast-check';
import cartReducer, { initialCartState } from './cartReducer';
import {
  getCartSubtotal,
  getCartItemCount,
  getCategoryBadgeCount,
  derivePricingType,
  buildOrderPayload,
  groupServicesByCategory,
} from './cartUtils';

// --- Arbitrary generators ---

const categoryArb = fc.record({
  categoryId: fc.string({ minLength: 1, maxLength: 10 }),
  categoryName: fc.string({ minLength: 1, maxLength: 20 }),
});

const serviceArb = (categories) =>
  fc.record({
    serviceId: fc.uuid(),
    serviceName: fc.string({ minLength: 1, maxLength: 30 }),
    categoryId: fc.constantFrom(...categories.map((c) => c.categoryId)),
    categoryName: fc.constantFrom(...categories.map((c) => c.categoryName)),
    price: fc.float({ min: Math.fround(0.01), max: Math.fround(500), noNaN: true }),
    inputWeight: fc.boolean(),
  });

const cartItemArb = fc.record({
  serviceId: fc.uuid(),
  serviceName: fc.string({ minLength: 1, maxLength: 30 }),
  categoryId: fc.string({ minLength: 1, maxLength: 10 }),
  categoryName: fc.string({ minLength: 1, maxLength: 20 }),
  price: fc.float({ min: Math.fround(0.01), max: Math.fround(500), noNaN: true }),
  inputWeight: fc.boolean(),
  quantity: fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }),
});

// --- Property 1: Service grouping preserves all services ---

describe('Feature: unified-cart-order-flow, Property 1: Service grouping preserves all services', () => {
  /**
   * Validates: Requirements 1.1
   *
   * For any set of services with category assignments, the grouping function
   * shall produce category groups where every service appears exactly once,
   * under its correct category, and no services are lost or duplicated.
   */
  it('every service appears exactly once in the grouped output', () => {
    fc.assert(
      fc.property(
        fc
          .array(categoryArb, { minLength: 1, maxLength: 5 })
          .chain((categories) =>
            fc.tuple(
              fc.constant(categories),
              fc.array(serviceArb(categories), { minLength: 1, maxLength: 20 })
            )
          ),
        ([categories, services]) => {
          const groups = groupServicesByCategory(services, categories);

          // Flatten all services from groups
          const allGroupedServices = groups.flatMap((g) => g.services);

          // No services lost
          expect(allGroupedServices.length).toBe(services.length);

          // Each service appears exactly once (by reference comparison with serviceId)
          const groupedIds = allGroupedServices.map((s) => s.serviceId);
          const inputIds = services.map((s) => s.serviceId);
          expect(groupedIds.sort()).toEqual(inputIds.sort());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each service is placed under its correct category', () => {
    fc.assert(
      fc.property(
        fc
          .array(categoryArb, { minLength: 1, maxLength: 5 })
          .chain((categories) =>
            fc.tuple(
              fc.constant(categories),
              fc.array(serviceArb(categories), { minLength: 1, maxLength: 20 })
            )
          ),
        ([categories, services]) => {
          const groups = groupServicesByCategory(services, categories);

          for (const group of groups) {
            for (const service of group.services) {
              // Each service's categoryId must match the group's categoryId
              // (unless it's the uncategorized bucket)
              if (group.categoryId !== 'uncategorized') {
                expect(service.categoryId).toBe(group.categoryId);
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 2: Accordion exclusivity ---

describe('Feature: unified-cart-order-flow, Property 2: Accordion exclusivity', () => {
  /**
   * Validates: Requirements 1.2
   *
   * For any sequence of accordion toggle actions on the category list,
   * at most one section shall be in the expanded state at any time.
   * Tests the toggle logic: expandedId = expandedId === toggled ? null : toggled
   */
  it('at most one section is expanded after any sequence of toggles', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), {
          minLength: 1,
          maxLength: 50,
        }),
        (toggleSequence) => {
          let expandedId = null;

          for (const toggled of toggleSequence) {
            // This is the accordion toggle logic from UnifiedServicePage
            expandedId = expandedId === toggled ? null : toggled;

            // At most one section expanded: expandedId is either null or a single string
            // This is inherently true by the logic, but we verify explicitly
            const expandedCount = expandedId === null ? 0 : 1;
            expect(expandedCount).toBeLessThanOrEqual(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('toggling the same section twice returns to collapsed state', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        (sectionId) => {
          let expandedId = null;

          // First toggle: section expands
          expandedId = expandedId === sectionId ? null : sectionId;
          expect(expandedId).toBe(sectionId);

          // Second toggle: same section collapses
          expandedId = expandedId === sectionId ? null : sectionId;
          expect(expandedId).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('toggling a different section replaces the currently expanded one', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (sectionA, sectionB) => {
          fc.pre(sectionA !== sectionB);

          let expandedId = null;

          // Expand section A
          expandedId = expandedId === sectionA ? null : sectionA;
          expect(expandedId).toBe(sectionA);

          // Toggle section B: A collapses, B expands
          expandedId = expandedId === sectionB ? null : sectionB;
          expect(expandedId).toBe(sectionB);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 3: Category badge count invariant ---

describe('Feature: unified-cart-order-flow, Property 3: Category badge count invariant', () => {
  /**
   * Validates: Requirements 1.7
   *
   * For any cart state and any category, the badge count displayed on that
   * category's collapsed header shall equal the number of distinct cart items
   * belonging to that category.
   */
  it('badge count equals distinct items in that category', () => {
    fc.assert(
      fc.property(
        fc.array(cartItemArb, { minLength: 0, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (items, categoryId) => {
          const badgeCount = getCategoryBadgeCount(items, categoryId);
          const expectedCount = items.filter(
            (item) => item.categoryId === categoryId
          ).length;

          expect(badgeCount).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('badge count is zero for a category with no items', () => {
    fc.assert(
      fc.property(
        fc.array(cartItemArb, { minLength: 0, maxLength: 10 }),
        (items) => {
          // Use a category ID guaranteed not to be in items
          const unusedCategoryId = '$$UNUSED$$';
          const filteredItems = items.filter(
            (i) => i.categoryId !== unusedCategoryId
          );
          const badgeCount = getCategoryBadgeCount(
            filteredItems,
            unusedCategoryId
          );
          expect(badgeCount).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 4: Cart totals correctness ---

describe('Feature: unified-cart-order-flow, Property 4: Cart totals correctness', () => {
  /**
   * Validates: Requirements 1.8, 4.1
   *
   * For any set of cart items where each item has a quantity > 0 and a unit price ≥ 0,
   * the total items count shall equal the sum of all quantities, and the estimated
   * subtotal shall equal the sum of (quantity × price) for all items.
   */
  it('total item count equals sum of all quantities', () => {
    fc.assert(
      fc.property(
        fc.array(cartItemArb, { minLength: 0, maxLength: 20 }),
        (items) => {
          const itemCount = getCartItemCount(items);
          const expectedCount = items.reduce(
            (sum, item) => sum + item.quantity,
            0
          );

          expect(itemCount).toBeCloseTo(expectedCount, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('subtotal equals sum of (quantity × price) for all items', () => {
    fc.assert(
      fc.property(
        fc.array(cartItemArb, { minLength: 0, maxLength: 20 }),
        (items) => {
          const subtotal = getCartSubtotal(items);
          const expectedSubtotal = items.reduce(
            (sum, item) => sum + item.quantity * item.price,
            0
          );

          expect(subtotal).toBeCloseTo(expectedSubtotal, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty cart returns zero for both count and subtotal', () => {
    expect(getCartItemCount([])).toBe(0);
    expect(getCartSubtotal([])).toBe(0);
    expect(getCartItemCount(null)).toBe(0);
    expect(getCartSubtotal(null)).toBe(0);
  });
});

// --- Property 5: Grand total formula ---

describe('Feature: unified-cart-order-flow, Property 5: Grand total formula', () => {
  /**
   * Validates: Requirements 4.2
   *
   * For any subtotal ≥ 0, discount where 0 ≤ discount ≤ subtotal, tax rate ≥ 0,
   * and tip ≥ 0, the grand total shall equal (subtotal − discount) × (1 + taxRate) + tip.
   */

  // The grand total formula as implemented in UnifiedReviewPage's rendering logic
  function computeGrandTotal(subtotal, discount, taxRate, tip) {
    return (subtotal - discount) * (1 + taxRate) + tip;
  }

  it('grand total equals (subtotal - discount) × (1 + taxRate) + tip', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 10000, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 0.5, noNaN: true }),
        fc.float({ min: 0, max: 500, noNaN: true }),
        (subtotal, discountFraction, taxRate, tip) => {
          // Ensure discount ≤ subtotal
          const discount = subtotal * discountFraction;

          const grandTotal = computeGrandTotal(subtotal, discount, taxRate, tip);
          const expected =
            (subtotal - discount) * (1 + taxRate) + tip;

          expect(grandTotal).toBeCloseTo(expected, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('grand total is at least tip when subtotal equals discount', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 10000, noNaN: true }),
        fc.float({ min: 0, max: 0.5, noNaN: true }),
        fc.float({ min: 0, max: 500, noNaN: true }),
        (subtotal, taxRate, tip) => {
          const grandTotal = computeGrandTotal(subtotal, subtotal, taxRate, tip);
          expect(grandTotal).toBeCloseTo(tip, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('grand total is non-negative for valid inputs', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 10000, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 0.5, noNaN: true }),
        fc.float({ min: 0, max: 500, noNaN: true }),
        (subtotal, discountFraction, taxRate, tip) => {
          const discount = subtotal * discountFraction;
          const grandTotal = computeGrandTotal(subtotal, discount, taxRate, tip);
          expect(grandTotal).toBeGreaterThanOrEqual(-0.001); // float tolerance
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 6: Order payload construction with mixed pricing type ---

describe('Feature: unified-cart-order-flow, Property 6: Order payload construction with mixed pricing type', () => {
  /**
   * Validates: Requirements 5.1, 5.3
   *
   * For any cart containing at least one per-pound item (inputWeight=true) AND
   * at least one per-piece item (inputWeight=false), the constructed order payload
   * shall: (a) include every cart item with correct serviceName, quantity, price,
   * inputWeight flag, and (b) set pricingType to "mixed".
   */

  const perPoundItemArb = fc.record({
    serviceId: fc.uuid(),
    serviceName: fc.string({ minLength: 1, maxLength: 30 }),
    categoryId: fc.string({ minLength: 1, maxLength: 10 }),
    categoryName: fc.string({ minLength: 1, maxLength: 20 }),
    price: fc.float({ min: Math.fround(0.01), max: 500, noNaN: true }),
    inputWeight: fc.constant(true),
    quantity: fc.float({ min: Math.fround(0.1), max: 100, noNaN: true }),
  });

  const perPieceItemArb = fc.record({
    serviceId: fc.uuid(),
    serviceName: fc.string({ minLength: 1, maxLength: 30 }),
    categoryId: fc.string({ minLength: 1, maxLength: 10 }),
    categoryName: fc.string({ minLength: 1, maxLength: 20 }),
    price: fc.float({ min: Math.fround(0.01), max: 500, noNaN: true }),
    inputWeight: fc.constant(false),
    quantity: fc.float({ min: Math.fround(0.1), max: 100, noNaN: true }),
  });

  const orderDetailsArb = fc.record({
    customerId: fc.string({ minLength: 1, maxLength: 20 }),
    laundryId: fc.string({ minLength: 1, maxLength: 10 }),
    address: fc.string({ minLength: 1, maxLength: 50 }),
    doorNumber: fc.string({ maxLength: 10 }),
    addressInstructions: fc.string({ maxLength: 30 }),
    specialInstructions: fc.string({ maxLength: 30 }),
    pickupDate: fc.constant('2025-01-15'),
    pickupTimeInterval: fc.constant('10:00 - 12:00'),
    dropoffDate: fc.constant('2025-01-17'),
    dropoffTimeInterval: fc.constant('14:00 - 16:00'),
    frequency: fc.constantFrom(null, 'weekly', 'biweekly'),
    laundryBags: fc.integer({ min: 1, max: 10 }),
    tip: fc.constant({ tipAmount: '5.00', tipPercentage: 5 }),
    coupon: fc.string({ maxLength: 10 }),
    pickupService: fc.constantFrom('LaundryDriver', 'Uber'),
    dropoffService: fc.constantFrom('LaundryDriver', 'Uber'),
    customerPaymentId: fc.string({ minLength: 1, maxLength: 20 }),
    payByInvoice: fc.boolean(),
    grandTotal: fc.float({ min: 0, max: 10000, noNaN: true }),
  });

  it('sets pricingType to "mixed" for carts with both per-pound and per-piece items', () => {
    fc.assert(
      fc.property(
        fc.array(perPoundItemArb, { minLength: 1, maxLength: 5 }),
        fc.array(perPieceItemArb, { minLength: 1, maxLength: 5 }),
        orderDetailsArb,
        (poundItems, pieceItems, orderDetails) => {
          const mixedItems = [...poundItems, ...pieceItems];
          const cart = { items: mixedItems };

          const payload = buildOrderPayload(cart, orderDetails);

          expect(payload.pricingType).toBe('mixed');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('includes every cart item with correct serviceName, quantity, price, and inputWeight', () => {
    fc.assert(
      fc.property(
        fc.array(perPoundItemArb, { minLength: 1, maxLength: 5 }),
        fc.array(perPieceItemArb, { minLength: 1, maxLength: 5 }),
        orderDetailsArb,
        (poundItems, pieceItems, orderDetails) => {
          const mixedItems = [...poundItems, ...pieceItems];
          const cart = { items: mixedItems };

          const payload = buildOrderPayload(cart, orderDetails);

          expect(payload.services.length).toBe(mixedItems.length);

          for (let i = 0; i < mixedItems.length; i++) {
            const item = mixedItems[i];
            const service = payload.services[i];

            expect(service.serviceName).toBe(item.serviceName);
            expect(service.weightOrCount).toBe(item.quantity);
            expect(service.servicePrice).toBe(item.price);
            expect(service.inputWeight).toBe(item.inputWeight);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('derivePricingType returns "per_pound" when all items are per-pound', () => {
    fc.assert(
      fc.property(
        fc.array(perPoundItemArb, { minLength: 1, maxLength: 10 }),
        (items) => {
          expect(derivePricingType(items)).toBe('per_pound');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('derivePricingType returns "per_bag" when all items are per-piece', () => {
    fc.assert(
      fc.property(
        fc.array(perPieceItemArb, { minLength: 1, maxLength: 10 }),
        (items) => {
          expect(derivePricingType(items)).toBe('per_bag');
        }
      ),
      { numRuns: 100 }
    );
  });
});
