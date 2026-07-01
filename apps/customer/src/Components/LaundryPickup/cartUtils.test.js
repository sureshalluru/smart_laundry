import {
  getCartSubtotal,
  getCartItemCount,
  getCategoryBadgeCount,
  derivePricingType,
  buildOrderPayload,
  groupServicesByCategory,
} from './cartUtils';

describe('getCartSubtotal', () => {
  it('returns 0 for empty array', () => {
    expect(getCartSubtotal([])).toBe(0);
  });

  it('returns 0 for null/undefined', () => {
    expect(getCartSubtotal(null)).toBe(0);
    expect(getCartSubtotal(undefined)).toBe(0);
  });

  it('computes sum of quantity * price for single item', () => {
    const items = [{ quantity: 3, price: 10 }];
    expect(getCartSubtotal(items)).toBe(30);
  });

  it('computes sum of quantity * price for multiple items', () => {
    const items = [
      { quantity: 2, price: 5 },
      { quantity: 1, price: 20 },
      { quantity: 4, price: 3.5 },
    ];
    expect(getCartSubtotal(items)).toBeCloseTo(44);
  });
});

describe('getCartItemCount', () => {
  it('returns 0 for empty array', () => {
    expect(getCartItemCount([])).toBe(0);
  });

  it('returns 0 for null/undefined', () => {
    expect(getCartItemCount(null)).toBe(0);
    expect(getCartItemCount(undefined)).toBe(0);
  });

  it('sums all quantities', () => {
    const items = [
      { quantity: 2 },
      { quantity: 5 },
      { quantity: 1 },
    ];
    expect(getCartItemCount(items)).toBe(8);
  });
});

describe('getCategoryBadgeCount', () => {
  it('returns 0 for empty array', () => {
    expect(getCategoryBadgeCount([], 'cat_1')).toBe(0);
  });

  it('returns 0 for null/undefined items', () => {
    expect(getCategoryBadgeCount(null, 'cat_1')).toBe(0);
  });

  it('counts distinct items in matching category', () => {
    const items = [
      { serviceId: 's1', categoryId: 'cat_1' },
      { serviceId: 's2', categoryId: 'cat_2' },
      { serviceId: 's3', categoryId: 'cat_1' },
    ];
    expect(getCategoryBadgeCount(items, 'cat_1')).toBe(2);
    expect(getCategoryBadgeCount(items, 'cat_2')).toBe(1);
    expect(getCategoryBadgeCount(items, 'cat_3')).toBe(0);
  });
});

describe('derivePricingType', () => {
  it('returns "per_bag" for empty/null items', () => {
    expect(derivePricingType([])).toBe('per_bag');
    expect(derivePricingType(null)).toBe('per_bag');
  });

  it('returns "per_pound" when all items have inputWeight=true', () => {
    const items = [
      { inputWeight: true },
      { inputWeight: true },
    ];
    expect(derivePricingType(items)).toBe('per_pound');
  });

  it('returns "per_item" when all items have inputWeight=false', () => {
    const items = [
      { inputWeight: false },
      { inputWeight: false },
    ];
    expect(derivePricingType(items)).toBe('per_item');
  });

  it('returns "mixed" when items have a mix of inputWeight values', () => {
    const items = [
      { inputWeight: true },
      { inputWeight: false },
    ];
    expect(derivePricingType(items)).toBe('mixed');
  });
});

