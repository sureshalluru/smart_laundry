import { addDays, subDays, format } from 'date-fns';

// ─── Shared Customers ────────────────────────────────────────────────────────
const customers = {
  C001: {
    id: 'C001',
    name: 'Sarah Johnson',
    phone: '(512) 555-0142',
    address: '1234 Oak Lane, Austin, TX',
    email: 'sarah.j@example.com',
  },
  C002: {
    id: 'C002',
    name: 'Michael Chen',
    phone: '(512) 555-0287',
    address: '567 Maple Ave, Austin, TX',
    email: 'mchen@example.com',
  },
  C003: {
    id: 'C003',
    name: 'Jessica Williams',
    phone: '(512) 555-0319',
    address: '890 Pine St, Austin, TX',
    email: 'jwilliams@example.com',
  },
  C004: {
    id: 'C004',
    name: 'David Rodriguez',
    phone: '(512) 555-0453',
    address: '2301 Elm Blvd, Austin, TX',
    email: 'drodriguez@example.com',
  },
  C005: {
    id: 'C005',
    name: 'Emily Thompson',
    phone: '(512) 555-0578',
    address: '445 Cedar Dr, Austin, TX',
    email: 'ethompson@example.com',
  },
  C006: {
    id: 'C006',
    name: 'James Park',
    phone: '(512) 555-0621',
    address: '1122 Birch Way, Austin, TX',
    email: 'jpark@example.com',
  },
};

// ─── Helper: Relative Date ───────────────────────────────────────────────────
/**
 * Returns a Date relative to today by the given offset in days.
 * Positive = future, negative = past. Clamped to ±30 days.
 * @param {number} daysOffset
 * @returns {Date}
 */
export function getRelativeDate(daysOffset) {
  try {
    const clamped = Math.max(-30, Math.min(30, daysOffset));
    const today = new Date();
    return clamped >= 0 ? addDays(today, clamped) : subDays(today, Math.abs(clamped));
  } catch {
    return new Date();
  }
}

// ─── Helper: Customer Lookup ─────────────────────────────────────────────────
/**
 * Returns the shared customer object for the given ID, or undefined if not found.
 * @param {string} id
 * @returns {object|undefined}
 */
export function getCustomerById(id) {
  return customers[id];
}

// ─── Mock Data Builders ──────────────────────────────────────────────────────

