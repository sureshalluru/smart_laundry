import { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Divider,
  Image,
  SimpleGrid,
  Alert,
  AlertIcon,
  Collapse,
  Button,
  Tooltip,
} from '@chakra-ui/react';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * ItemTrackingResults — Displays the intake or fold item counts on the POS.
 * Shows item counts AND the uploaded photos.
 * Shown after the mobile upload flow is confirmed.
 * Also shows customer feedback/discrepancy indicators if present.
 */
function ItemTrackingResults({ record, phase, orderId, laundryId }) {
  const [feedback, setFeedback] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    if (orderId && laundryId) {
      fetchFeedback();
    }
  }, [orderId, laundryId]);

  const fetchFeedback = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/item-tracking/feedback?laundryId=${laundryId}&orderId=${orderId}`
      );
      if (res.ok) {
        const data = await res.json();
        // Filter to the current phase
        const phaseFeedback = data.filter((f) => f.phase === phase);
        if (phaseFeedback.length > 0) {
          setFeedback(phaseFeedback[0]);
        }
      }
    } catch (e) {
      // Non-critical — don't break the UI
    }
  };

  if (!record) return null;

  const items = record.items || [];
  const photos = record.photoUrls || [];
  const confirmedAt = record.confirmedAt
    ? new Date(record.confirmedAt).toLocaleString()
    : null;

  return (
    <Box p={3} borderWidth="1px" borderRadius="md" bg="white">
      <VStack spacing={2} align="stretch">
        <HStack justify="space-between">
          <HStack>
            <Badge colorScheme={phase === 'intake' ? 'blue' : 'green'} fontSize="xs">
              {phase === 'intake' ? 'INTAKE' : 'FOLD'}
            </Badge>
            <Text fontSize="sm" fontWeight="bold">
              {phase === 'intake' ? 'Items Received' : 'Items Folded'}
            </Text>
          </HStack>
          {confirmedAt && (
            <Text fontSize="xs" color="gray.500">{confirmedAt}</Text>
          )}
        </HStack>

        <Divider />

        {/* Photos */}
        {photos.length > 0 && (
          <Box>
            <Text fontSize="xs" fontWeight="semibold" color="gray.600" mb={1}>Photos:</Text>
            <SimpleGrid columns={{ base: 2, md: 3 }} spacing={2}>
              {photos.map((url, i) => (
                <Image
                  key={i}
                  src={url}
                  borderRadius="md"
                  h="80px"
                  w="full"
                  objectFit="cover"
                  cursor="pointer"
                  onClick={() => window.open(url, '_blank')}
                  alt={`${phase} photo ${i + 1}`}
                />
              ))}
            </SimpleGrid>
          </Box>
        )}

        {/* Item counts table */}
        <Table size="sm" variant="simple">
          <Thead>
            <Tr>
              <Th px={2} py={1}>Item</Th>
              <Th px={2} py={1} isNumeric>Count</Th>
            </Tr>
          </Thead>
          <Tbody>
            {items.map((item, i) => (
              <Tr key={i}>
                <Td px={2} py={1} fontSize="sm">{item.category}</Td>
                <Td px={2} py={1} fontSize="sm" isNumeric fontWeight="bold">{item.count}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>

        {record.employeeId && (
          <Text fontSize="xs" color="gray.400">
            Recorded by: {record.employeeId}
          </Text>
        )}

        {/* Customer Feedback Indicator */}
        {feedback && (
          <Box mt={2}>
            <Alert status="warning" borderRadius="md" py={2} px={3}>
              <AlertIcon boxSize="16px" />
              <Box flex="1">
                <HStack justify="space-between" w="full">
                  <Tooltip label="Customer reported a count discrepancy">
                    <Text fontSize="xs" fontWeight="bold" color="orange.700">
                      ⚠ Customer reported discrepancy
                    </Text>
                  </Tooltip>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setShowFeedback(!showFeedback)}
                  >
                    {showFeedback ? 'Hide' : 'Details'}
                  </Button>
                </HStack>
                <Collapse in={showFeedback}>
                  <Box mt={2} p={2} bg="orange.50" borderRadius="sm">
                    <Text fontSize="xs" fontWeight="semibold" mb={1}>
                      Customer says:
                    </Text>
                    {(feedback.customerCounts || []).map((item, i) => (
                      <HStack key={i} justify="space-between" fontSize="xs">
                        <Text>{item.category}</Text>
                        <Text fontWeight="bold">{item.count}</Text>
                      </HStack>
                    ))}
                    <Divider my={1} />
                    <Text fontSize="xs" fontWeight="semibold" mb={1}>
                      AI counted:
                    </Text>
                    {(feedback.aiCounts || []).map((item, i) => (
                      <HStack key={i} justify="space-between" fontSize="xs">
                        <Text>{item.category}</Text>
                        <Text fontWeight="bold">{item.count}</Text>
                      </HStack>
                    ))}
                    {feedback.comment && (
                      <>
                        <Divider my={1} />
                        <Text fontSize="xs" color="gray.600" fontStyle="italic">
                          "{feedback.comment}"
                        </Text>
                      </>
                    )}
                    <Badge mt={1} size="sm" colorScheme={
                      feedback.status === 'resolved' ? 'green' :
                      feedback.status === 'reviewed' ? 'blue' : 'orange'
                    }>
                      {feedback.status}
                    </Badge>
                  </Box>
                </Collapse>
              </Box>
            </Alert>
          </Box>
        )}
      </VStack>
    </Box>
  );
}

export default ItemTrackingResults;
