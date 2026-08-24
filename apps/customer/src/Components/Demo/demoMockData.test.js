import { getDemoData, getRelativeDate, getCustomerById } from './demoMockData';

describe('demoMockData', () => {
  describe('getDemoData', () => {
    const validKeys = [
      'adminDashboard',
      'driverDispatch',
      'customerTracking',
      'subscriptions',
      'aiTracking',
      'engagement',
      'customerOrdering',
      'referralReview',
      'quickPOS',
      'routeOptimization',
    ];

    test.each(validKeys)('returns non-empty data for key "%s"', (key) => {
      const data = getDemoData(key);
      expect(data).toBeDefined();
      expect(data).not.toEqual([]);
      expect(typeof data).toBe('object');
    });

    test('returns empty array for unknown key', () => {
      expect(getDemoData('nonexistent')).toEqual([]);
      expect(getDemoData('')).toEqual([]);
      expect(getDemoData('unknown_view')).toEqual([]);
    });

    test('never throws for any key', () => {
      expect(() => getDemoData(null)).not.toThrow();
      expect(() => getDemoData(undefined)).not.toThrow();
      expect(() => getDemoData(123)).not.toThrow();
      expect(() => getDemoData('random')).not.toThrow();
    });

    test('adminDashboard has orders and summary', () => {
      const data = getDemoData('adminDashboard');
      expect(data.orders).toBeInstanceOf(Array);
      expect(data.orders.length).toBeGreaterThanOrEqual(5);
      expect(data.summary).toHaveProperty('totalOrders');
      expect(data.summary).toHaveProperty('monthlyRevenue');
      expect(data.summary).toHaveProperty('averageOrderValue');
    });

    test('driverDispatch has drivers and assignments', () => {
      const data = getDemoData('driverDispatch');
      expect(data.drivers).toBeInstanceOf(Array);
      expect(data.drivers.length).toBeGreaterThanOrEqual(3);
      expect(data.assignments).toBeInstanceOf(Array);
    });

    test('customerTracking has order, timeline, stages', () => {
      const data = getDemoData('customerTracking');
      expect(data.order).toBeDefined();
      expect(data.timeline).toBeInstanceOf(Array);
      expect(data.stages).toBeInstanceOf(Array);
      expect(data.stages.length).toBe(6);
    });

    test('routeOptimization has drivers with stops', () => {
      const data = getDemoData('routeOptimization');
      expect(data.drivers).toBeInstanceOf(Array);
      expect(data.drivers.length).toBeGreaterThanOrEqual(3);
      expect(data.stops).toBeInstanceOf(Array);
      data.drivers.forEach((driver) => {
        expect(driver.stops).toBeInstanceOf(Array);
        expect(driver.stops.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getRelativeDate', () => {
    test('returns a Date object', () => {
      expect(getRelativeDate(0)).toBeInstanceOf(Date);
      expect(getRelativeDate(5)).toBeInstanceOf(Date);
      expect(getRelativeDate(-5)).toBeInstanceOf(Date);
    });

    test('dates are within ±30 days of today', () => {
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      [0, 5, -5, 15, -15, 30, -30, 50, -50].forEach((offset) => {
        const date = getRelativeDate(offset);
        const diff = Math.abs(date.getTime() - now);
        expect(diff).toBeLessThanOrEqual(thirtyDaysMs + 86400000); // +1 day tolerance
      });
    });

    test('clamps values beyond ±30', () => {
      const future30 = getRelativeDate(30);
      const future100 = getRelativeDate(100);
      // Both should give roughly the same date (clamped to +30)
      expect(Math.abs(future30.getTime() - future100.getTime())).toBeLessThan(86400000);
    });
  });

  describe('getCustomerById', () => {
    test('returns known customers', () => {
      const c1 = getCustomerById('C001');
      expect(c1).toBeDefined();
      expect(c1.name).toBe('Sarah Johnson');
      expect(c1.phone).toBeDefined();
      expect(c1.address).toBeDefined();
      expect(c1.email).toBeDefined();
    });

    test('returns undefined for unknown ID', () => {
      expect(getCustomerById('C999')).toBeUndefined();
      expect(getCustomerById('')).toBeUndefined();
    });

    test('customers C001-C006 all exist', () => {
      ['C001', 'C002', 'C003', 'C004', 'C005', 'C006'].forEach((id) => {
        const c = getCustomerById(id);
        expect(c).toBeDefined();
        expect(c.name).toBeTruthy();
        expect(c.phone).toBeTruthy();
        expect(c.address).toBeTruthy();
        expect(c.email).toBeTruthy();
      });
    });
  });

  describe('cross-view consistency', () => {
    test('customer IDs in orders resolve to shared customers', () => {
      const { orders } = getDemoData('adminDashboard');
      orders.forEach((order) => {
        const customer = getCustomerById(order.customerId);
        expect(customer).toBeDefined();
        expect(customer.name).toBeTruthy();
      });
    });

    test('customer IDs in route stops resolve to shared customers', () => {
      const { stops } = getDemoData('routeOptimization');
      stops.forEach((stop) => {
        const customer = getCustomerById(stop.customerId);
        expect(customer).toBeDefined();
        expect(customer.name).toBeTruthy();
      });
    });
  });
});