function buildAdminDashboard() {
  const orders = [
    {
      id: 'ORD-2847',
      customerId: 'C001',
      status: 'pending_pickup',
      serviceType: 'Wash & Fold',
      amount: 42.5,
      items: [
        { name: 'Shirts', quantity: 5, price: 15.0 },
        { name: 'Pants', quantity: 3, price: 12.0 },
        { name: 'Bedding', quantity: 1, price: 15.5 },
      ],
      createdAt: getRelativeDate(-1),
      timeline: [
        { stage: 'Order Placed', timestamp: getRelativeDate(-1), description: 'Customer placed order via app' },
      ],
    },
    {
      id: 'ORD-2848',
      customerId: 'C002',
      status: 'in_progress',
      serviceType: 'Dry Cleaning',
      amount: 67.0,
      items: [
        { name: 'Suits', quantity: 2, price: 45.0 },
        { name: 'Dress Shirts', quantity: 4, price: 22.0 },
      ],
      createdAt: getRelativeDate(-3),
      timeline: [
        { stage: 'Order Placed', timestamp: getRelativeDate(-3), description: 'Customer placed order online' },
        { stage: 'Picked Up', timestamp: getRelativeDate(-2), description: 'Driver collected garments' },
        { stage: 'Processing', timestamp: getRelativeDate(-1), description: 'Items being cleaned' },
      ],
    },
    {
      id: 'ORD-2849',
      customerId: 'C003',
      status: 'ready_delivery',
      serviceType: 'Wash & Fold',
      amount: 35.75,
      items: [
        { name: 'Mixed Load', quantity: 1, price: 25.75 },
        { name: 'Towels', quantity: 4, price: 10.0 },
      ],
      createdAt: getRelativeDate(-5),
      timeline: [
        { stage: 'Order Placed', timestamp: getRelativeDate(-5), description: 'Order submitted' },
        { stage: 'Picked Up', timestamp: getRelativeDate(-4), description: 'Garments picked up' },
        { stage: 'Processing', timestamp: getRelativeDate(-3), description: 'Washing complete' },
        { stage: 'Ready', timestamp: getRelativeDate(-1), description: 'Ready for delivery' },
      ],
    },
    {
      id: 'ORD-2850',
      customerId: 'C004',
      status: 'completed',
      serviceType: 'Press Only',
      amount: 28.0,
      items: [
        { name: 'Dress Shirts', quantity: 7, price: 28.0 },
      ],
      createdAt: getRelativeDate(-7),
      timeline: [
        { stage: 'Order Placed', timestamp: getRelativeDate(-7), description: 'Order created' },
        { stage: 'Picked Up', timestamp: getRelativeDate(-6), description: 'Picked up by driver' },
        { stage: 'Processing', timestamp: getRelativeDate(-5), description: 'Pressing in progress' },
        { stage: 'Ready', timestamp: getRelativeDate(-3), description: 'Items pressed and ready' },
        { stage: 'Out for Delivery', timestamp: getRelativeDate(-2), description: 'Out for delivery' },
        { stage: 'Delivered', timestamp: getRelativeDate(-2), description: 'Delivered to customer' },
      ],
    },
    {
      id: 'ORD-2851',
      customerId: 'C005',
      status: 'pending_pickup',
      serviceType: 'Comforter Cleaning',
      amount: 55.0,
      items: [
        { name: 'King Comforter', quantity: 1, price: 35.0 },
        { name: 'Pillow Cases', quantity: 4, price: 20.0 },
      ],
      createdAt: getRelativeDate(0),
      timeline: [
        { stage: 'Order Placed', timestamp: getRelativeDate(0), description: 'Order just placed' },
      ],
    },
    {
      id: 'ORD-2852',
      customerId: 'C006',
      status: 'in_progress',
      serviceType: 'Wash & Fold',
      amount: 39.25,
      items: [
        { name: 'Casual Wear', quantity: 8, price: 24.25 },
        { name: 'Gym Clothes', quantity: 5, price: 15.0 },
      ],
      createdAt: getRelativeDate(-2),
      timeline: [
        { stage: 'Order Placed', timestamp: getRelativeDate(-2), description: 'Customer ordered via app' },
        { stage: 'Picked Up', timestamp: getRelativeDate(-1), description: 'Picked up this morning' },
      ],
    },
  ];

  const summary = {
    totalOrders: 147,
    monthlyRevenue: 12450.75,
    averageOrderValue: 42.35,
  };

  return { orders, summary };
}

function buildDriverDispatch() {
  const drivers = [
    { id: 'DRV-01', name: 'Marcus Rivera', status: 'active', assignmentCount: 4, color: '#3182CE' },
    { id: 'DRV-02', name: 'Aisha Patel', status: 'en_route', assignmentCount: 3, color: '#38A169' },
    { id: 'DRV-03', name: 'Tom Nguyen', status: 'available', assignmentCount: 0, color: '#D69E2E' },
    { id: 'DRV-04', name: 'Rachel Kim', status: 'active', assignmentCount: 2, color: '#E53E3E' },
  ];

  const assignments = [
    {
      id: 'ASN-101',
      driverId: 'DRV-01',
      customerId: 'C001',
      pickupAddress: '1234 Oak Lane, Austin, TX',
      deliveryAddress: '500 Laundry Hub Dr, Austin, TX',
      timeWindow: '9:00 AM - 11:00 AM',
      orderContents: 'Wash & Fold — 3 bags',
    },
    {
      id: 'ASN-102',
      driverId: 'DRV-01',
      customerId: 'C002',
      pickupAddress: '567 Maple Ave, Austin, TX',
      deliveryAddress: '500 Laundry Hub Dr, Austin, TX',
      timeWindow: '9:00 AM - 11:00 AM',
      orderContents: 'Dry Cleaning — 2 suits, 4 shirts',
    },
    {
      id: 'ASN-103',
      driverId: 'DRV-02',
      customerId: 'C003',
      pickupAddress: '500 Laundry Hub Dr, Austin, TX',
      deliveryAddress: '890 Pine St, Austin, TX',
      timeWindow: '1:00 PM - 3:00 PM',
      orderContents: 'Wash & Fold — ready for delivery',
    },
    {
      id: 'ASN-104',
      driverId: 'DRV-02',
      customerId: 'C004',
      pickupAddress: '500 Laundry Hub Dr, Austin, TX',
      deliveryAddress: '2301 Elm Blvd, Austin, TX',
      timeWindow: '1:00 PM - 3:00 PM',
      orderContents: 'Press Only — 7 dress shirts',
    },
    {
      id: 'ASN-105',
      driverId: 'DRV-04',
      customerId: 'C005',
      pickupAddress: '445 Cedar Dr, Austin, TX',
      deliveryAddress: '500 Laundry Hub Dr, Austin, TX',
      timeWindow: '3:00 PM - 5:00 PM',
      orderContents: 'Comforter Cleaning — 1 king comforter',
    },
  ];

  return { drivers, assignments };
}

