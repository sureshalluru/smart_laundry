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
  FaShoppingBag,
  FaUserCheck,
  FaWeight,
  FaBarcode,
  FaTshirt,
  FaCog,
} from 'react-icons/fa';
import { useEmployeeAuth } from '../Context/EmployeeAuthContext';
import MobilePhotoAction from '../Components/MobileOrder/MobilePhotoAction';
import MobileWeightEntry from '../Components/MobileOrder/MobileWeightEntry';
import ItemTrackingPanel from '../Components/ItemTracking/ItemTrackingPanel';

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
 * MobileOrderPage — Streamlined mobile-optimized page for processing a single order.
 * Accessed via /:laundryId/admin/order/:orderId after employee PIN authentication.
 *
 * Displays: order summary (customer name, order ID, services, status badge)
 * Actions: Scan Received, Processing, Fold Complete, Enter Weight/Count
 */
const MobileOrderPage = () => {
  const { laundryId, orderId } = useParams();
  const { session } = useEmployeeAuth();
  const toast = useToast();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trackingRecord, setTrackingRecord] = useState(null);

  // Active photo action state
  const [activeAction, setActiveAction] = useState(null); // 'scan_received' | 'processing' | 'fold_complete' | null

  // Track vision results display after successful actions
  const [showVisionResults, setShowVisionResults] = useState(null); // 'scan_received' | 'fold_complete' | null

  // Weight/Count entry drawer
  const {
    isOpen: isWeightEntryOpen,
    onOpen: onWeightEntryOpen,
    onClose: onWeightEntryClose,
  } = useDisclosure();

  const employeeId = session?.employeeId || '';

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API_URL}/api/admin/employee-order-info`, {
        params: {
          laundryId,
          orderId,
        },
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

  // Refresh tracking status and order when page regains focus
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

  /**
   * Called when a photo action completes successfully.
   * Refreshes order data and shows vision results if applicable.
   */
  const handlePhotoComplete = (actionType) => {
    fetchOrder();
    fetchTrackingRecord();
    setActiveAction(null);
    // Show vision results inline for scan_received and fold_complete
    if (actionType === 'scan_received' || actionType === 'fold_complete') {
      setShowVisionResults(actionType);
    }
  };

  /**
   * Called when weight/count entry is saved.
   */
  const handleWeightSaved = () => {
    fetchOrder();
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

        {/* Order Summary */}
        <Box bg="white" borderRadius="lg" p={4} shadow="sm">
          <VStack spacing={3} align="stretch">
            {/* Order ID and Status Badge */}
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

            {/* Customer Name */}
            <HStack spacing={2}>
              <Icon as={FaUser} color="gray.500" boxSize={3} />
              <Text fontSize="sm" color="gray.700">
                {order.customerName || 'N/A'}
              </Text>
            </HStack>

            {/* Services List */}
            {services.length > 0 && (
              <Box>
                <Text fontSize="xs" fontWeight="bold" color="gray.600" mb={1}>
                  Services
                </Text>
                <VStack spacing={1} align="stretch">
                  {services.map((svc, idx) => (
                    <HStack key={svc.id || idx} justify="space-between">
                      <Text fontSize="xs" color="gray.700">
                        {svc.service || svc.serviceName || 'Service'}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        {svc.weightOrCount != null ? svc.weightOrCount : '-'}
                        {svc.inputWeight ? ' lbs' : ' pcs'}
                      </Text>
                    </HStack>
                  ))}
                </VStack>
              </Box>
            )}
          </VStack>
        </Box>

        {/* Action Buttons */}
        <Box bg="white" borderRadius="lg" p={4} shadow="sm">
          <Text fontSize="sm" fontWeight="bold" color="gray.700" mb={3}>
            Actions
          </Text>
          <SimpleGrid columns={2} spacing={3}>
            <Button
              leftIcon={<FaBarcode />}
              variant={activeAction === 'scan_received' ? 'solid' : 'outline'}
              colorScheme="cyan"
              size="md"
              minH="44px"
              fontSize="xs"
              onClick={() => setActiveAction(activeAction === 'scan_received' ? null : 'scan_received')}
            >
              Scan Received
            </Button>
            <Button
              leftIcon={<FaCog />}
              variant={activeAction === 'processing' ? 'solid' : 'outline'}
              colorScheme="yellow"
              size="md"
              minH="44px"
              fontSize="xs"
              onClick={() => setActiveAction(activeAction === 'processing' ? null : 'processing')}
            >
              Processing
            </Button>
            <Button
              leftIcon={<FaTshirt />}
              variant={activeAction === 'fold_complete' ? 'solid' : 'outline'}
              colorScheme="teal"
              size="md"
              minH="44px"
              fontSize="xs"
              onClick={() => setActiveAction(activeAction === 'fold_complete' ? null : 'fold_complete')}
            >
              Fold Complete
            </Button>
            <Button
              leftIcon={<FaWeight />}
              variant="outline"
              colorScheme="purple"
              size="md"
              minH="44px"
              fontSize="xs"
              onClick={onWeightEntryOpen}
            >
              Enter Weight/Count
            </Button>
          </SimpleGrid>
        </Box>

        {/* Active Photo Action */}
        {activeAction === 'scan_received' && (
          <Box bg="white" borderRadius="lg" p={4} shadow="sm">
            <Text fontSize="sm" fontWeight="bold" color="cyan.700" mb={3}>
              📷 Scan Received
            </Text>
            <MobilePhotoAction
              order={order}
              actionType="scan_received"
              targetStatus="ReceivedAtFacility"
              imageType="scan_received"
              employeeId={employeeId}
              onComplete={() => handlePhotoComplete('scan_received')}
            />
          </Box>
        )}

        {activeAction === 'processing' && (
          <Box bg="white" borderRadius="lg" p={4} shadow="sm">
            <Text fontSize="sm" fontWeight="bold" color="yellow.700" mb={3}>
              📷 Processing
            </Text>
            <MobilePhotoAction
              order={order}
              actionType="processing"
              targetStatus="Processing"
              imageType="processing"
              employeeId={employeeId}
              onComplete={() => handlePhotoComplete('processing')}
            />
          </Box>
        )}

        {activeAction === 'fold_complete' && (
          <Box bg="white" borderRadius="lg" p={4} shadow="sm">
            <Text fontSize="sm" fontWeight="bold" color="teal.700" mb={3}>
              📷 Fold Complete
            </Text>
            <MobilePhotoAction
              order={order}
              actionType="fold_complete"
              targetStatus="ReadyForDelivery"
              imageType="fold_complete"
              employeeId={employeeId}
              onComplete={() => handlePhotoComplete('fold_complete')}
            />
          </Box>
        )}

        {/* Vision Results (shown after successful Scan Received / Fold Complete) */}
        {showVisionResults && !activeAction && (
          <Box bg="white" borderRadius="lg" p={4} shadow="sm">
            <Text fontSize="sm" fontWeight="bold" color="gray.700" mb={2}>
              🔍 AI Item Detection
            </Text>
            <ItemTrackingPanel
              orderId={orderId}
              laundryId={laundryId}
              orderStatus={order.orderStatus}
              employeeId={employeeId}
            />
            <Button
              size="sm"
              variant="ghost"
              colorScheme="gray"
              mt={2}
              onClick={() => setShowVisionResults(null)}
            >
              Dismiss
            </Button>
          </Box>
        )}

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

      {/* Weight/Count Entry Drawer */}
      <MobileWeightEntry
        order={order}
        laundryId={laundryId}
        employeeId={employeeId}
        isOpen={isWeightEntryOpen}
        onClose={onWeightEntryClose}
        onSaved={handleWeightSaved}
      />
    </Box>
  );
};

export default MobileOrderPage;
