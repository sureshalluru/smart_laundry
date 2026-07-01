/**
 * Cart utility functions for the unified cart order flow.
 *
 * All functions are pure — no side effects.
 */

/**
 * Returns the subtotal: sum of (quantity × price) for all cart items.
 * @param {Array} items - Array of CartItem objects
 * @returns {number} subtotal
 */
export function getCartSubtotal(items) {
  if (!items || items.length === 0) return 0;
  return items.reduce((sum, item) => sum + item.quantity * item.price, 0);
}

/**
 * Returns the total count of items (sum of all quantities).
 * @param {Array} items - Array of CartItem objects
 * @returns {number} total item count
 */
export function getCartItemCount(items) {
  if (!items || items.length === 0) return 0;
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Returns the number of distinct cart items belonging to a given categoryId.
 * @param {Array} items - Array of CartItem objects
 * @param {string} categoryId - The category ID to filter by
 * @returns {number} count of distinct items in that category
 */
export function getCategoryBadgeCount(items, categoryId) {
  if (!items || items.length === 0) return 0;
  return items.filter(item => item.categoryId === categoryId).length;
}

/**
 * Derives the pricing type from cart items.
 * @param {Array} items - Array of CartItem objects
 * @returns {"per_pound"|"per_item"|"per_bag"|"mixed"} pricing type
 */
export function derivePricingType(items) {
  if (!items || items.length === 0) return "per_bag";
  const allWeight = items.every(item => item.inputWeight === true);
  const allPiece = items.every(item => item.inputWeight === false);
  if (allWeight) return "per_pound";
  if (allPiece) return "per_item";
  return "mixed";
}

/**
 * Constructs the order payload for the API.
 * @param {{ items: Array }} cart - Cart state object with items array
 * @param {object} orderDetails - Object with all other order fields
 * @returns {object} Order payload matching API contract
 */
export function buildOrderPayload(cart, orderDetails) {
  const items = cart.items || [];
  const subtotal = getCartSubtotal(items);
  const subtotalStr = subtotal.toFixed(2);
  const grandTotalStr = orderDetails.grandTotal != null
    ? parseFloat(orderDetails.grandTotal).toFixed(2)
    : subtotalStr;

  return {
    operation: "placeOrder",
    pricingType: derivePricingType(items),
    customerId: orderDetails.customerId,
    laundryId: orderDetails.laundryId,
    address: orderDetails.address,
    doorNumber: orderDetails.doorNumber,
    addressInstructions: orderDetails.addressInstructions,
    specialInstructions: orderDetails.specialInstructions,
    services: items.map(item => ({
      serviceName: item.serviceName,
      weightOrCount: item.quantity,
      servicePrice: item.price,
      inputWeight: item.inputWeight,
      categoryId: item.categoryId,
    })),
    pickupDate: orderDetails.pickupDate,
    pickupTimeInterval: orderDetails.pickupTimeInterval,
    dropoffDate: orderDetails.dropoffDate,
    dropoffTimeInterval: orderDetails.dropoffTimeInterval,
    frequency: orderDetails.frequency,
    laundryBags: orderDetails.laundryBags,
    totalCost: subtotalStr,
    subTotal: subtotalStr,
    grandTotal: grandTotalStr,
    tip: orderDetails.tip,
    coupon: orderDetails.coupon || "",
    pickupService: orderDetails.pickupService,
    dropoffService: orderDetails.dropoffService,
    customerPaymentId: orderDetails.customerPaymentId,
    payByInvoice: orderDetails.payByInvoice || false,
  };
}

/**
 * Groups an array of services by their category, preserving category order.
 * Returns an array of { categoryId, categoryName, services: [...] }.
 * Services without a matching category go into an "Uncategorized" group at the end.
 *
 * Supports Property 1: Service grouping preserves all services.
 *
 * @param {Array} services - Array of service objects with categoryId
 * @param {Array} categories - Array of category objects with categoryId, categoryName (defines order)
 * @returns {Array} Array of { categoryId, categoryName, services }
 */
export function groupServicesByCategory(services, categories) {
  if (!services || services.length === 0) return [];
  if (!categories || categories.length === 0) {
    // No categories — put everything in "Uncategorized"
    return [
      {
        categoryId: "uncategorized",
        categoryName: "Uncategorized",
        services: [...services],
      },
    ];
  }

  // Build groups in category order
  const groups = categories.map(cat => ({
    categoryId: cat.categoryId,
    categoryName: cat.categoryName,
    services: [],
  }));

  // Index for fast lookup using Map to avoid prototype key conflicts
  const groupIndex = new Map();
  groups.forEach((group, idx) => {
    groupIndex.set(group.categoryId, idx);
  });

  const uncategorized = [];

  for (const service of services) {
    const idx = groupIndex.get(service.categoryId);
    if (idx !== undefined) {
      groups[idx].services.push(service);
    } else {
      uncategorized.push(service);
    }
  }

  // Filter out empty groups
  const result = groups.filter(g => g.services.length > 0);

  // Append uncategorized at the end if any
  if (uncategorized.length > 0) {
    result.push({
      categoryId: "uncategorized",
      categoryName: "Uncategorized",
      services: uncategorized,
    });
  }

  return result;
}