function buildCustomerTracking() {
  const stages = ['Order Placed', 'Picked Up', 'Processing', 'Ready', 'Out for Delivery', 'Delivered'];

  const order = {
    id: 'ORD-2849',
    customerId: 'C003',
    currentStage: 3,
    stages,
    estimatedDelivery: format(getRelativeDate(1), 'EEEE, MMM d — h:mm a'),
  };

  const timeline = [
    { stage: 'Order Placed', timestamp: getRelativeDate(-5), description: 'Order submitted via mobile app' },
    { stage: 'Picked Up', timestamp: getRelativeDate(-4), description: 'Driver picked up from 890 Pine St' },
    { stage: 'Processing', timestamp: getRelativeDate(-3), description: 'Items sorted and wash cycle started' },
    { stage: 'Ready', timestamp: getRelativeDate(-1), description: 'All items cleaned, folded, and packaged' },
  ];

  return { order, timeline, stages };
}

function buildSubscriptions() {
  const schedules = [
    {
      id: 'SUB-001',
      customerId: 'C001',
      frequency: 'weekly',
      serviceType: 'Wash & Fold',
      nextPickupDate: getRelativeDate(2),
      history: [getRelativeDate(-7), getRelativeDate(-14), getRelativeDate(-21)],
      upcomingDates: [getRelativeDate(2), getRelativeDate(9), getRelativeDate(16)],
    },
    {
      id: 'SUB-002',
      customerId: 'C002',
      frequency: 'bi-weekly',
      serviceType: 'Dry Cleaning',
      nextPickupDate: getRelativeDate(5),
      history: [getRelativeDate(-14), getRelativeDate(-28)],
      upcomingDates: [getRelativeDate(5), getRelativeDate(19)],
    },
    {
      id: 'SUB-003',
      customerId: 'C004',
      frequency: 'monthly',
      serviceType: 'Comforter Cleaning',
      nextPickupDate: getRelativeDate(12),
      history: [getRelativeDate(-30)],
      upcomingDates: [getRelativeDate(12)],
    },
    {
      id: 'SUB-004',
      customerId: 'C005',
      frequency: 'weekly',
      serviceType: 'Press Only',
      nextPickupDate: getRelativeDate(3),
      history: [getRelativeDate(-7), getRelativeDate(-14), getRelativeDate(-21), getRelativeDate(-28)],
      upcomingDates: [getRelativeDate(3), getRelativeDate(10), getRelativeDate(17), getRelativeDate(24)],
    },
    {
      id: 'SUB-005',
      customerId: 'C006',
      frequency: 'bi-weekly',
      serviceType: 'Wash & Fold',
      nextPickupDate: getRelativeDate(8),
      history: [getRelativeDate(-14), getRelativeDate(-28)],
      upcomingDates: [getRelativeDate(8), getRelativeDate(22)],
    },
  ];

  return { schedules };
}

function buildAITracking() {
  const intakePhotos = [
    { id: 'PHT-01', label: 'Bag 1 — Front', timestamp: getRelativeDate(-1), status: 'processed' },
    { id: 'PHT-02', label: 'Bag 1 — Contents', timestamp: getRelativeDate(-1), status: 'processed' },
    { id: 'PHT-03', label: 'Bag 2 — Front', timestamp: getRelativeDate(-1), status: 'processed' },
  ];

  const recognitionResults = [
    { category: 'shirts', count: 5, confidence: 0.96 },
    { category: 'pants', count: 3, confidence: 0.92 },
    { category: 'jacket', count: 1, confidence: 0.88 },
    { category: 'socks (pairs)', count: 4, confidence: 0.85 },
    { category: 'towels', count: 2, confidence: 0.94 },
  ];

  const reconciliation = {
    intakeCount: 15,
    foldCount: 14,
    hasDiscrepancy: true,
    discrepancyItems: ['1 sock missing — flagged for manual check'],
  };

  return { intakePhotos, recognitionResults, reconciliation };
}

