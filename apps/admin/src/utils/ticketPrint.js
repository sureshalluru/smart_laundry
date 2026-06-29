/**
 * Shared ticket printing utilities for the admin app.
 * Used by Quick POS, regular order prints, and the Mobile Order Page QR flow.
 */

import { roundToTwo } from './decimalUtils';

/**
 * Builds a full URL to the mobile order page for a given order.
 * Used as QR code data on printed tickets and in the POS QR display.
 *
 * @param {string} laundryId - The laundry shop ID
 * @param {string} orderId - The order ID (e.g., "IS-1FCC7193")
 * @param {string|null|undefined} userDomain - Custom domain configured for the laundry (e.g., "roundrocklaundry.com" or "https://roundrocklaundry.com")
 * @returns {string} Full URL to the order page
 */
export function buildOrderUrl(laundryId, orderId, userDomain) {
  let baseUrl;

  if (userDomain && userDomain.trim()) {
    const trimmed = userDomain.trim();
    if (trimmed.startsWith('http')) {
      baseUrl = trimmed;
    } else {
      baseUrl = `https://${trimmed}`;
    }
  } else {
    baseUrl = window.location.origin;
  }

  // Remove trailing slash from baseUrl to prevent double slashes
  const cleanBase = baseUrl.replace(/\/+$/, '');

  return `${cleanBase}/${laundryId}/admin/order/${orderId}`;
}

/**
 * Generates a complete HTML document for printing an order ticket/receipt.
 * Unified template used by both Quick POS and regular order print flows.
 *
 * Layout (top to bottom):
 * 1. Store header (centered) — name, address, phone, email
 * 2. Order info — Order ID, Due by date/time, Order date
 * 3. Customer info — name, phone
 * 4. Employee name
 * 5. Item table — Qty, Item Name (with unit price), line total
 * 6. Order Item Count / Piece Count
 * 7. Totals — Sub Total, Discount (coupon), Tip, Grand Total, Balance Due
 * 8. Order Notes
 * 9. "Thank you for your order!" footer
 * 10. QR code — Full URL to Mobile Order Page
 *
 * @param {Object} options
 * @param {string} options.orderId - The order ID (e.g., "IS-1FCC7193")
 * @param {string} options.laundryId - The laundry shop ID
 * @param {string|null|undefined} options.userDomain - Custom domain for QR URL
 * @param {number} options.bags - Number of bag tickets to print (default 1)
 * @param {string} options.storeName - Laundry shop name
 * @param {string} options.storeAddress - Full address string
 * @param {string} options.storePhone - Shop phone number
 * @param {string} options.storeEmail - Shop email
 * @param {string} options.customerName - Customer name
 * @param {string} options.customerPhone - Customer phone number
 * @param {string} options.employeeName - Employee who created/processed the order
 * @param {string} options.dueDate - Due by date string
 * @param {string} options.dueTimeInterval - Time window (e.g., "06:00 - 08:00")
 * @param {string} options.orderDate - Order creation date/time
 * @param {Array} options.services - [{service, weightOrCount, inputWeight, servicePrice}]
 * @param {Array} options.products - [{productName, productCount, productPrice}]
 * @param {number|string} options.subTotal - Subtotal amount
 * @param {string} options.coupon - Coupon code or "None"
 * @param {number|string} options.discountedPrice - Discount amount
 * @param {number|string} options.tipAmount - Tip amount
 * @param {number|string} options.grandTotal - Grand total amount
 * @param {number|string} options.balanceDue - Balance due amount
 * @param {string} options.notes - Order special instructions
 * @returns {string} Full HTML document string ready for iframe print
 */
