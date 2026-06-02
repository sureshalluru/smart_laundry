import React, { forwardRef } from 'react';
import { Box, Text, Stack, HStack, SimpleGrid, Divider, Image } from '@chakra-ui/react';

const InvoicePreview = forwardRef(({ order, paymentInstructions, shopDetails, laundryLogo }, ref) => {
  if (!order) return null;

  // console.log("order is:", JSON.stringify(order, null, 2));
  // console.log("laundryLogo" , laundryLogo);

  const invoiceDate = new Date().toLocaleDateString();
  const totalAmount = parseFloat(order.totalCost || 0).toFixed(2);
  const paidAmount = parseFloat(order.paidAmount || 0).toFixed(2);
  const dueAmount = (totalAmount - paidAmount).toFixed(2);

  return (
<Box
  ref={ref}
  background="white"
  color="black"
  fontSize="14px"
  fontFamily="Arial"
  maxWidth="750px"
  margin="0 auto"
  padding="40px"
  boxSizing="border-box"
>
      <HStack justify="space-between" mb={2}>
        <Text fontWeight="bold">Date: {invoiceDate}</Text>

        {laundryLogo && <Image src={laundryLogo} alt="Laundry Logo" height="50px" objectFit="contain" />}
        
        {laundryLogo && (
  <img
    src={laundryLogo}
    alt="Laundry Logo"
    height="50"
    style={{ objectFit: 'contain' }}
    crossOrigin="anonymous"
  />
)}


      </HStack>

      <Box textAlign="center" mb={4}>
  <Text fontSize="2xl" fontWeight="bold">INVOICE</Text>
</Box>

      <SimpleGrid columns={2} spacing={5} mb={6}>
        <Box>
          <Text fontWeight="bold">Customer Info:</Text>
          <Text>{order.customerName}</Text>
          <Text>{order.customerPhone}</Text>
          <Text>{order.customerEmail}</Text>
        </Box>
        <Box textAlign="right">
          <Text fontWeight="bold">Laundry Info:</Text>
          <Text>{shopDetails?.name}</Text>
          <Text>{shopDetails?.phone}</Text>
          <Text>{shopDetails?.email}</Text>
        </Box>
      </SimpleGrid>

      <Stack spacing={1} mb={4}>
        <Text><strong>Order ID:</strong> {order.orderId}</Text>
        <Text><strong>Pickup Date:</strong> {order.pickupDate || 'N/A'}</Text>
        <Text><strong>Dropoff Date:</strong> {order.dropoffDate || 'N/A'}</Text>
      </Stack>

      {order.services?.length > 0 && (
        <>
          <Text fontSize="lg" fontWeight="bold" mt={4} mb={2}>Services</Text>
          <table width="100%" style={{ borderCollapse: 'collapse', marginBottom: '10px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingBottom: '6px', borderBottom: '1px solid #ccc' }}>Service</th>
                <th style={{ textAlign: 'left', paddingBottom: '6px', borderBottom: '1px solid #ccc' }}>Qty</th>
                <th style={{ textAlign: 'left', paddingBottom: '6px', borderBottom: '1px solid #ccc' }}>Unit Price</th>
                <th style={{ textAlign: 'left', paddingBottom: '6px', borderBottom: '1px solid #ccc' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.services.map((s, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>{s.serviceName || s.service}</td>
                  <td style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>{s.weightOrCount}</td>
                  <td style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>${parseFloat(s.servicePrice).toFixed(2)}</td>
                  <td style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>${(parseFloat(s.servicePrice) * parseFloat(s.weightOrCount)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {order.products?.length > 0 && (
        <>
          <Text fontSize="lg" fontWeight="bold" mt={6} mb={2}>Products</Text>
          <table width="100%" style={{ borderCollapse: 'collapse', marginBottom: '10px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingBottom: '6px', borderBottom: '1px solid #ccc' }}>Product</th>
                <th style={{ textAlign: 'left', paddingBottom: '6px', borderBottom: '1px solid #ccc' }}>Qty</th>
                <th style={{ textAlign: 'left', paddingBottom: '6px', borderBottom: '1px solid #ccc' }}>Unit Price</th>
                <th style={{ textAlign: 'left', paddingBottom: '6px', borderBottom: '1px solid #ccc' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.products.map((p, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>{p.productName}</td>
                  <td style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>{p.quantity || p.productCount}</td>
                  <td style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>${parseFloat(p.unitPrice || p.productPrice).toFixed(2)}</td>
                  <td style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>${(parseFloat(p.unitPrice || p.productPrice) * parseFloat(p.quantity || p.productCount)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <Box textAlign="right" fontWeight="bold" mt={4}>
        <Text>Total: ${totalAmount}</Text>
        <Text>Amount Paid: ${paidAmount}</Text>
        <Text>Amount Due: ${dueAmount}</Text>
      </Box>

      {paymentInstructions && (
        <>
          <Divider my={6} />
          <Text fontWeight="bold">Payment Instructions:</Text>
          <Text whiteSpace="pre-wrap">{paymentInstructions}</Text>
        </>
      )}

      <Divider my={6} />

      <Text fontSize="sm">
        Please make checks payable to: <strong>{shopDetails?.name}</strong><br />
        You may hand it over during pickup, or mail it to our official billing address.<br />
        For questions, reach out at <strong>{shopDetails?.email}</strong> or call <strong>{shopDetails?.phone}</strong>.<br /><br />
        Thank you for choosing our laundry service. We appreciate your business and look forward to serving you again!
      </Text>
    </Box>
  );
});

export default InvoicePreview;



// import React, { forwardRef } from 'react';
// import { Box, Text, Stack, Divider, Image, HStack, SimpleGrid } from '@chakra-ui/react';

// const InvoicePreview = forwardRef(({ order, paymentInstructions, shopDetails, laundryLogo }, ref) => {
//   if (!order) return null;
//   console.log("order is",order);

//   const {
//     commercialOrderId,
//     customerName,
//     customerPhone,
//     customerEmail,
//     companyName,
//     dropoffDate,
//     pickupDate,
//     services = [],
//     products = [],
//     totalCost = 0,
//     paidAmount = 0
//   } = order;

//   const invoiceDate = new Date().toLocaleDateString();
//   const dueAmount = (parseFloat(totalCost) - parseFloat(paidAmount)).toFixed(2);

//   return (
//     <Box ref={ref} p={8} background="white" color="black" fontSize="14px" width="800px" fontFamily="Arial">
//       <HStack justify="space-between" mb={4}>
//         <Text fontWeight="bold">Date: {invoiceDate}</Text>
//         <Text fontSize="2xl" fontWeight="bold">INVOICE</Text>
//         {laundryLogo && <Image src={laundryLogo} alt="Laundry Logo" height="50px" />}
//       </HStack>

//       <SimpleGrid columns={2} spacing={10} mb={6}>
//         <Box>
//           <Text fontWeight="bold">Customer Info:</Text>
//           <Text>{customerName}</Text>
//           <Text>{customerPhone}</Text>
//           <Text>{customerEmail}</Text>
//           <Text>{companyName || 'N/A'}</Text>
//         </Box>
//         <Box textAlign="right">
//           <Text fontWeight="bold">Laundry Info:</Text>
//           <Text>{shopDetails?.name}</Text>
//           <Text>{shopDetails?.phone}</Text>
//           <Text>{shopDetails?.email}</Text>
//         </Box>
//       </SimpleGrid>

//       <Stack spacing={1} mb={4}>
//         <Text><strong>Order ID:</strong> {commercialOrderId}</Text>
//         <Text><strong>Pickup Date:</strong> {pickupDate || 'N/A'}</Text>
//         <Text><strong>Dropoff Date:</strong> {dropoffDate || 'N/A'}</Text>
//       </Stack>

//       {services.length > 0 && (
//         <>
//           <Text fontSize="lg" fontWeight="bold" mt={4} mb={2}>Services</Text>
//           <table width="100%" border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
//             <thead>
//               <tr>
//                 <th>Service</th>
//                 <th>Qty</th>
//                 <th>Unit Price</th>
//                 <th>Total</th>
//               </tr>
//             </thead>
//             <tbody>
//               {services.map((s, idx) => (
//                 <tr key={idx}>
//                   <td>{s.serviceName || s.service}</td>
//                   <td>{s.weightOrCount}</td>
//                   <td>${parseFloat(s.servicePrice).toFixed(2)}</td>
//                   <td>${(parseFloat(s.servicePrice) * parseFloat(s.weightOrCount)).toFixed(2)}</td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </>
//       )}

//       {products.length > 0 && (
//         <>
//           <Text fontSize="lg" fontWeight="bold" mt={6} mb={2}>Products</Text>
//           <table width="100%" border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
//             <thead>
//               <tr>
//                 <th>Product</th>
//                 <th>Qty</th>
//                 <th>Unit Price</th>
//                 <th>Total</th>
//               </tr>
//             </thead>
//             <tbody>
//               {products.map((p, idx) => (
//                 <tr key={idx}>
//                   <td>{p.productName}</td>
//                   <td>{p.quantity || p.productCount}</td>
//                   <td>${parseFloat(p.unitPrice || p.productPrice).toFixed(2)}</td>
//                   <td>${(parseFloat(p.unitPrice || p.productPrice) * parseFloat(p.quantity || p.productCount)).toFixed(2)}</td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </>
//       )}

//       <Divider my={6} />

//       <Box textAlign="right" fontWeight="bold">
//         <Text>Total: ${parseFloat(totalCost).toFixed(2)}</Text>
//         <Text>Amount Paid: ${parseFloat(paidAmount).toFixed(2)}</Text>
//         <Text>Amount Due: ${dueAmount}</Text>
//       </Box>

//       {paymentInstructions && (
//         <>
//           <Divider my={6} />
//           <Text fontSize="md" fontWeight="bold" mb={1}>Payment Instructions:</Text>
//           <Text whiteSpace="pre-wrap">{paymentInstructions}</Text>
//         </>
//       )}

//       <Divider my={6} />

//       <Text fontSize="sm">
//         Please make checks payable to: <strong>{shopDetails?.name}</strong><br />
//         You may hand it over during pickup or mail it to our official billing address.<br />
//         For questions, contact <strong>{shopDetails?.email}</strong> or call <strong>{shopDetails?.phone}</strong>.<br /><br />
//         Thank you for choosing our laundry service. We appreciate your business and look forward to serving you again!
//       </Text>
//     </Box>
//   );
// });

// export default InvoicePreview;

