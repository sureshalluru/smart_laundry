import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Spinner,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerCloseButton,
  Icon,
  Center,
} from '@chakra-ui/react';
import { FaHistory, FaUserAlt, FaClock } from 'react-icons/fa';

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
 * Formats a timestamp for display in the history timeline.
 */
function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return ts;
  }
}

/**
 * MobileOrderHistory — Drawer component for viewing the order history timeline.
 *
 * Props:
 * - orderId: the order ID to fetch history for
 * - laundryId: the laundry shop ID
 * - isOpen: controls drawer visibility
 * - onClose: callback to close the drawer
 */
const MobileOrderHistory = ({ orderId, laundryId, isOpen, onClose }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(async () => {
    if (!orderId || !laundryId) return;
    setLoading(true);
    setError(null);
    try {
      const authToken = localStorage.getItem('idToken');
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

      const response = await axios.get(`${API_URL}/api/admin/orders-info`, {
        params: {
          operation: 'fetchOrderHistory',
          orderId,
          laundryId,
        },
        headers,
        timeout: 15000,
      });

      const data = response.data?.body || response.data;
      if (Array.isArray(data)) {
        setHistory(data);
      } else if (data?.history && Array.isArray(data.history)) {
        setHistory(data.history);
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error('Failed to fetch order history:', err);
      setError('Unable to load order history. Please try again.');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [orderId, laundryId]);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

  return (
    <Drawer isOpen={isOpen} placement="bottom" onClose={onClose} size="full">
      <DrawerOverlay />
      <DrawerContent maxH="85vh" borderTopRadius="xl">
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px" pb={3}>
          <HStack spacing={2}>
            <Icon as={FaHistory} color="gray.600" />
            <Text fontSize="md" fontWeight="bold">
              Order History
            </Text>
          </HStack>
          <Text fontSize="xs" color="gray.500" mt={1}>
            {orderId}
          </Text>
        </DrawerHeader>

        <DrawerBody py={4} overflowY="auto">
          {/* Loading state */}
          {loading && (
            <Center py={8}>
              <VStack spacing={3}>
                <Spinner size="lg" color="blue.500" thickness="3px" />
                <Text fontSize="sm" color="gray.500">
                  Loading history...
                </Text>
              </VStack>
            </Center>
          )}

          {/* Error state */}
          {!loading && error && (
            <Center py={8}>
              <Text fontSize="sm" color="red.500">
                {error}
              </Text>
            </Center>
          )}

          {/* Empty state */}
          {!loading && !error && history.length === 0 && (
            <Center py={8}>
              <VStack spacing={3}>
                <Icon as={FaHistory} boxSize={8} color="gray.300" />
                <Text fontSize="sm" color="gray.500">
                  No history available for this order.
                </Text>
              </VStack>
            </Center>
          )}

          {/* Timeline */}
          {!loading && !error && history.length > 0 && (
            <VStack spacing={0} align="stretch">
              {history.map((event, idx) => (
                <Box key={idx} position="relative" pl={6} pb={idx < history.length - 1 ? 4 : 0}>
                  {/* Timeline line */}
                  {idx < history.length - 1 && (
                    <Box
                      position="absolute"
                      left="9px"
                      top="12px"
                      bottom="0"
                      width="2px"
                      bg="gray.200"
                    />
                  )}
                  {/* Timeline dot */}
                  <Box
                    position="absolute"
                    left="4px"
                    top="6px"
                    width="12px"
                    height="12px"
                    borderRadius="full"
                    bg={idx === 0 ? 'blue.400' : 'gray.300'}
                    border="2px solid"
                    borderColor={idx === 0 ? 'blue.100' : 'gray.100'}
                  />

                  {/* Event content */}
                  <Box
                    bg={idx === 0 ? 'blue.50' : 'gray.50'}
                    borderRadius="md"
                    p={3}
                    ml={2}
                  >
                    {/* Status badge */}
                    <Badge
                      colorScheme={getStatusColor(event.status || event.orderStatus)}
                      fontSize="xs"
                      px={2}
                      py={0.5}
                      borderRadius="sm"
                      mb={1}
                    >
                      {event.status || event.orderStatus || 'Unknown'}
                    </Badge>

                    {/* Timestamp */}
                    {(event.timestamp || event.createdAt || event.date) && (
                      <HStack spacing={1} mt={1}>
                        <Icon as={FaClock} boxSize={3} color="gray.400" />
                        <Text fontSize="xs" color="gray.600">
                          {formatTimestamp(event.timestamp || event.createdAt || event.date)}
                        </Text>
                      </HStack>
                    )}

                    {/* Employee name */}
                    {(event.employeeName || event.empName || event.empId) && (
                      <HStack spacing={1} mt={1}>
                        <Icon as={FaUserAlt} boxSize={3} color="gray.400" />
                        <Text fontSize="xs" color="gray.600">
                          {event.employeeName || event.empName || event.empId}
                        </Text>
                      </HStack>
                    )}

                    {/* Notes */}
                    {event.notes && (
                      <Text fontSize="xs" color="gray.500" mt={1} fontStyle="italic">
                        {event.notes}
                      </Text>
                    )}
                  </Box>
                </Box>
              ))}
            </VStack>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default MobileOrderHistory;
