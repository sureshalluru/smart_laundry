import React, { useState, useCallback } from 'react';
import {
  Box,
  Heading,
  Text,
  Button,
  VStack,
  HStack,
  Badge,
  SimpleGrid,
  useColorModeValue,
} from '@chakra-ui/react';
import { format } from 'date-fns';
import { getDemoData } from '../demoMockData';
import DemoHint from '../DemoHint';

/**
 * CustomerTrackingView
 *
 * Displays a 6-stage order progress indicator, a timeline of order events
 * with timestamps, estimated delivery time, and a "Simulate Progress" button
 * that advances the current stage and appends a new timeline event.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
const CustomerTrackingView = () => {
  const { order, timeline: initialTimeline, stages } = getDemoData('customerTracking');
  const [currentStage, setCurrentStage] = useState(order.currentStage);
  const [timeline, setTimeline] = useState(initialTimeline);

  const stageBgCompleted = useColorModeValue('blue.500', 'blue.300');
  const stageBgCurrent = useColorModeValue('blue.400', 'blue.200');
  const stageBgPending = useColorModeValue('gray.200', 'gray.600');
  const timelineDotCompleted = useColorModeValue('green.400', 'green.300');
  const timelineDotPending = useColorModeValue('gray.300', 'gray.500');

  const isDelivered = currentStage >= stages.length - 1;

  const handleSimulateProgress = useCallback(() => {
    if (isDelivered) return;

    const nextStage = currentStage + 1;
    setCurrentStage(nextStage);

    const newEvent = {
      stage: stages[nextStage],
      timestamp: new Date(),
      description: `${stages[nextStage]} — simulated progression`,
    };

    setTimeline((prev) => [...prev, newEvent]);
  }, [currentStage, isDelivered, stages]);

  return (
    <Box>
      <Heading size="md" mb={4}>
        Real-Time Order Tracking
      </Heading>

      {/* Order Info & Estimated Delivery */}
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={6}>
        <Box p={4} borderWidth="1px" borderRadius="md" bg={useColorModeValue('white', 'gray.700')}>
          <Text fontSize="sm" fontWeight="bold" color="gray.500" mb={1}>
            Order
          </Text>
          <Text fontWeight="bold" fontSize="lg">
            {order.id}
          </Text>
          <Text fontSize="sm" color="gray.600" mt={1}>
            Customer: {order.customerId}
          </Text>
        </Box>
        <Box p={4} borderWidth="1px" borderRadius="md" bg={useColorModeValue('white', 'gray.700')}>
          <Text fontSize="sm" fontWeight="bold" color="gray.500" mb={1}>
            Estimated Delivery
          </Text>
          <Text fontWeight="bold" fontSize="lg">
            {order.estimatedDelivery}
          </Text>
          <Badge
            mt={2}
            colorScheme={isDelivered ? 'green' : 'blue'}
            fontSize="xs"
          >
            {isDelivered ? 'Delivered' : `Stage ${currentStage + 1} of ${stages.length}`}
          </Badge>
        </Box>
      </SimpleGrid>

      {/* Progress Indicator — Horizontal Stepper */}
      <Box mb={6}>
        <Text fontWeight="bold" fontSize="sm" mb={3}>
          Progress
        </Text>
        <Box overflowX="auto" pb={2}>
          <HStack spacing={0} minW="600px" align="center">
            {stages.map((stage, idx) => {
              const isCompleted = idx < currentStage;
              const isCurrent = idx === currentStage;
              const isPending = idx > currentStage;

              let dotBg = stageBgPending;
              if (isCompleted) dotBg = stageBgCompleted;
              if (isCurrent) dotBg = stageBgCurrent;

              return (
                <React.Fragment key={stage}>
                  <VStack spacing={1} flex="1" minW="0">
                    <Box
                      w={isCurrent ? 7 : 5}
                      h={isCurrent ? 7 : 5}
                      borderRadius="full"
                      bg={dotBg}
                      border={isCurrent ? '3px solid' : 'none'}
                      borderColor="blue.200"
                      transition="all 0.2s"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                    >
                      {isCompleted && (
                        <Text fontSize="xs" color="white" fontWeight="bold">
                          ✓
                        </Text>
                      )}
                    </Box>
                    <Text
                      fontSize="xs"
                      fontWeight={isCurrent ? 'bold' : 'normal'}
                      color={isPending ? 'gray.400' : 'gray.700'}
                      textAlign="center"
                      noOfLines={2}
                    >
                      {stage}
                    </Text>
                  </VStack>
                  {idx < stages.length - 1 && (
                    <Box
                      flex="0.5"
                      h="2px"
                      bg={idx < currentStage ? stageBgCompleted : stageBgPending}
                      mt="-18px"
                    />
                  )}
                </React.Fragment>
              );
            })}
          </HStack>
        </Box>
      </Box>

      {/* Simulate Progress Button */}
      <Box mb={6}>
        <Button
          colorScheme="blue"
          size="sm"
          onClick={handleSimulateProgress}
          isDisabled={isDelivered}
          aria-label="Simulate progress"
        >
          {isDelivered ? 'Order Delivered' : 'Simulate Progress'}
        </Button>
        <DemoHint text="👆 Click to advance stage" show={!isDelivered} />
        {isDelivered && (
          <Text fontSize="xs" color="green.500" mt={1}>
            All stages complete — order has been delivered.
          </Text>
        )}
      </Box>

      {/* Timeline */}
      <Box>
        <Text fontWeight="bold" fontSize="sm" mb={3}>
          Order Timeline
        </Text>
        <VStack align="stretch" spacing={0}>
          {[...timeline].reverse().map((event, idx) => {
            const isFirst = idx === 0;
            return (
              <HStack
                key={`${event.stage}-${idx}`}
                spacing={3}
                py={3}
                borderBottom="1px solid"
                borderColor="gray.100"
                align="flex-start"
              >
                <VStack spacing={0} align="center" minW="12px">
                  <Box
                    w={3}
                    h={3}
                    borderRadius="full"
                    bg={isFirst ? timelineDotCompleted : timelineDotPending}
                    mt={1}
                  />
                  {idx < timeline.length - 1 && (
                    <Box w="2px" h="30px" bg="gray.200" />
                  )}
                </VStack>
                <Box flex="1">
                  <HStack justify="space-between" align="flex-start">
                    <Text fontWeight="medium" fontSize="sm">
                      {event.stage}
                    </Text>
                    <Text fontSize="xs" color="gray.500" whiteSpace="nowrap">
                      {formatTimestamp(event.timestamp)}
                    </Text>
                  </HStack>
                  <Text fontSize="xs" color="gray.600" mt={0.5}>
                    {event.description}
                  </Text>
                </Box>
              </HStack>
            );
          })}
        </VStack>
      </Box>

      {/* Noscript block for SEO/crawlers */}
      <noscript>
        <section>
          <h2>Real-Time Order Tracking</h2>
          <p>
            Smart Laundry Basket provides real-time order tracking through a 6-stage workflow:
            Order Placed, Picked Up, Processing, Ready, Out for Delivery, and Delivered.
            Customers can follow their laundry order progress with timestamped events and
            estimated delivery times. The interactive demo lets you simulate stage progression
            to see how the tracking experience works.
          </p>
          <ul>
            <li>6-stage progress indicator with visual status for each stage</li>
            <li>Chronological timeline of order events with timestamps</li>
            <li>Estimated delivery time display</li>
            <li>Real-time status updates as your order moves through each stage</li>
            <li>Complete order history from placement to delivery</li>
          </ul>
        </section>
      </noscript>
    </Box>
  );
};

/**
 * Formats a timestamp for display.
 * @param {Date|string|number} timestamp
 * @returns {string}
 */
function formatTimestamp(timestamp) {
  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return format(date, 'MMM d, h:mm a');
  } catch {
    return '';
  }
}

export default CustomerTrackingView;