export function generateTicketHtml(options) {
  const {
    orderId,
    laundryId,
    userDomain,
    bags = 1,
    storeName = 'N/A',
    storeAddress = 'N/A',
    storePhone = 'N/A',
    storeEmail = 'N/A',
    customerName = 'N/A',
    customerPhone = 'N/A',
    employeeName = 'N/A',
    dueDate = 'N/A',
    dueTimeInterval = '',
    orderDate = 'N/A',
    services = [],
    products = [],
    subTotal = '0.00',
    coupon = 'None',
    discountedPrice = '0.00',
    tipAmount = '0.00',
    grandTotal = '0.00',
    balanceDue = '0.00',
    notes = '',
  } = options;

  const orderUrl = buildOrderUrl(laundryId, orderId, userDomain);

  // Build item rows for the table
  const serviceRows = services.map((service) => {
    const serviceName = service.service || 'Unnamed Service';
    const countOrWeight = service.weightOrCount || 1;
    const unitPrice = service.servicePrice || 0;
    const lineTotal = roundToTwo(unitPrice * countOrWeight);

    if (service.inputWeight) {
      // Weight-based: display "{weightOrCount} lbs" as qty, show "(price/lb)" for unit
      return `<tr>
        <td>${countOrWeight} lbs</td>
        <td>${serviceName} (${unitPrice}/lb)</td>
        <td class="price">${lineTotal}</td>
      </tr>`;
    } else {
      // Piece-based: display weightOrCount as qty, show "(price/)" for unit
      return `<tr>
        <td>${countOrWeight}</td>
        <td>${serviceName} (${unitPrice}/)</td>
        <td class="price">${lineTotal}</td>
      </tr>`;
    }
  });

  const productRows = products.map((product) => {
    const productName = product.productName || 'Unnamed Product';
    const productCount = product.productCount || 1;
    const productPrice = product.productPrice || 0;
    const lineTotal = roundToTwo(productPrice * productCount);

    return `<tr>
      <td>${productCount}</td>
      <td>${productName} (${productPrice}/)</td>
      <td class="price">${lineTotal}</td>
    </tr>`;
  });

  const allItemRows = [...serviceRows, ...productRows].join('');

  // Calculate item count and piece count
  const itemCount = services.length + products.length;
  const pieceCount = services.reduce((sum, s) => sum + (Number(s.weightOrCount) || 1), 0)
    + products.reduce((sum, p) => sum + (Number(p.productCount) || 1), 0);

  // Generate a single ticket section
  const generateTicketSection = (bagNumber, totalBags) => {
    const bagHeader = totalBags > 1
      ? `<div class="center ticket-header">Ticket ${bagNumber}/${totalBags} (Bag)</div>`
      : '';

    return `
      <div class="receipt">
        ${bagHeader}
        <div class="center">${storeName}</div>
        <div class="center">${storeAddress}</div>
        <div class="center">${storePhone}</div>
        <div class="center">${storeEmail}</div>
        <div class="line"></div>
        <div><span>Order:</span> ${orderId}</div>
        <div><span>Due by:</span> ${dueDate}<br> ${dueTimeInterval}</div>
        <div><span>Order Date:</span> ${orderDate}</div>
        <div class="line"></div>
        <div>${customerName}<br>${customerPhone}</div>
        <div class="line"></div>
        <div><span>Employee:</span> ${employeeName}</div>
        <div class="line"></div>
        <table>
          <thead>
            <tr>
              <th>Qty</th>
              <th>Item Name</th>
              <th class="price">Price</th>
            </tr>
          </thead>
          <tbody>
            ${allItemRows || '<tr><td colspan="3">No services or products added</td></tr>'}
          </tbody>
        </table>
        <div class="line"></div>
        <div>Order Item Count: ${itemCount}</div>
        <div>Order Piece Count: ${pieceCount}</div>
        <div class="line"></div>
        <div>Sub Total: <span class="price">${subTotal}</span></div>
        <div>Discount(${coupon}): <span class="price">${discountedPrice}</span></div>
        <div>Tip: <span class="price">${tipAmount}</span></div>
        <div>Grand Total: <span class="price">${grandTotal}</span></div>
        <div>Balance Due: <span class="price">${balanceDue}</span></div>
        <div class="line"></div>
        <div>Order Notes: ${notes}</div>
        <div class="line"></div>
        <div class="center">Thank you for your order!</div>
        <div class="line"></div>
        <div class="qr-code" id="qrcode-${bagNumber}"></div>
      </div>
    `;
  };

  // Generate all ticket sections with <hr> separators for multi-bag
  const ticketSections = Array.from({ length: bags }, (_, i) =>
    generateTicketSection(i + 1, bags)
  ).join('<hr>');

  // Generate QR code script for each bag
  const qrScripts = Array.from({ length: bags }, (_, i) => `
    QRCode.toDataURL('${orderUrl}', { width: 120, height: 120, errorCorrectionLevel: 'M' }, function(err, url) {
      var qrContainer = document.getElementById('qrcode-${i + 1}');
      if (err) {
        console.error('QR Code generation failed:', err);
        if (qrContainer) qrContainer.innerHTML = '<p>QR Code unavailable</p>';
      } else {
        var img = document.createElement('img');
        img.src = url;
        if (qrContainer) qrContainer.appendChild(img);
      }
    });
  `).join('\n');

  return `
    <html>
      <head>
        <title>Order Ticket</title>
        <style>
          @page {
            size: auto;
            margin: 0;
          }
          body {
            font-family: "Courier New", monospace;
            margin: 0;
            padding: 0;
            width: 80mm;
            font-size: 14px;
            font-weight: bold;
          }
          .receipt {
            padding: 10px;
            box-sizing: border-box;
            width: 80mm;
          }
          .center {
            text-align: center;
          }
          .ticket-header {
            font-size: 16px;
            margin-bottom: 10px;
          }
          .line {
            border-top: 1px dashed #000;
            margin: 5px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            text-align: left;
            padding: 2px 0;
            font-weight: bold;
          }
          .price {
            text-align: right;
          }
          .qr-code {
            text-align: center;
            margin-top: 10px;
          }
          hr {
            border: none;
            border-top: 1px dashed #000;
            margin: 10px 0;
          }
        </style>
      </head>
      <body>
        ${ticketSections}
        <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
        <script>
          ${qrScripts}
        </script>
      </body>
    </html>
  `;
}
