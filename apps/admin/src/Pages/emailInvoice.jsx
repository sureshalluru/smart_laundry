import html2pdf from 'html2pdf.js';
import axios from 'axios';
import { fetchLaundryInfo } from './LaundryInfoManagement';


export const emailInvoiceToCustomer = async ({ order, invoiceRef, laundryId }) => {
  const authToken = localStorage.getItem('idToken');
if (!authToken) {
  alert("❌ You are not logged in. Please log in again.");
  return;
}
// console.log("authToken", authToken);
  // console.log("🧾 Starting emailInvoiceToCustomer function");
  // console.log("invoice ref",invoiceRef.current);
  if (!invoiceRef?.current) {
    console.warn("🚨 Invoice ref is missing or not ready.");
    return alert("Invoice content not ready.");
  }

  const element = invoiceRef.current;
  // console.log("📄 Found invoice DOM element:", element);

  const opt = {
    margin: 0.3,
    filename: `Invoice_${order.commercialOrderId}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  // console.log("📦 PDF generation options:", opt);

  const laundryInfo = await fetchLaundryInfo(laundryId);
  // console.log("🏢 Laundry info fetched:", laundryInfo);

  const senderEmail = laundryInfo?.email || 'support@example.com';
  const laundryName = laundryInfo?.name || 'Laundry Service';
  const laundryPhone = laundryInfo?.phone || 'our office';

  // console.log("📧 Sender email:", senderEmail);
  // console.log("📞 Laundry contact phone:", laundryPhone);
  // console.log("🏷️ Laundry name:", laundryName);

  try {
    // console.log("📋 HTML content for PDF generation:\n", element.innerHTML);

    // console.log("🧾 Outer HTML of invoiceRef element:", element.outerHTML);

    const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
    // console.log("🧾 PDF Blob created");

    const reader = new FileReader();

    reader.onloadend = async () => {
      const base64data = reader.result.split(',')[1];
      
      const emailHtml = `<!DOCTYPE html>\\n\
      <html>\\n\
      <head>\\n\
        <style>\\n\
          body { font-family: Arial, sans-serif; font-size: 15px; color: #333; }\\n\
          .info { margin-bottom: 15px; }\\n\
        </style>\\n\
      </head>\\n\
      <body>\\n\
        <p>Dear <strong>${order.customerName}</strong>,</p>\\n\
        <p>Thank you for your commercial laundry order. Please find your invoice attached below.</p>\\n\
        <div class='info'>\\n\
          <p><strong>Order ID:</strong> ${order.orderId}</p>\\n\
          <p><strong>Pickup Date:</strong> ${order.pickupDate}</p>\\n\
          <p><strong>Dropoff Date:</strong> ${order.dropoffDate}</p>\\n\
          <p><strong>Total:</strong> $${parseFloat(order.totalCost).toFixed(2)}</p>\\n\
          <p><strong>Paid:</strong> $${parseFloat(order.paidAmount || 0).toFixed(2)}</p>\\n\
          <p><strong>Due:</strong> $${(parseFloat(order.totalCost) - parseFloat(order.paidAmount || 0)).toFixed(2)}</p>\\n\
        </div>\\n\
        ${order.paymentInstructions ? `<p><strong>Payment Instructions:</strong><br>${order.paymentInstructions.replace(/\\n/g, '<br>')}</p>` : ''}\\n\
        <p>If you have questions, reply to this email or contact us at <strong>${laundryPhone || 'our office'}</strong>.</p>\\n\
        <p>— Team ${laundryName || 'Laundry Service'}</p>\\n\
      </body>\\n\
      </html>`;

      const smsMessage = `Hi ${order.customerName}, your laundry order (${order.orderId}) is confirmed. Pickup: ${order.pickupDate}, Dropoff: ${order.dropoffDate}.`;

      const headers = {
        // 'x-api-key': process.env.REACT_APP_AWS_API_KEY,
        'Authorization': `Bearer ${authToken}`,
        'X-Amz-Date': laundryId,
        'Content-Type': 'application/json'
      };

      // console.log("📬 Preparing email payload...");
      const emailPayload = {
        type: 'email_with_attachment',
        recipient: order.customerEmail,
        sender: senderEmail,
        subject: `Invoice for Order ${order.orderId}`,
        message: emailHtml,
        attachment: {
          fileName: `Invoice_${order.orderId}.pdf`,
          base64: base64data,
        },
      };
      // console.log("✅ Email payload ready:", emailPayload);

      // console.log("📲 Preparing SMS payload...");
      const smsPayload = {
        type: 'sms',
        recipient: order.customerPhone,
        message: smsMessage
      };
      // console.log("✅ SMS payload ready:", smsPayload);

      const emailResponse = await axios.post(
        `${process.env.REACT_APP_AWS_API_URL}/api/admin/send-notifications`,
        emailPayload,
        { headers }
      );
      // console.log("📧 Email sent successfully. Response:", emailResponse.data);

      const smsResponse = await axios.post(
        `${process.env.REACT_APP_AWS_API_URL}/api/admin/send-notifications`,
        smsPayload,
        { headers }
      );
      // console.log("📩 SMS sent successfully. Response:", smsResponse.data);

      alert('Invoice emailed and SMS sent to customer!');
    };

    console.log("📤 Reading PDF blob as Base64...");
    reader.readAsDataURL(pdfBlob);
  } catch (err) {
    console.error("❌ Failed to send invoice:", err.response?.data || err.message);
    alert(`Failed to send invoice: ${err.response?.data?.message || err.message}`);
  }
};