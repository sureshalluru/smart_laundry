import React, { useState } from 'react';
import axios from 'axios';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  useToast,
  Spinner,
  Icon,
} from '@chakra-ui/react';
import { FaExchangeAlt } from 'react-icons/fa';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

/**
 * Map of valid status transitions.
 * Each key is a current status and the value is an array of valid next statuses.
 */
export const STATUS_TRANSITIONS = {
  'OrderSubmitted': ['ReadyForIntake'],
  'ReadyForIntake': ['ReceivedAtFacility'],
  'ReceivedAtFacility': ['ProcessingStarted', 'Processing'],
  'ProcessingStarted': ['ProcessingCompleted'],
  'Processing': ['ProcessingCompleted'],
  'ProcessingCompleted': ['ReadyForDelivery', 'EnRouteToDelivery'],
  'ReadyForDelivery': ['EnRouteToDelivery'],
  'EnRouteToDelivery': ['Delivered'],
};

/** Terminal statuses that have no further transitions */
const TERMINAL_STATUSES = ['Delivered', 'OrderCanceled'];

/**
 * Returns valid next statuses for the given current status.
 * Returns an empty array for terminal or unknown statuses.
 * @param {string} currentStatus - The current order status
 * @returns {string[]} Array of valid next statuses
 */
export function getValidNextStatuses(currentStatus) {
  if (!currentStatus || TERMINAL_STATUSES.includes(currentStatus)) {
    return [];
  }
  if (!Object.prototype.hasOwnProperty.call(STATUS_TRANSITIONS, currentStatus)) {
    return [];
  }
  return STATUS_TRANSITIONS[currentStatus];
}

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
 * Returns a human-readable label for a status value.
 */
function getStatusLabel(status) {
  const labels = {
    OrderSubmitted: 'Order Submitted',
    ReadyForIntake: 'Ready for Intake',
    ReceivedAtFacility: 'Received at Facility',
    Processing: 'Processing',
    ProcessingStarted: 'Processing Started',
    ProcessingCompleted: 'Processing Completed',
    ReadyForDelivery: 'Ready for Delivery',
    EnRouteToDelivery: 'En Route to Delivery',
    Delivered: 'Delivered',
    OrderCanceled: 'Order Canceled',
  };
  return labels[status] || status;
}

/**
 * MobileStatusTransition — displays current status and valid next-status transitions
 * with confirmation modal before applying changes.
 *
 * Props:
 * - order: { orderId, orderStatus, laundryId }
 * - onStatusChanged: (newStatus) => void — callback when status is successfully updated
 * - employeeId: string — the current employee's ID for recording the change
 */