function buildEngagement() {
  const stats = {
    activeCustomers: 312,
    abandonedCarts: 23,
    dormantCustomers: 47,
    winBackCandidates: 18,
  };

  const campaigns = [
    {
      type: 'abandoned_cart',
      label: 'Abandoned Cart Recovery',
      enabled: true,
      customerCount: 23,
      openRate: 0.68,
      conversionRate: 0.22,
      customers: [customers.C003, customers.C006],
    },
    {
      type: 'dormant_customer',
      label: 'Dormant Customer Outreach',
      enabled: true,
      customerCount: 47,
      openRate: 0.45,
      conversionRate: 0.12,
      customers: [customers.C004, customers.C005],
    },
    {
      type: 'win_back',
      label: 'Win-Back Campaign',
      enabled: false,
      customerCount: 18,
      openRate: 0.38,
      conversionRate: 0.08,
      customers: [customers.C002],
    },
  ];

  const templates = [
    {
      campaignType: 'abandoned_cart',
      body: 'Hi {{customer_name}}, you left items in your cart! Complete your order at {{business_name}} and use code {{promo_code}} for 10% off.',
      tokens: ['customer_name', 'promo_code', 'business_name'],
    },
    {
      campaignType: 'dormant_customer',
      body: "Hey {{customer_name}}, we miss you at {{business_name}}! It's been a while — here's {{promo_code}} for $5 off your next order.",
      tokens: ['customer_name', 'promo_code', 'business_name'],
    },
    {
      campaignType: 'win_back',
      body: '{{customer_name}}, we want you back! {{business_name}} has new services. Use {{promo_code}} for 20% off — expires this week!',
      tokens: ['customer_name', 'promo_code', 'business_name'],
    },
  ];

  return { stats, campaigns, templates };
}

function buildCustomerOrdering() {
  const services = [
    { id: 'SVC-01', name: 'Wash & Fold', price: 2.49, unit: 'per lb', pricingModel: 'per_pound' },
    { id: 'SVC-02', name: 'Dry Cleaning', price: 8.99, unit: 'per piece', pricingModel: 'per_bag' },
    { id: 'SVC-03', name: 'Press Only', price: 4.5, unit: 'per piece', pricingModel: 'per_bag' },
    { id: 'SVC-04', name: 'Comforter Cleaning', price: 35.0, unit: 'per bag', pricingModel: 'per_bag' },
    { id: 'SVC-05', name: 'Delicates', price: 6.99, unit: 'per piece', pricingModel: 'per_bag' },
  ];

  const timeSlots = [
    { date: getRelativeDate(1), slots: ['9am-11am', '1pm-3pm', '5pm-7pm'] },
    { date: getRelativeDate(2), slots: ['9am-11am', '1pm-3pm', '5pm-7pm'] },
    { date: getRelativeDate(3), slots: ['9am-11am', '1pm-3pm'] },
    { date: getRelativeDate(4), slots: ['9am-11am', '1pm-3pm', '5pm-7pm'] },
  ];

  return { services, timeSlots };
}

function buildReferralReview() {
  const referrals = {
    totalSent: 84,
    conversions: 31,
    totalRewards: 310,
    rewardPerReferrer: 5,
    rewardPerReferred: 5,
    maxMonthly: 10,
    creditExpiration: '90 days',
  };

  const reviews = [
    {
      id: 'REV-01',
      customerId: 'C001',
      rating: 5,
      text: 'Amazing service! My clothes have never been so fresh. Pickup was on time and delivery was perfect.',
      employeeName: 'Marcus Rivera',
      date: getRelativeDate(-3),
    },
    {
      id: 'REV-02',
      customerId: 'C002',
      rating: 4,
      text: 'Great dry cleaning quality. Would love weekend pickup options.',
      employeeName: 'Aisha Patel',
      date: getRelativeDate(-7),
    },
    {
      id: 'REV-03',
      customerId: 'C004',
      rating: 5,
      text: 'The subscription option saves me so much time every week. Highly recommend!',
      employeeName: 'Rachel Kim',
      date: getRelativeDate(-10),
    },
    {
      id: 'REV-04',
      customerId: 'C005',
      rating: 3,
      text: 'Good service overall, but one item was slightly wrinkled. They fixed it quickly though.',
      employeeName: 'Tom Nguyen',
      date: getRelativeDate(-14),
    },
  ];

  const config = {
    rewardAmount: 5,
    maxMonthlyReferrals: 10,
    creditExpirationDays: 90,
    reviewRequestDelay: '2 hours after delivery',
    minimumRatingForDisplay: 3,
  };

  return { referrals, reviews, config };
}

