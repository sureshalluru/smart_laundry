import { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Heading,
  Image,
  SimpleGrid,
  Badge,
  Spinner,
  Divider,
  Alert,
  AlertIcon,
  Button,
  Input,
  Textarea,
  useToast,
} from '@chakra-ui/react';
import { useParams, useSearchParams } from 'react-router-dom';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Customer-facing page to view their order's item tracking photos and counts.
 * Accessed via link in the SMS notification.
 * URL: /order-tracking/:orderId?laundryId=X
 */
function OrderTrackingPhotos() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const laundryId = searchParams.get('laundryId') || '1';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCounts, setFeedbackCounts] = useState([]);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackPhase, setFeedbackPhase] = useState('intake');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchTracking();
  }, [orderId, laundryId]);

  const fetchTracking = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/track/customer/${orderId}?laundryId=${laundryId}`
      );
      if (!res.ok) throw new Error('Could not load tracking info');
      const result = await res.json();
      setData(result);
    } catch (e) {
      setError('Unable to load order tracking details.');
    }
    setLoading(false);
  };

  const handleReportIssue = (phase) => {
    const items = phase === 'intake' ? data.intakeItems : data.foldItems;
    setFeedbackPhase(phase);
    setFeedbackCounts(
      (items || []).map((item) => ({ category: item.category, count: item.count }))
    );
    setShowFeedback(true);
  };

  const handleCountChange = (index, value) => {
    const updated = [...feedbackCounts];
    updated[index] = { ...updated[index], count: parseInt(value) || 0 };
    setFeedbackCounts(updated);
  };

  const handleSubmitFeedback = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/track/customer-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          laundryId,
          phase: feedbackPhase,
          customerCounts: feedbackCounts,
          comment: feedbackComment || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      setSubmitted(true);
      toast({
        title: 'Feedback submitted',
        description: "Thank you! We'll review this.",
        status: 'success',
        duration: 4000,
      });
    } catch (e) {
      toast({
        title: 'Error',
        description: 'Could not submit feedback. Please try again.',
        status: 'error',
        duration: 4000,
      });
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" p={4}>
        <VStack spacing={4}>
          <Spinner size="xl" color="blue.500" />
          <Text>Loading your order details...</Text>
        </VStack>
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" p={4}>
        <Alert status="error" borderRadius="md">
          <AlertIcon />
          <Text>{error || 'Order not found'}</Text>
        </Alert>
      </Box>
    );
  }

  const hasIntake = data.intakeItems && data.intakeItems.length > 0;
  const hasFold = data.foldItems && data.foldItems.length > 0;

  if (!hasIntake && !hasFold) {
    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" p={4}>
        <VStack spacing={3} textAlign="center">
          <Text fontSize="2xl">📋</Text>
          <Text>No item tracking recorded for this order yet.</Text>
        </VStack>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg="gray.50" p={4} maxW="600px" mx="auto">
      <VStack spacing={5} align="stretch">
        <Box textAlign="center" pt={2}>
          <Heading size="md">Order {orderId}</Heading>
          <Text fontSize="sm" color="gray.500">Item Tracking Details</Text>
        </Box>

        {/* Intake Section */}
        {hasIntake && (
          <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
            <VStack spacing={3} align="stretch">
              <Badge colorScheme="blue" alignSelf="start" fontSize="xs">RECEIVED</Badge>

              {data.intakePhotos && data.intakePhotos.length > 0 && (
                <Box>
                  <Image
                    src={data.intakePhotos[2] || data.intakePhotos[0]}
                    borderRadius="md"
                    h="180px"
                    w="full"
                    objectFit="cover"
                    cursor="pointer"
                    onClick={() => window.open(data.intakePhotos[2] || data.intakePhotos[0], '_blank')}
                    alt="Intake photo"
                  />
                </Box>
              )}

              <Divider />

              <VStack spacing={1} align="stretch">
                {data.intakeItems.map((item, i) => (
                  <Box key={i} display="flex" justifyContent="space-between">
                    <Text fontSize="sm">{item.category}</Text>
                    <Text fontSize="sm" fontWeight="bold">{item.count}</Text>
                  </Box>
                ))}
              </VStack>

              {data.intakeConfirmedAt && (
                <Text fontSize="xs" color="gray.400">
                  Counted: {new Date(data.intakeConfirmedAt).toLocaleString()}
                </Text>
              )}
            </VStack>
          </Box>
        )}

        {/* Fold Section */}
        {hasFold && (
          <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
            <VStack spacing={3} align="stretch">
              <Badge colorScheme="green" alignSelf="start" fontSize="xs">FOLDED & READY</Badge>

              {data.foldPhotos && data.foldPhotos.length > 0 && (
                <Box>
                  <Image
                    src={data.foldPhotos[2] || data.foldPhotos[0]}
                    borderRadius="md"
                    h="180px"
                    w="full"
                    objectFit="cover"
                    cursor="pointer"
                    onClick={() => window.open(data.foldPhotos[2] || data.foldPhotos[0], '_blank')}
                    alt="Fold photo"
                  />
                </Box>
              )}

              <Divider />

              <VStack spacing={1} align="stretch">
                {data.foldItems.map((item, i) => (
                  <Box key={i} display="flex" justifyContent="space-between">
                    <Text fontSize="sm">{item.category}</Text>
                    <Text fontSize="sm" fontWeight="bold">{item.count}</Text>
                  </Box>
                ))}
              </VStack>

              {data.foldConfirmedAt && (
                <Text fontSize="xs" color="gray.400">
                  Completed: {new Date(data.foldConfirmedAt).toLocaleString()}
                </Text>
              )}
            </VStack>
          </Box>
        )}

        {/* Report Issue / Customer Feedback Section */}
        {!submitted ? (
          <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
            <VStack spacing={3} align="stretch">
              {!showFeedback ? (
                <VStack spacing={2}>
                  <Text fontSize="sm" color="gray.600" textAlign="center">
                    Something doesn't look right?
                  </Text>
                  <HStack spacing={2} justify="center">
                    {hasIntake && (
                      <Button
                        size="sm"
                        variant="outline"
                        colorScheme="orange"
                        onClick={() => handleReportIssue('intake')}
                      >
                        Report Intake Issue
                      </Button>
                    )}
                    {hasFold && (
                      <Button
                        size="sm"
                        variant="outline"
                        colorScheme="orange"
                        onClick={() => handleReportIssue('fold')}
                      >
                        Report Fold Issue
                      </Button>
                    )}
                  </HStack>
                </VStack>
              ) : (
                <VStack spacing={3} align="stretch">
                  <Text fontSize="sm" fontWeight="bold">
                    Correct the counts ({feedbackPhase === 'intake' ? 'Received' : 'Folded'}):
                  </Text>

                  {feedbackCounts.map((item, i) => (
                    <HStack key={i} justify="space-between">
                      <Text fontSize="sm">{item.category}</Text>
                      <Input
                        size="sm"
                        type="number"
                        w="70px"
                        min={0}
                        value={item.count}
                        onChange={(e) => handleCountChange(i, e.target.value)}
                      />
                    </HStack>
                  ))}

                  <Textarea
                    placeholder="Optional note (e.g. 'I sent 6 shirts not 5')"
                    size="sm"
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                  />

                  <HStack spacing={2}>
                    <Button
                      size="sm"
                      colorScheme="orange"
                      isLoading={submitting}
                      onClick={handleSubmitFeedback}
                    >
                      Submit Feedback
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowFeedback(false)}
                    >
                      Cancel
                    </Button>
                  </HStack>
                </VStack>
              )}
            </VStack>
          </Box>
        ) : (
          <Box bg="green.50" p={4} borderRadius="md">
            <Text fontSize="sm" color="green.700" textAlign="center">
              ✓ Thank you! We'll review this.
            </Text>
          </Box>
        )}

        {/* Close tab button */}
        <Button
          variant="ghost"
          colorScheme="gray"
          size="sm"
          w="full"
          onClick={() => { try { window.close(); } catch (e) { /* ignore */ } }}
        >
          ✕ Close This Tab
        </Button>
      </VStack>
    </Box>
  );
}

export default OrderTrackingPhotos;