const MobileStatusTransition = ({ order, onStatusChanged, employeeId }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  const [selectedStatus, setSelectedStatus] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const currentStatus = order?.orderStatus;
  const validNextStatuses = getValidNextStatuses(currentStatus);
  const isTerminal = TERMINAL_STATUSES.includes(currentStatus);

  const handleStatusSelect = (status) => {
    setSelectedStatus(status);
    onOpen();
  };

  const handleConfirm = async () => {
    if (!selectedStatus || !order) return;

    setIsUpdating(true);
    try {
      const authToken = localStorage.getItem('idToken');
      const response = await axios.put(
        `${API_URL}/api/admin/update-order`,
        { orderStatus: selectedStatus },
        {
          params: {
            operation: 'updateOrder',
            orderId: order.orderId,
            laundryId: order.laundryId,
            empId: employeeId || '',
          },
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      const statusCode = response.data?.statusCode;
      const serverOrder = response.data?.body;

      if (statusCode === 200) {
        // Check for conflict: if the server returned a different status than what we expected
        if (serverOrder && serverOrder.orderStatus && serverOrder.orderStatus !== selectedStatus) {
          toast({
            title: 'Status Conflict',
            description: 'Order status was already updated by another employee. Refreshing...',
            status: 'warning',
            duration: 4000,
            isClosable: true,
          });
          // Notify parent with the actual server status
          if (onStatusChanged) {
            onStatusChanged(serverOrder.orderStatus);
          }
        } else {
          toast({
            title: 'Status Updated',
            description: `Order moved to ${getStatusLabel(selectedStatus)}`,
            status: 'success',
            duration: 3000,
            isClosable: true,
          });
          if (onStatusChanged) {
            onStatusChanged(selectedStatus);
          }
        }
      } else if (statusCode === 400) {
        // Payment gate or validation error — revert status
        const errorMsg = serverOrder?.message || 'Status transition blocked.';
        const isPaymentError = errorMsg.toLowerCase().includes('payment');
        toast({
          title: isPaymentError ? 'Payment Required' : 'Status Change Blocked',
          description: errorMsg,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        // Revert to current status (no change applied)
        if (onStatusChanged) {
          onStatusChanged(currentStatus);
        }
      } else if (statusCode === 409) {
        // Conflict — status was changed by another user
        const actualStatus = serverOrder?.orderStatus || currentStatus;
        toast({
          title: 'Status Conflict',
          description: 'Order status was already updated by another employee. Refreshing...',
          status: 'warning',
          duration: 4000,
          isClosable: true,
        });
        if (onStatusChanged) {
          onStatusChanged(actualStatus);
        }
      } else {
        toast({
          title: 'Update Failed',
          description: 'Failed to update order status. Please try again.',
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
      }
    } catch (err) {
      // Check if the error response indicates a payment gate block
      if (err.response?.status === 400 || err.response?.data?.statusCode === 400) {
        const errBody = err.response?.data?.body || err.response?.data || {};
        const errorMsg = errBody?.message || 'Status transition blocked.';
        const isPaymentError = errorMsg.toLowerCase().includes('payment');
        toast({
          title: isPaymentError ? 'Payment Required' : 'Status Change Blocked',
          description: errorMsg,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        // Revert to current status
        if (onStatusChanged) {
          onStatusChanged(currentStatus);
        }
      } else if (err.response?.status === 409 || err.response?.data?.statusCode === 409) {
        // Check if the error response indicates a conflict
        const serverOrder = err.response?.data?.body;
        const actualStatus = serverOrder?.orderStatus || currentStatus;
        toast({
          title: 'Status Conflict',
          description: 'Order status was already updated by another employee. Refreshing...',
          status: 'warning',
          duration: 4000,
          isClosable: true,
        });
        if (onStatusChanged) {
          onStatusChanged(actualStatus);
        }
      } else {
        toast({
          title: 'Error',
          description: 'Failed to update status. Please try again.',
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
      }
    } finally {
      setIsUpdating(false);
      setSelectedStatus(null);
      onClose();
    }
  };

  const handleCancel = () => {
    setSelectedStatus(null);
    onClose();
  };

  return (
    <Box>
      {/* Current Status Display */}
      <VStack spacing={4} align="stretch">
        <HStack spacing={3} align="center">
          <Icon as={FaExchangeAlt} color="purple.500" boxSize={5} />
          <Text fontSize="sm" fontWeight="bold" color="gray.700">
            Current Status
          </Text>
        </HStack>

        <Box textAlign="center" py={2}>
          <Badge
            colorScheme={getStatusColor(currentStatus)}
            fontSize="md"
            px={4}
            py={2}
            borderRadius="md"
          >
            {getStatusLabel(currentStatus)}
          </Badge>
        </Box>

        {/* Terminal state message */}
        {isTerminal && (
          <Box
            bg="gray.100"
            p={3}
            borderRadius="md"
            textAlign="center"
          >
            <Text fontSize="sm" color="gray.600">
              No further transitions available
            </Text>
          </Box>
        )}

        {/* Valid next-status buttons */}
        {!isTerminal && validNextStatuses.length > 0 && (
          <VStack spacing={3} align="stretch">
            <Text fontSize="xs" color="gray.500" fontWeight="medium">
              Move to:
            </Text>
            {validNextStatuses.map((nextStatus) => (
              <Button
                key={nextStatus}
                colorScheme={getStatusColor(nextStatus)}
                variant="solid"
                size="lg"
                minH="44px"
                fontSize="sm"
                fontWeight="medium"
                onClick={() => handleStatusSelect(nextStatus)}
                isDisabled={isUpdating}
                width="100%"
              >
                {getStatusLabel(nextStatus)}
              </Button>
            ))}
          </VStack>
        )}

        {/* Unknown status with no transitions */}
        {!isTerminal && validNextStatuses.length === 0 && (
          <Box
            bg="gray.100"
            p={3}
            borderRadius="md"
            textAlign="center"
          >
            <Text fontSize="sm" color="gray.600">
              No further transitions available
            </Text>
          </Box>
        )}
      </VStack>

      {/* Confirmation Modal */}
      <Modal isOpen={isOpen} onClose={handleCancel} isCentered size="sm">
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader fontSize="md">Confirm Status Change</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={3} align="stretch">
              <Text fontSize="sm" color="gray.600">
                Are you sure you want to change the order status?
              </Text>
              <HStack justify="center" spacing={3} align="center">
                <Badge
                  colorScheme={getStatusColor(currentStatus)}
                  fontSize="xs"
                  px={2}
                  py={1}
                  borderRadius="md"
                >
                  {getStatusLabel(currentStatus)}
                </Badge>
                <Text fontSize="sm" color="gray.500">→</Text>
                <Badge
                  colorScheme={getStatusColor(selectedStatus)}
                  fontSize="xs"
                  px={2}
                  py={1}
                  borderRadius="md"
                >
                  {getStatusLabel(selectedStatus)}
                </Badge>
              </HStack>
              <Text fontSize="xs" color="gray.400" textAlign="center">
                Order: {order?.orderId}
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="ghost"
              mr={3}
              onClick={handleCancel}
              isDisabled={isUpdating}
              size="md"
              minH="44px"
            >
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleConfirm}
              isLoading={isUpdating}
              loadingText="Updating..."
              size="md"
              minH="44px"
            >
              Confirm
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default MobileStatusTransition;