function buildQuickPOS() {
  const services = [
    { id: 'POS-01', name: 'Wash & Fold', price: 24.99, icon: '👕' },
    { id: 'POS-02', name: 'Dry Cleaning', price: 8.99, icon: '🧥' },
    { id: 'POS-03', name: 'Press Only', price: 4.5, icon: '👔' },
    { id: 'POS-04', name: 'Comforter', price: 35.0, icon: '🛏️' },
    { id: 'POS-05', name: 'Alterations', price: 15.0, icon: '✂️' },
    { id: 'POS-06', name: 'Stain Removal', price: 7.5, icon: '💧' },
  ];

  const paymentMethods = [
    { id: 'PAY-01', name: 'Card', icon: '💳' },
    { id: 'PAY-02', name: 'Cash', icon: '💵' },
    { id: 'PAY-03', name: 'Terminal', icon: '🖥️' },
  ];

  return { services, paymentMethods };
}

function buildRouteOptimization() {
  const drivers = [
    {
      id: 'DRV-01',
      name: 'Marcus Rivera',
      color: '#3182CE',
      totalDistance: '14.2 mi',
      estimatedTime: '1h 45m',
      stops: [
        { sequence: 1, address: '1234 Oak Lane, Austin, TX', timeWindow: '9:00 AM - 9:30 AM', type: 'pickup', customerId: 'C001', lat: 30.267, lng: -97.743 },
        { sequence: 2, address: '567 Maple Ave, Austin, TX', timeWindow: '9:35 AM - 10:00 AM', type: 'pickup', customerId: 'C002', lat: 30.272, lng: -97.751 },
        { sequence: 3, address: '890 Pine St, Austin, TX', timeWindow: '10:15 AM - 10:45 AM', type: 'delivery', customerId: 'C003', lat: 30.258, lng: -97.738 },
        { sequence: 4, address: '2301 Elm Blvd, Austin, TX', timeWindow: '11:00 AM - 11:30 AM', type: 'delivery', customerId: 'C004', lat: 30.281, lng: -97.729 },
      ],
    },
    {
      id: 'DRV-02',
      name: 'Aisha Patel',
      color: '#38A169',
      totalDistance: '11.8 mi',
      estimatedTime: '1h 20m',
      stops: [
        { sequence: 1, address: '445 Cedar Dr, Austin, TX', timeWindow: '1:00 PM - 1:30 PM', type: 'pickup', customerId: 'C005', lat: 30.245, lng: -97.762 },
        { sequence: 2, address: '1122 Birch Way, Austin, TX', timeWindow: '1:40 PM - 2:10 PM', type: 'pickup', customerId: 'C006', lat: 30.253, lng: -97.755 },
        { sequence: 3, address: '1234 Oak Lane, Austin, TX', timeWindow: '2:30 PM - 3:00 PM', type: 'delivery', customerId: 'C001', lat: 30.267, lng: -97.743 },
      ],
    },
    {
      id: 'DRV-03',
      name: 'Rachel Kim',
      color: '#E53E3E',
      totalDistance: '9.5 mi',
      estimatedTime: '1h 05m',
      stops: [
        { sequence: 1, address: '2301 Elm Blvd, Austin, TX', timeWindow: '3:00 PM - 3:30 PM', type: 'pickup', customerId: 'C004', lat: 30.281, lng: -97.729 },
        { sequence: 2, address: '567 Maple Ave, Austin, TX', timeWindow: '3:45 PM - 4:15 PM', type: 'delivery', customerId: 'C002', lat: 30.272, lng: -97.751 },
        { sequence: 3, address: '445 Cedar Dr, Austin, TX', timeWindow: '4:30 PM - 5:00 PM', type: 'delivery', customerId: 'C005', lat: 30.245, lng: -97.762 },
      ],
    },
  ];

  // Flatten stops for the top-level stops array
  const stops = drivers.flatMap((d) => d.stops);

  return { drivers, stops };
}

// ─── Data Registry ───────────────────────────────────────────────────────────
const DATA_BUILDERS = {
  adminDashboard: buildAdminDashboard,
  driverDispatch: buildDriverDispatch,
  customerTracking: buildCustomerTracking,
  subscriptions: buildSubscriptions,
  aiTracking: buildAITracking,
  engagement: buildEngagement,
  customerOrdering: buildCustomerOrdering,
  referralReview: buildReferralReview,
  quickPOS: buildQuickPOS,
  routeOptimization: buildRouteOptimization,
};

// ─── Main Export ─────────────────────────────────────────────────────────────
/**
 * Returns mock data for the given demo view key.
 * Unknown keys return an empty array — never throws.
 * @param {string} viewKey
 * @returns {object|Array}
 */
export function getDemoData(viewKey) {
  try {
    const builder = DATA_BUILDERS[viewKey];
    if (!builder) return [];
    return builder();
  } catch {
    return [];
  }
}
