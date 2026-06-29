import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Spinner,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Divider,
  Icon,
  Center,
  Button,
  SimpleGrid,
  useToast,
  useDisclosure,
} from '@chakra-ui/react';
import {
  FaUser,
  FaPhone,
  FaCalendarAlt,
  FaShoppingBag,
  FaUserCheck,
  FaCamera,
  FaExchangeAlt,
  FaBarcode,
  FaTshirt,
  FaEdit,
  FaHistory,
  FaPrint,
  FaCheck,
} from 'react-icons/fa';
import { useEmployeeAuth } from '../Context/EmployeeAuthContext';
import { generateTicketHtml } from '../utils/ticketPrint';
import MobileEditServices from '../Components/MobileOrder/MobileEditServices';
import MobileOrderHistory from '../Components/MobileOrder/MobileOrderHistory';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

/**
 * Returns a Chakra colorScheme for a given order status.
 */
function getStatusColor(status) {
  const map = {
    OrderSubmitted: 'gray',
    ReadyForIntake: 'blue',
    ReceivedAtFacility: 'cyan',
    Processing: 'yellow',
    ProcessingStarted: 'yellow',
    ProcessingCompleted: 'orange',
    ReadyForDelivery: 'teal',
    EnRouteToDelivery: 'purple',
    Delivered: 'green',
    OrderCanceled: 'red',
  };
  return map[status] || 'gray';
}

/**
 * Formats a date string for mobile display.
 */
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Statuses where "Scan Received" (intake tracking) is available */
const INTAKE_ELIGIBLE_STATUSES = ['ReceivedAtFacility', 'Processing', 'ProcessingStarted'];

/** Statuses where "Scan Fold" (fold tracking) is available */
const FOLD_ELIGIBLE_STATUSES = ['ProcessingCompleted', 'ReadyForDelivery'];

/**
 * MobileOrderPage — dedicated mobile-optimized page for viewing a single order.
 * Accessed via /:laundryId/admin/order/:orderId after employee authentication.
 */