describe('buildOrderPayload', () => {
  const sampleCart = {
    items: [
      { serviceId: 's1', serviceName: 'Wash & Fold', categoryId: 'cat_1', categoryName: 'Laundry', price: 1.89, inputWeight: true, quantity: 15 },
      { serviceId: 's2', serviceName: 'Comforter', categoryId: 'cat_2', categoryName: 'Bedding', price: 35, inputWeight: false, quantity: 2 },
    ],
  };

  const sampleOrderDetails = {
    customerId: 'cust_123',
    laundryId: '1',
    address: '123 Main St',
    doorNumber: 'Apt 4B',
    addressInstructions: 'Leave at door',
    specialInstructions: 'Extra starch',
    pickupDate: '2025-01-15',
    pickupTimeInterval: '10:00 - 12:00',
    dropoffDate: '2025-01-17',
    dropoffTimeInterval: '14:00 - 16:00',
    frequency: null,
    laundryBags: 2,
    grandTotal: '108.18',
    tip: { tipAmount: '5.00', tipPercentage: 5, tipType: 'percentage', tipMethod: 'Card' },
    coupon: '',
    pickupService: 'LaundryDriver',
    dropoffService: 'LaundryDriver',
    customerPaymentId: 'pm_xxx',
    payByInvoice: false,
  };

  it('sets operation to "placeOrder"', () => {
    const payload = buildOrderPayload(sampleCart, sampleOrderDetails);
    expect(payload.operation).toBe('placeOrder');
  });

  it('derives mixed pricingType for mixed cart', () => {
    const payload = buildOrderPayload(sampleCart, sampleOrderDetails);
    expect(payload.pricingType).toBe('mixed');
  });

  it('maps services correctly', () => {
    const payload = buildOrderPayload(sampleCart, sampleOrderDetails);
    expect(payload.services).toHaveLength(2);
    expect(payload.services[0]).toEqual({
      serviceName: 'Wash & Fold',
      weightOrCount: 15,
      servicePrice: 1.89,
      inputWeight: true,
      categoryId: 'cat_1',
    });
    expect(payload.services[1]).toEqual({
      serviceName: 'Comforter',
      weightOrCount: 2,
      servicePrice: 35,
      inputWeight: false,
      categoryId: 'cat_2',
    });
  });

  it('computes subtotal and totalCost as string with 2 decimals', () => {
    const payload = buildOrderPayload(sampleCart, sampleOrderDetails);
    // 15 * 1.89 + 2 * 35 = 28.35 + 70 = 98.35
    expect(payload.subTotal).toBe('98.35');
    expect(payload.totalCost).toBe('98.35');
  });

  it('uses orderDetails.grandTotal formatted as string', () => {
    const payload = buildOrderPayload(sampleCart, sampleOrderDetails);
    expect(payload.grandTotal).toBe('108.18');
  });

  it('defaults coupon to empty string if not provided', () => {
    const details = { ...sampleOrderDetails, coupon: undefined };
    const payload = buildOrderPayload(sampleCart, details);
    expect(payload.coupon).toBe('');
  });

  it('defaults payByInvoice to false if not provided', () => {
    const details = { ...sampleOrderDetails, payByInvoice: undefined };
    const payload = buildOrderPayload(sampleCart, details);
    expect(payload.payByInvoice).toBe(false);
  });

  it('includes all order detail fields', () => {
    const payload = buildOrderPayload(sampleCart, sampleOrderDetails);
    expect(payload.customerId).toBe('cust_123');
    expect(payload.laundryId).toBe('1');
    expect(payload.address).toBe('123 Main St');
    expect(payload.doorNumber).toBe('Apt 4B');
    expect(payload.pickupDate).toBe('2025-01-15');
    expect(payload.frequency).toBeNull();
    expect(payload.laundryBags).toBe(2);
    expect(payload.pickupService).toBe('LaundryDriver');
    expect(payload.customerPaymentId).toBe('pm_xxx');
  });
});

describe('groupServicesByCategory', () => {
  const categories = [
    { categoryId: 'cat_1', categoryName: 'Laundry' },
    { categoryId: 'cat_2', categoryName: 'Dry Cleaning' },
  ];

  it('returns empty array for empty services', () => {
    expect(groupServicesByCategory([], categories)).toEqual([]);
    expect(groupServicesByCategory(null, categories)).toEqual([]);
  });

  it('puts all services in Uncategorized when no categories exist', () => {
    const services = [
      { serviceId: 's1', categoryId: 'cat_1' },
      { serviceId: 's2', categoryId: 'cat_2' },
    ];
    const result = groupServicesByCategory(services, []);
    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe('uncategorized');
    expect(result[0].categoryName).toBe('Uncategorized');
    expect(result[0].services).toHaveLength(2);
  });

  it('groups services under correct categories preserving order', () => {
    const services = [
      { serviceId: 's1', categoryId: 'cat_2', serviceName: 'Suit Press' },
      { serviceId: 's2', categoryId: 'cat_1', serviceName: 'Wash & Fold' },
      { serviceId: 's3', categoryId: 'cat_1', serviceName: 'Delicates' },
    ];
    const result = groupServicesByCategory(services, categories);
    // cat_1 should come first (category order), then cat_2
    expect(result[0].categoryId).toBe('cat_1');
    expect(result[0].services).toHaveLength(2);
    expect(result[1].categoryId).toBe('cat_2');
    expect(result[1].services).toHaveLength(1);
  });

  it('places services without a matching category in Uncategorized at end', () => {
    const services = [
      { serviceId: 's1', categoryId: 'cat_1', serviceName: 'Wash' },
      { serviceId: 's2', categoryId: 'unknown_cat', serviceName: 'Mystery' },
    ];
    const result = groupServicesByCategory(services, categories);
    expect(result[result.length - 1].categoryId).toBe('uncategorized');
    expect(result[result.length - 1].services[0].serviceId).toBe('s2');
  });

  it('preserves all services (no loss or duplication)', () => {
    const services = [
      { serviceId: 's1', categoryId: 'cat_1' },
      { serviceId: 's2', categoryId: 'cat_2' },
      { serviceId: 's3', categoryId: 'cat_1' },
      { serviceId: 's4', categoryId: 'unknown' },
    ];
    const result = groupServicesByCategory(services, categories);
    const allGroupedServices = result.flatMap(g => g.services);
    expect(allGroupedServices).toHaveLength(4);
    const ids = allGroupedServices.map(s => s.serviceId).sort();
    expect(ids).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('omits categories with no matching services', () => {
    const services = [{ serviceId: 's1', categoryId: 'cat_1' }];
    const result = groupServicesByCategory(services, categories);
    // Only cat_1 should appear, cat_2 should be filtered out
    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe('cat_1');
  });
});
