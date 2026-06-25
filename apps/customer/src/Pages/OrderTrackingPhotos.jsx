import { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Heading,
  Image,
  Badge,
  Spinner,
  Divider,
  Alert,
  AlertIcon,
  Button,
  Input,
  Textarea,
  useToast,
  Flex,
} from '@chakra-ui/react';
import { useParams, useSearchParams } from 'react-router-dom';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Format a date string into a friendlier format like "Jun 24, 2:30 PM"
 */
function formatFriendlyDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }) + ', ' + d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * StatusTimeline — horizontal stepper showing order progress.
 */
function StatusTimeline({ hasIntake, hasFold }) {
  const steps = [
    { label: 'Received', complete: hasIntake },
    { label: 'Processing', complete: hasIntake && !hasFold, active: hasIntake && !hasFold },
    { label: 'Ready', complete: hasFold },
  ];

  return (
    <Flex align="center" justify="center" w="100%" px={2} py={3}>
      {steps.map((step, i) => (
        <Flex key={i} align="center" flex={i < steps.length - 1 ? 1 : 'none'}>
          {/* Step circle */}
          <VStack spacing={1}>
            <Flex
              w="32px"
              h="32px"
              borderRadius="full"
              align="center"
              justify="center"
              bg={step.complete ? 'blue.500' : 'transparent'}
              border={step.active ? '3px solid' : step.complete ? 'none' : '2px solid'}
              borderColor={step.active ? 'blue.400' : step.complete ? 'blue.500' : 'gray.300'}
              color={step.complete ? 'white' : 'gray.400'}
              fontSize="sm"
              fontWeight="bold"
              animation={step.active ? 'pulse 2s infinite' : undefined}
              sx={step.active ? {
                '@keyframes pulse': {
                  '0%, 100%': { boxShadow: '0 0 0 0 rgba(66, 153, 225, 0.4)' },
                  '50%': { boxShadow: '0 0 0 8px rgba(66, 153, 225, 0)' },
                },
              } : undefined}
            >
              {step.complete ? '✓' : (i + 1)}
            </Flex>
            <Text fontSize="xs" color={step.complete || step.active ? 'blue.600' : 'gray.400'} fontWeight={step.complete || step.active ? '600' : '400'}>
              {step.label}
            </Text>
          </VStack>

          {/* Connecting line */}
          {i < steps.length - 1 && (
            <Box
              flex={1}
              h="3px"
              bg={steps[i + 1].complete || steps[i + 1].active ? 'blue.300' : 'gray.200'}
              mx={2}
              borderRadius="full"
              mt="-18px"
            />
          )}
        </Flex>
      ))}
    </Flex>
  );
}

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
  const [shopInfo, setShopInfo] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCounts, setFeedbackCounts] = useState([]);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackPhase, setFeedbackPhase] = useState('intake');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchTracking();
    fetchShopInfo();
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

  const fetchShopInfo = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/laundry/get-info?operation=getLaundryInfo&laundryId=${laundryId}&isCustomer=true`
      );
      if (!res.ok) return;
      const result = await res.json();
      if (result.status === 'success') {
        setShopInfo({ name: result.laundryName, logo: result.laundryLogo });
      }
    } catch (e) {
      // Graceful degradation — skip branding if fetch fails
    }
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
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" p={4}
        bgGradient="linear(to-b, blue.50, gray.50)">
        <VStack spacing={4}>
          <Spinner size="xl" color="blue.500" />
          <Text>Loading your order details...</Text>
        </VStack>
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" p={4}
        bgGradient="linear(to-b, blue.50, gray.50)">
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
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" p={4}
        bgGradient="linear(to-b, blue.50, gray.50)">
        <VStack spacing={3} textAlign="center">
          <Text fontSize="2xl">📋</Text>
          <Text>No item tracking recorded for this order yet.</Text>
        </VStack>
      </Box>
    );
  }

  const intakeTotal = hasIntake ? data.intakeItems.reduce((sum, i) => sum + (i.count || 0), 0) : 0;
  const foldTotal = hasFold ? data.foldItems.reduce((sum, i) => sum + (i.count || 0), 0) : 0;

  return (
    <Box minH="100vh" bgGradient="linear(to-b, blue.50, white, gray.50)" p={4} maxW="600px" mx="auto">
      <VStack spacing={5} align="stretch">

        {/* Shop Branding Header */}
        {shopInfo && (
          <Flex
            align="center"
            justify="center"
            gap={3}
            py={3}
            px={4}
            bg="white"
            borderRadius="lg"
            boxShadow="sm"
          >
            {shopInfo.logo && (
              <Image
                src={shopInfo.logo}
                alt={shopInfo.name}
                h="36px"
                w="36px"
                objectFit="contain"
                borderRadius="md"
              />
            )}
            <Text fontSize="md" fontWeight="600" color="gray.700">
              {shopInfo.name}
            </Text>
          </Flex>
        )}

        {/* Order Heading */}
        <Box textAlign="center" pt={2}>
          <Heading size="md">
            Order{' '}
            <Box as="span" color="blue.500">#{orderId}</Box>
          </Heading>
          <Text fontSize="sm" color="gray.500">Item Tracking Details</Text>
        </Box>

        {/* Status Timeline */}
        <Box bg="white" borderRadius="lg" boxShadow="sm" px={4} py={3}>
          <StatusTimeline hasIntake={hasIntake} hasFold={hasFold} />
        </Box>

        {/* Items Count Summary */}
        <Flex justify="center" gap={2} flexWrap="wrap">
          {hasIntake && (
            <Badge colorScheme="blue" px={3} py={1} borderRadius="full" fontSize="xs">
              {intakeTotal} item{intakeTotal !== 1 ? 's' : ''} received
            </Badge>
          )}
          {hasFold && (
            <Badge colorScheme="green" px={3} py={1} borderRadius="full" fontSize="xs">
              {foldTotal} item{foldTotal !== 1 ? 's' : ''} folded
            </Badge>
          )}
        </Flex>

        {/* Order Details & Payment */}
        {data.orderStatus && (
          <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
            <VStack spacing={3} align="stretch">
              <HStack justify="space-between">
                <Text fontWeight="bold" fontSize="sm">Order Details</Text>
                <Badge colorScheme={data.paymentStatus === 'Paid' ? 'green' : 'orange'} fontSize="xs">
                  {data.paymentStatus || 'Unpaid'}
                </Badge>
              </HStack>

              <Divider />

              {/* Dates */}
              <HStack justify="space-between" fontSize="xs" color="gray.600">
                {data.pickupDate && <Text>Pickup: {data.pickupDate}</Text>}
                {data.dropoffDate && <Text>Due: {data.dropoffDate}</Text>}
              </HStack>

              {/* Services */}
              {data.services && data.services.length > 0 && (
                <VStack spacing={1} align="stretch">
                  {data.services.map((svc, i) => (
                    <HStack key={i} justify="space-between" fontSize="sm">
                      <Text>{svc.service || svc.productName}</Text>
                      <Text fontWeight="600">${svc.servicePrice || svc.productPrice || '0'}</Text>
                    </HStack>
                  ))}
                </VStack>
              )}

              {/* Total */}
              {data.grandTotal && (
                <HStack justify="space-between" pt={1} borderTop="1px solid" borderColor="gray.100">
                  <Text fontWeight="bold" fontSize="sm">Total</Text>
                  <Text fontWeight="bold" fontSize="sm">${data.grandTotal}</Text>
                </HStack>
              )}

              {/* Pay Now button if unpaid */}
              {data.paymentStatus !== 'Paid' && data.paymentLink && data.balanceDue && parseFloat(data.balanceDue) > 0 && (
                <Box bg="orange.50" p={3} borderRadius="md" border="1px solid" borderColor="orange.200" mt={2}>
                  <VStack spacing={2}>
                    <Text fontSize="sm" color="orange.700" fontWeight="600">
                      Balance Due: ${data.balanceDue}
                    </Text>
                    <Button
                      as="a"
                      href={data.paymentLink}
                      colorScheme="orange"
                      size="md"
                      w="full"
                      borderRadius="full"
                    >
                      💳 Pay Now
                    </Button>
                  </VStack>
                </Box>
              )}

              {/* Paid confirmation */}
              {data.paymentStatus === 'Paid' && (
                <HStack justify="center" bg="green.50" p={2} borderRadius="md">
                  <Text fontSize="sm" color="green.600" fontWeight="600">✓ Payment Complete</Text>
                </HStack>
              )}
            </VStack>
          </Box>
        )}

        {/* Intake Section */}
        {hasIntake && (
          <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
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
                  Counted: {formatFriendlyDate(data.intakeConfirmedAt)}
                </Text>
              )}
            </VStack>
          </Box>
        )}

        {/* Fold Section */}
        {hasFold && (
          <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
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
                  Completed: {formatFriendlyDate(data.foldConfirmedAt)}
                </Text>
              )}
            </VStack>
          </Box>
        )}

        {/* Report Issue / Customer Feedback Section */}
        {!submitted ? (
          <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
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
          <Box bg="green.50" p={4} borderRadius="lg">
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