const MobileOrderPage = () => {
  const { laundryId, orderId } = useParams();
  const { session } = useEmployeeAuth();
  const toast = useToast();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trackingRecord, setTrackingRecord] = useState(null);

  // Edit Services/Products drawer
  const {
    isOpen: isEditServicesOpen,
    onOpen: onEditServicesOpen,
    onClose: onEditServicesClose,
  } = useDisclosure();

  // Order History drawer
  const {
    isOpen: isHistoryOpen,
    onOpen: onHistoryOpen,
    onClose: onHistoryClose,
  } = useDisclosure();

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authToken = localStorage.getItem('idToken');
      const headers = authToken
        ? { Authorization: `Bearer ${authToken}` }
        : {};

      const response = await axios.get(`${API_URL}/api/admin/orders-info`, {
        params: {
          operation: 'getSingleOrder',
          laundryId,
          orderId,
        },
        headers,
        timeout: 15000,
      });

      const data = response.data?.body || response.data;

      if (!data || data.message === 'Order not found' || response.data?.statusCode === 404) {
        setError('Order not found');
        setOrder(null);
      } else {
        setOrder(data);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Order not found');
      } else {
        setError('Unable to load order. Please try again.');
      }
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [laundryId, orderId]);

  const fetchTrackingRecord = useCallback(async () => {
    if (!laundryId || !orderId) return;
    try {
      const res = await fetch(
        `${API_URL}/api/admin/item-tracking/record?orderId=${encodeURIComponent(orderId)}&laundryId=${encodeURIComponent(laundryId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setTrackingRecord(data);
      }
    } catch (e) {
      console.error('Failed to fetch tracking record:', e);
    }
  }, [laundryId, orderId]);

  useEffect(() => {
    if (laundryId && orderId) {
      fetchOrder();
      fetchTrackingRecord();
    }
  }, [laundryId, orderId, fetchOrder, fetchTrackingRecord]);

  // Refresh tracking status and order when page regains focus (returning from upload page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && laundryId && orderId) {
        fetchTrackingRecord();
        fetchOrder();
      }
    };

    const handleFocus = () => {
      if (laundryId && orderId) {
        fetchTrackingRecord();
        fetchOrder();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [laundryId, orderId, fetchTrackingRecord, fetchOrder]);

  const hasIntakeRecord = trackingRecord?.intakeRecord != null;
  const hasFoldRecord = trackingRecord?.foldRecord != null;

  /**
   * Navigate to the item tracking upload page for the given phase.
   * Calls the qr-code endpoint to generate a token, then navigates to /track/{token}.
   */
  const handleItemTracking = async (phase) => {
    try {
      const employeeId = session?.employeeId || 'EMP';
      const params = new URLSearchParams({
        orderId,
        laundryId,
        phase,
        employeeId,
        baseUrl: window.location.origin,
      });
      const res = await fetch(`${API_URL}/api/admin/item-tracking/qr-code?${params}`);
      if (res.ok) {
        const data = await res.json();
        // Navigate to the upload page - opens in same window
        window.location.href = data.qrUrl;
      } else {
        toast({
          title: 'Error',
          description: 'Failed to generate item tracking link. Please try again.',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (e) {
      console.error('Failed to launch item tracking:', e);
      toast({
        title: 'Error',
        description: 'Failed to launch item tracking. Please check your connection.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  /**
   * Print ticket using the shared generateTicketHtml utility.
   * Creates a hidden iframe, writes the HTML, and triggers the browser print dialog.
   */
  const handlePrintTicket = () => {
    const htmlContent = generateTicketHtml({
      orderId: order.orderId,
      laundryId,
      userDomain: null, // Uses window.location.origin fallback
      bags: order.laundryBags || 1,
      storeName: order.storeName || 'N/A',
      storeAddress: order.storeAddress || 'N/A',
      storePhone: order.storePhone || 'N/A',
      storeEmail: order.storeEmail || 'N/A',
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      employeeName: session?.fullName || 'N/A',
      dueDate: order.dropoffDate,
      dueTimeInterval: order.dropoffTimeInterval,
      orderDate: order.pickupDate,
      services: order.services,
      products: order.products,
      subTotal: order.subTotal,
      coupon: order.coupon,
      discountedPrice: order.discountedPrice,
      tipAmount: order.tip?.tipAmount,
      grandTotal: order.grandTotal,
      balanceDue: order.balanceDue,
      notes: order.specialInstructions,
    });

    // Print via hidden iframe — same pattern as QuickPOSPage and OrdersInfoManagement
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();
    // Wait for QR codes to load, then print
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      // Clean up iframe after print dialog closes
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 800);
  };

  // Loading state
  if (loading) {
    return (
      <Center minH="100vh" bg="gray.50">
        <VStack spacing={4}>
          <Spinner size="xl" color="blue.500" thickness="4px" />
          <Text color="gray.600" fontSize="sm">Loading order...</Text>
        </VStack>
      </Center>
    );
  }

  // Error / not found state
  if (error || !order) {
    return (
      <Center minH="100vh" bg="gray.50" px={4}>
        <VStack spacing={4} textAlign="center">
          <Icon as={FaShoppingBag} boxSize={12} color="gray.300" />
          <Text fontSize="xl" fontWeight="bold" color="gray.700">
            Order Not Found
          </Text>
          <Text fontSize="sm" color="gray.500">
            {error || 'The order you are looking for does not exist or could not be loaded.'}
          </Text>
          <Text fontSize="xs" color="gray.400">
            Order ID: {orderId}
          </Text>
        </VStack>
      </Center>
    );
  }

  const services = order.services || [];
  const products = order.products || [];
  const employeeName = session?.fullName || 'Unknown Employee';

  return (
    <Box
      bg="gray.50"
      minH="100vh"
      maxW="428px"
      mx="auto"
      px={3}
      py={4}
      overflowX="hidden"
    >
      <VStack spacing={4} align="stretch">
        {/* Employee Info */}
        <HStack spacing={2} bg="blue.50" px={3} py={2} borderRadius="md">
          <Icon as={FaUserCheck} color="blue.500" boxSize={4} />
          <Text fontSize="xs" color="blue.700" fontWeight="medium">
            Logged in as: {employeeName}
          </Text>
        </HStack>

        {/* Order Header */}
        <Box bg="white" borderRadius="lg" p={4} shadow="sm">
          <VStack spacing={3} align="stretch">
            {/* Order ID and Status */}
            <HStack justify="space-between" align="center">
              <Text fontSize="lg" fontWeight="bold" color="gray.800">
                {order.orderId}
              </Text>
              <Badge
                colorScheme={getStatusColor(order.orderStatus)}
                fontSize="xs"
                px={2}
                py={1}
                borderRadius="md"
              >
                {order.orderStatus}
              </Badge>
            </HStack>

            <Divider />

            {/* Customer Info */}
            <VStack spacing={2} align="stretch">
              <HStack spacing={2}>
                <Icon as={FaUser} color="gray.500" boxSize={3} />
                <Text fontSize="sm" color="gray.700">
                  {order.customerName || 'N/A'}
                </Text>
              </HStack>
              <HStack spacing={2}>
                <Icon as={FaPhone} color="gray.500" boxSize={3} />
                <Text fontSize="sm" color="gray.700">
                  {order.customerPhone || 'N/A'}
                </Text>
              </HStack>
            </VStack>

            <Divider />

            {/* Due Date and Order Type */}
            <HStack justify="space-between" align="center">
              <HStack spacing={2}>
                <Icon as={FaCalendarAlt} color="gray.500" boxSize={3} />
                <Text fontSize="xs" color="gray.600">
                  Due: {formatDate(order.dropoffDate)}
                  {order.dropoffTimeInterval ? ` (${order.dropoffTimeInterval})` : ''}
                </Text>
              </HStack>
              {order.orderType && (
                <Badge colorScheme="gray" fontSize="2xs" variant="outline">
                  {order.orderType}
                </Badge>
              )}
            </HStack>
          </VStack>
        </Box>

        {/* Order Summary — Services */}
        {services.length > 0 && (
          <Box bg="white" borderRadius="lg" p={4} shadow="sm">
            <Text fontSize="sm" fontWeight="bold" color="gray.700" mb={2}>
              Services
            </Text>
            <Box overflowX="auto">
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th fontSize="2xs" px={1}>Qty/Weight</Th>
                    <Th fontSize="2xs" px={1}>Service</Th>
                    <Th fontSize="2xs" px={1} isNumeric>Price</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {services.map((svc, idx) => (
                    <Tr key={svc.id || idx}>
                      <Td fontSize="xs" px={1}>
                        {svc.weightOrCount != null ? svc.weightOrCount : '-'}
                      </Td>
                      <Td fontSize="xs" px={1}>
                        {svc.service || svc.serviceName || 'Service'}
                      </Td>
                      <Td fontSize="xs" px={1} isNumeric>
                        ${(svc.servicePrice || 0).toFixed(2)}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </Box>
        )}

        {/* Order Summary — Products */}
        {products.length > 0 && (
          <Box bg="white" borderRadius="lg" p={4} shadow="sm">
            <Text fontSize="sm" fontWeight="bold" color="gray.700" mb={2}>
              Products
            </Text>
            <Box overflowX="auto">
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th fontSize="2xs" px={1}>Count</Th>
                    <Th fontSize="2xs" px={1}>Product</Th>
                    <Th fontSize="2xs" px={1} isNumeric>Price</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {products.map((prod, idx) => (
                    <Tr key={prod.id || idx}>
                      <Td fontSize="xs" px={1}>
                        {prod.product_count || prod.productCount || '-'}
                      </Td>
                      <Td fontSize="xs" px={1}>
                        {prod.product_name || prod.productName || 'Product'}
                      </Td>
                      <Td fontSize="xs" px={1} isNumeric>
                        ${parseFloat(prod.product_price || prod.productPrice || 0).toFixed(2)}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </Box>
        )}

        {/* Order Totals */}
        <Box bg="white" borderRadius="lg" p={4} shadow="sm">
          <VStack spacing={1} align="stretch">
            <HStack justify="space-between">
              <Text fontSize="xs" color="gray.600">Subtotal</Text>
              <Text fontSize="xs" fontWeight="medium">${(order.subTotal || 0).toFixed(2)}</Text>
            </HStack>
            {order.discountedPrice > 0 && (
              <HStack justify="space-between">
                <Text fontSize="xs" color="gray.600">
                  Discount {order.coupon && order.coupon !== 'None' ? `(${order.coupon})` : ''}
                </Text>
                <Text fontSize="xs" color="green.600">-${(order.discountedPrice || 0).toFixed(2)}</Text>
              </HStack>
            )}
            {order.tip?.tipAmount > 0 && (
              <HStack justify="space-between">
                <Text fontSize="xs" color="gray.600">Tip</Text>
                <Text fontSize="xs" fontWeight="medium">${(order.tip.tipAmount || 0).toFixed(2)}</Text>
              </HStack>
            )}
            <Divider my={1} />
            <HStack justify="space-between">
              <Text fontSize="sm" fontWeight="bold" color="gray.800">Grand Total</Text>
              <Text fontSize="sm" fontWeight="bold" color="gray.800">
                ${(order.grandTotal || 0).toFixed(2)}
              </Text>
            </HStack>
            {order.balanceDue > 0 && (
              <HStack justify="space-between">
                <Text fontSize="xs" color="red.600" fontWeight="medium">Balance Due</Text>
                <Text fontSize="xs" color="red.600" fontWeight="medium">
                  ${(order.balanceDue || 0).toFixed(2)}
                </Text>
              </HStack>
            )}
          </VStack>
        </Box>

        {/* Action Buttons Grid */}
        <Box bg="white" borderRadius="lg" p={4} shadow="sm">
          <Text fontSize="sm" fontWeight="bold" color="gray.700" mb={3}>
            Actions
          </Text>
          <SimpleGrid columns={2} spacing={3}>
            <Button
              leftIcon={<FaCamera />}
              variant="outline"
              colorScheme="blue"
              size="md"
              minH="44px"
              fontSize="xs"
              onClick={() => {/* Placeholder - implemented in Task 5 */}}
            >
              Upload Scale Photo
            </Button>
            <Button
              leftIcon={<FaExchangeAlt />}
              variant="outline"
              colorScheme="purple"
              size="md"
              minH="44px"
              fontSize="xs"
              onClick={() => {/* Placeholder - implemented in Task 5 */}}
            >
              Change Status
            </Button>
            {INTAKE_ELIGIBLE_STATUSES.includes(order.orderStatus) && (
              <Button
                leftIcon={<FaBarcode />}
                rightIcon={hasIntakeRecord ? <Icon as={FaCheck} color="green.500" /> : undefined}
                variant="outline"
                colorScheme="cyan"
                size="md"
                minH="44px"
                fontSize="xs"
                onClick={() => handleItemTracking('intake')}
              >
                {hasIntakeRecord ? 'Redo Intake' : 'Scan Received'}
              </Button>
            )}
            {FOLD_ELIGIBLE_STATUSES.includes(order.orderStatus) && (
              <Button
                leftIcon={<FaTshirt />}
                rightIcon={hasFoldRecord ? <Icon as={FaCheck} color="green.500" /> : undefined}
                variant="outline"
                colorScheme="teal"
                size="md"
                minH="44px"
                fontSize="xs"
                onClick={() => handleItemTracking('fold')}
              >
                {hasFoldRecord ? 'Redo Fold' : 'Scan Fold'}
              </Button>
            )}
            <Button
              leftIcon={<FaEdit />}
              variant="outline"
              colorScheme="orange"
              size="md"
              minH="44px"
              fontSize="xs"
              onClick={onEditServicesOpen}
            >
              Edit Services/Products
            </Button>
            <Button
              leftIcon={<FaHistory />}
              variant="outline"
              colorScheme="gray"
              size="md"
              minH="44px"
              fontSize="xs"
              onClick={onHistoryOpen}
            >
              View Order History
            </Button>
            <Button
              leftIcon={<FaPrint />}
              variant="outline"
              colorScheme="green"
              size="md"
              minH="44px"
              fontSize="xs"
              onClick={handlePrintTicket}
            >
              Print Ticket
            </Button>
          </SimpleGrid>
        </Box>

        {/* Special Instructions */}
        {order.specialInstructions && (
          <Box bg="yellow.50" borderRadius="lg" p={3} borderLeft="3px solid" borderColor="yellow.400">
            <Text fontSize="xs" fontWeight="bold" color="yellow.800" mb={1}>
              Special Instructions
            </Text>
            <Text fontSize="xs" color="gray.700">
              {order.specialInstructions}
            </Text>
          </Box>
        )}
      </VStack>

      {/* Edit Services/Products Drawer */}
      <MobileEditServices
        order={order}
        laundryId={laundryId}
        isOpen={isEditServicesOpen}
        onClose={onEditServicesClose}
        onOrderUpdated={fetchOrder}
      />

      {/* Order History Drawer */}
      <MobileOrderHistory
        orderId={orderId}
        laundryId={laundryId}
        isOpen={isHistoryOpen}
        onClose={onHistoryClose}
      />
    </Box>
  );
};

export default MobileOrderPage;
