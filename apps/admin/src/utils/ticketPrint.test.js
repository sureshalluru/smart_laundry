import { buildOrderUrl, generateTicketHtml } from './ticketPrint';

describe('buildOrderUrl', () => {
  const originalLocation = window.location;

  beforeAll(() => {
    delete window.location;
    window.location = { origin: 'https://app.smartlaundrybasket.ai' };
  });

  afterAll(() => {
    window.location = originalLocation;
  });

  it('uses custom domain without https prefix', () => {
    const url = buildOrderUrl('5', 'IS-1FCC7193', 'roundrocklaundry.com');
    expect(url).toBe('https://roundrocklaundry.com/5/admin/order/IS-1FCC7193');
  });

  it('uses custom domain with https:// prefix', () => {
    const url = buildOrderUrl('5', 'IS-1FCC7193', 'https://roundrocklaundry.com');
    expect(url).toBe('https://roundrocklaundry.com/5/admin/order/IS-1FCC7193');
  });

  it('uses custom domain with http:// prefix', () => {
    const url = buildOrderUrl('12', 'O-ABC123', 'http://dev.example.com');
    expect(url).toBe('http://dev.example.com/12/admin/order/O-ABC123');
  });

  it('falls back to window.location.origin when userDomain is null', () => {
    const url = buildOrderUrl('5', 'IS-1FCC7193', null);
    expect(url).toBe('https://app.smartlaundrybasket.ai/5/admin/order/IS-1FCC7193');
  });

  it('falls back to window.location.origin when userDomain is undefined', () => {
    const url = buildOrderUrl('5', 'IS-1FCC7193', undefined);
    expect(url).toBe('https://app.smartlaundrybasket.ai/5/admin/order/IS-1FCC7193');
  });

  it('falls back to window.location.origin when userDomain is empty string', () => {
    const url = buildOrderUrl('5', 'IS-1FCC7193', '');
    expect(url).toBe('https://app.smartlaundrybasket.ai/5/admin/order/IS-1FCC7193');
  });

  it('falls back to window.location.origin when userDomain is whitespace', () => {
    const url = buildOrderUrl('5', 'IS-1FCC7193', '   ');
    expect(url).toBe('https://app.smartlaundrybasket.ai/5/admin/order/IS-1FCC7193');
  });

  it('handles domain with trailing slash (no double slashes)', () => {
    const url = buildOrderUrl('5', 'IS-1FCC7193', 'https://roundrocklaundry.com/');
    expect(url).toBe('https://roundrocklaundry.com/5/admin/order/IS-1FCC7193');
  });

  it('handles domain with multiple trailing slashes', () => {
    const url = buildOrderUrl('5', 'IS-1FCC7193', 'https://roundrocklaundry.com///');
    expect(url).toBe('https://roundrocklaundry.com/5/admin/order/IS-1FCC7193');
  });

  it('produces no double slashes in path segment', () => {
    const url = buildOrderUrl('5', 'IS-1FCC7193', 'roundrocklaundry.com/');
    // After the protocol (https://), there should be no double slashes
    const afterProtocol = url.replace(/^https?:\/\//, '');
    expect(afterProtocol).not.toMatch(/\/\//);
  });
});

describe('generateTicketHtml', () => {
  const originalLocation = window.location;

  beforeAll(() => {
    delete window.location;
    window.location = { origin: 'https://app.smartlaundrybasket.ai' };
  });

  afterAll(() => {
    window.location = originalLocation;
  });

  const baseOptions = {
    orderId: 'IS-1FCC7193',
    laundryId: '5',
    userDomain: 'roundrocklaundry.com',
    bags: 1,
    storeName: 'Round Rock Laundry',
    storeAddress: '123 Main St, Round Rock TX',
    storePhone: '512-555-0100',
    storeEmail: 'info@roundrocklaundry.com',
    customerName: 'John Doe',
    customerPhone: '512-555-0199',
    employeeName: 'Jane Smith',
    dueDate: '2024-01-20',
    dueTimeInterval: '06:00 - 08:00',
    orderDate: '2024-01-18 10:30',
    services: [
      { service: 'Wash & Fold', weightOrCount: 12, inputWeight: true, servicePrice: 2.50 },
      { service: 'Dry Clean Shirt', weightOrCount: 3, inputWeight: false, servicePrice: 5.00 },
    ],
    products: [
      { productName: 'Detergent Pack', productCount: 2, productPrice: 3.99 },
    ],
    subTotal: '52.98',
    coupon: 'SAVE10',
    discountedPrice: '5.30',
    tipAmount: '5.00',
    grandTotal: '52.68',
    balanceDue: '52.68',
    notes: 'Handle with care',
  };

  it('generates valid HTML with store header', () => {
    const html = generateTicketHtml(baseOptions);
    expect(html).toContain('Round Rock Laundry');
    expect(html).toContain('123 Main St, Round Rock TX');
    expect(html).toContain('512-555-0100');
    expect(html).toContain('info@roundrocklaundry.com');
  });

  it('includes order info section', () => {
    const html = generateTicketHtml(baseOptions);
    expect(html).toContain('IS-1FCC7193');
    expect(html).toContain('2024-01-20');
    expect(html).toContain('06:00 - 08:00');
    expect(html).toContain('2024-01-18 10:30');
  });

  it('includes customer and employee info', () => {
    const html = generateTicketHtml(baseOptions);
    expect(html).toContain('John Doe');
    expect(html).toContain('512-555-0199');
    expect(html).toContain('Jane Smith');
  });

  it('renders weight-based services with lbs display', () => {
    const html = generateTicketHtml(baseOptions);
    expect(html).toContain('12 lbs');
    expect(html).toContain('Wash & Fold (2.5/lb)');
  });

  it('renders piece-based services with count display', () => {
    const html = generateTicketHtml(baseOptions);
    expect(html).toContain('<td>3</td>');
    expect(html).toContain('Dry Clean Shirt (5/)');
  });

  it('renders products with count and price', () => {
    const html = generateTicketHtml(baseOptions);
    expect(html).toContain('Detergent Pack (3.99/)');
  });

  it('includes totals section', () => {
    const html = generateTicketHtml(baseOptions);
    expect(html).toContain('Sub Total:');
    expect(html).toContain('52.98');
    expect(html).toContain('Discount(SAVE10):');
    expect(html).toContain('5.30');
    expect(html).toContain('Tip:');
    expect(html).toContain('5.00');
    expect(html).toContain('Grand Total:');
    expect(html).toContain('52.68');
    expect(html).toContain('Balance Due:');
  });

  it('includes order notes and footer', () => {
    const html = generateTicketHtml(baseOptions);
    expect(html).toContain('Handle with care');
    expect(html).toContain('Thank you for your order!');
  });

  it('uses Courier New monospace font', () => {
    const html = generateTicketHtml(baseOptions);
    expect(html).toContain('"Courier New", monospace');
  });

  it('uses 80mm width', () => {
    const html = generateTicketHtml(baseOptions);
    expect(html).toContain('width: 80mm');
  });

  it('uses dashed line separators', () => {
    const html = generateTicketHtml(baseOptions);
    expect(html).toContain('border-top: 1px dashed #000');
  });

  it('includes QR code CDN script', () => {
    const html = generateTicketHtml(baseOptions);
    expect(html).toContain('https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js');
  });

  it('uses error correction level M and 120x120 for QR', () => {
    const html = generateTicketHtml(baseOptions);
    expect(html).toContain("errorCorrectionLevel: 'M'");
    expect(html).toContain('width: 120, height: 120');
  });

  it('encodes full order URL in QR code', () => {
    const html = generateTicketHtml(baseOptions);
    expect(html).toContain('https://roundrocklaundry.com/5/admin/order/IS-1FCC7193');
  });

  it('generates multi-bag tickets with hr separators', () => {
    const html = generateTicketHtml({ ...baseOptions, bags: 3 });
    expect(html).toContain('Ticket 1/3 (Bag)');
    expect(html).toContain('Ticket 2/3 (Bag)');
    expect(html).toContain('Ticket 3/3 (Bag)');
    expect(html).toContain('<hr>');
    // Each bag gets its own QR div
    expect(html).toContain('id="qrcode-1"');
    expect(html).toContain('id="qrcode-2"');
    expect(html).toContain('id="qrcode-3"');
  });

  it('does not show bag header for single bag', () => {
    const html = generateTicketHtml({ ...baseOptions, bags: 1 });
    expect(html).not.toContain('Ticket 1/1 (Bag)');
  });

  it('calculates item count and piece count correctly', () => {
    const html = generateTicketHtml(baseOptions);
    // 2 services + 1 product = 3 items
    expect(html).toContain('Order Item Count: 3');
    // 12 (wash) + 3 (dry clean) + 2 (product) = 17 pieces
    expect(html).toContain('Order Piece Count: 17');
  });

  it('calculates line totals correctly', () => {
    const html = generateTicketHtml(baseOptions);
    // Wash & Fold: 2.50 * 12 = 30
    expect(html).toContain('>30<');
    // Dry Clean Shirt: 5.00 * 3 = 15
    expect(html).toContain('>15<');
    // Detergent Pack: 3.99 * 2 = 7.98
    expect(html).toContain('>7.98<');
  });

  it('handles empty services and products gracefully', () => {
    const html = generateTicketHtml({ ...baseOptions, services: [], products: [] });
    expect(html).toContain('No services or products added');
    expect(html).toContain('Order Item Count: 0');
    expect(html).toContain('Order Piece Count: 0');
  });

  it('uses default values when options are minimal', () => {
    const html = generateTicketHtml({ orderId: 'O-123', laundryId: '1' });
    expect(html).toContain('N/A'); // default store name
    expect(html).toContain('O-123');
    expect(html).toContain('Thank you for your order!');
  });
});
