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
  Progress,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useColorModeValue,
} from '@chakra-ui/react';
import { format } from 'date-fns';
import { getDemoData } from '../demoMockData';
import DemoHint from '../DemoHint';

/**
 * AITrackingView
 *
 * Displays AI-powered garment tracking workflow: photo intake, item recognition,
 * fold reconciliation, lifecycle timeline, and discrepancy alerts.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
const AITrackingView = () => {
  const { intakePhotos, recognitionResults, reconciliation } = getDemoData('aiTracking');

  // Scan simulation state
  const [scanStep, setScanStep] = useState(null); // null | 'capturing' | 'detecting' | 'confirmed'
  const [scanComplete, setScanComplete] = useState(false);

  const cardBg = useColorModeValue('white', 'gray.700');
  const photoBg = useColorModeValue('gray.100', 'gray.600');
  const timelineActiveBg = useColorModeValue('blue.500', 'blue.300');
  const timelinePendingBg = useColorModeValue('gray.200', 'gray.600');
  const timelineCurrentBg = useColorModeValue('blue.400', 'blue.200');

  // Lifecycle stages
  const lifecycleStages = [
    'Intake Photos',
    'AI Count',
    'Processing',
    'Fold Verification',
    'Ready',
  ];
  const currentLifecycleStage = scanComplete ? 4 : 3; // After scan, all stages complete

  // Simulate Scan handler — multi-step animation
  const handleSimulateScan = useCallback(() => {
    setScanStep('capturing');
    setTimeout(() => {
      setScanStep('detecting');
      setTimeout(() => {
        setScanStep('confirmed');
        setScanComplete(true);
      }, 1200);
    }, 1200);
  }, []);

  return (
    <Box>
      <Heading size="md" mb={4}>
        AI Garment Tracking
      </Heading>

      {/* Lifecycle Timeline */}
      <Box mb={6}>
        <Text fontWeight="bold" fontSize="sm" mb={3}>
          Tracking Lifecycle
        </Text>
        <Box overflowX="auto" pb={2}>
          <HStack spacing={0} minW="500px" align="center">
            {lifecycleStages.map((stage, idx) => {
              const isCompleted = idx < currentLifecycleStage;
              const isCurrent = idx === currentLifecycleStage;

              let dotBg = timelinePendingBg;
              if (isCompleted) dotBg = timelineActiveBg;
              if (isCurrent) dotBg = timelineCurrentBg;

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
                      color={isCurrent || isCompleted ? 'gray.700' : 'gray.400'}
                      textAlign="center"
                      noOfLines={2}
                    >
                      {stage}
                    </Text>
                  </VStack>
                  {idx < lifecycleStages.length - 1 && (
                    <Box
                      flex="0.5"
                      h="2px"
                      bg={idx < currentLifecycleStage ? timelineActiveBg : timelinePendingBg}
                      mt="-18px"
                    />
                  )}
                </React.Fragment>
              );
            })}
          </HStack>
        </Box>
      </Box>

      {/* Photo Intake Section */}
      <Box mb={6}>
        <Text fontWeight="bold" fontSize="sm" mb={3}>
          Photo Intake
        </Text>
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
          {intakePhotos.map((photo) => (
            <Box
              key={photo.id}
              p={4}
              borderWidth="1px"
              borderRadius="md"
              bg={cardBg}
            >
              {/* Placeholder garment image */}
              <Box
                bg={photoBg}
                borderRadius="md"
                h="100px"
                display="flex"
                alignItems="center"
                justifyContent="center"
                mb={3}
              >
                <Text fontSize="2xl" role="img" aria-label="Camera">
                  📷
                </Text>
              </Box>
              <Text fontWeight="medium" fontSize="sm">
                {photo.label}
              </Text>
              <HStack justify="space-between" mt={1}>
                <Text fontSize="xs" color="gray.500">
                  {formatTimestamp(photo.timestamp)}
                </Text>
                <Badge
                  colorScheme={photo.status === 'processed' ? 'green' : 'yellow'}
                  fontSize="xs"
                >
                  {photo.status}
                </Badge>
              </HStack>
            </Box>
          ))}
        </SimpleGrid>
      </Box>

      {/* AI Recognition Results */}
      <Box mb={6}>
        <Text fontWeight="bold" fontSize="sm" mb={3}>
          AI Recognition Results
        </Text>
        <Box borderWidth="1px" borderRadius="md" overflow="hidden">
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>Category</Th>
                <Th isNumeric>Count</Th>
                <Th>Confidence</Th>
              </Tr>
            </Thead>
            <Tbody>
              {recognitionResults.map((result) => (
                <Tr key={result.category}>
                  <Td>
                    <Text fontWeight="medium" textTransform="capitalize">
                      {result.category}
                    </Text>
                  </Td>
                  <Td isNumeric>{result.count}</Td>
                  <Td>
                    <HStack spacing={2}>
                      <Progress
                        value={result.confidence * 100}
                        size="sm"
                        flex="1"
                        colorScheme={
                          result.confidence >= 0.9
                            ? 'green'
                            : result.confidence >= 0.8
                            ? 'yellow'
                            : 'red'
                        }
                        borderRadius="full"
                      />
                      <Text fontSize="xs" minW="40px" textAlign="right">
                        {Math.round(result.confidence * 100)}%
                      </Text>
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      </Box>

      {/* Fold Reconciliation */}
      <Box mb={6}>
        <Text fontWeight="bold" fontSize="sm" mb={3}>
          Fold Reconciliation
        </Text>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <Box
            p={4}
            borderWidth="1px"
            borderRadius="md"
            bg={cardBg}
            textAlign="center"
          >
            <Text fontSize="sm" color="gray.500" mb={1}>
              Intake Count
            </Text>
            <Text fontSize="2xl" fontWeight="bold">
              {reconciliation.intakeCount}
            </Text>
            <Text fontSize="xs" color="gray.500">
              items detected at intake
            </Text>
          </Box>
          <Box
            p={4}
            borderWidth="1px"
            borderRadius="md"
            bg={cardBg}
            textAlign="center"
          >
            <Text fontSize="sm" color="gray.500" mb={1}>
              Fold Count
            </Text>
            <Text fontSize="2xl" fontWeight="bold" color={reconciliation.hasDiscrepancy ? 'red.500' : 'green.500'}>
              {reconciliation.foldCount}
            </Text>
            <Text fontSize="xs" color="gray.500">
              items counted after fold
            </Text>
          </Box>
        </SimpleGrid>

        {/* Discrepancy Alert */}
        {reconciliation.hasDiscrepancy && (
          <Alert status="warning" mt={4} borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="sm">Discrepancy Detected</AlertTitle>
              <AlertDescription fontSize="xs">
                {reconciliation.discrepancyItems.map((item, idx) => (
                  <Text key={idx}>{item}</Text>
                ))}
              </AlertDescription>
            </Box>
          </Alert>
        )}
      </Box>

      {/* Simulate Scan Button */}
      <Box mb={6}>
        <Button
          colorScheme="blue"
          size="sm"
          onClick={handleSimulateScan}
          isDisabled={scanStep !== null}
          aria-label="Simulate Scan"
        >
          {scanStep === null ? 'Simulate Scan' : 'Scanning...'}
        </Button>
        <DemoHint text="👆 Click to see AI in action" show={scanStep === null} />

        {/* Scan step animation */}
        {scanStep && (
          <Box mt={3} p={3} borderWidth="1px" borderRadius="md" bg={cardBg}>
            <VStack align="stretch" spacing={2}>
              <HStack>
                <Box
                  w={3}
                  h={3}
                  borderRadius="full"
                  bg={scanStep === 'capturing' || scanStep === 'detecting' || scanStep === 'confirmed' ? 'green.400' : 'gray.300'}
                />
                <Text
                  fontSize="sm"
                  fontWeight={scanStep === 'capturing' ? 'bold' : 'normal'}
                >
                  Capturing photo...
                </Text>
                {(scanStep === 'detecting' || scanStep === 'confirmed') && (
                  <Badge colorScheme="green" fontSize="xs">Done</Badge>
                )}
              </HStack>
              <HStack>
                <Box
                  w={3}
                  h={3}
                  borderRadius="full"
                  bg={scanStep === 'detecting' || scanStep === 'confirmed' ? 'green.400' : 'gray.300'}
                />
                <Text
                  fontSize="sm"
                  fontWeight={scanStep === 'detecting' ? 'bold' : 'normal'}
                >
                  Detecting items...
                </Text>
                {scanStep === 'confirmed' && (
                  <Badge colorScheme="green" fontSize="xs">Done</Badge>
                )}
              </HStack>
              <HStack>
                <Box
                  w={3}
                  h={3}
                  borderRadius="full"
                  bg={scanStep === 'confirmed' ? 'green.400' : 'gray.300'}
                />
                <Text
                  fontSize="sm"
                  fontWeight={scanStep === 'confirmed' ? 'bold' : 'normal'}
                >
                  Count confirmed!
                </Text>
                {scanStep === 'confirmed' && (
                  <Badge colorScheme="green" fontSize="xs">✓</Badge>
                )}
              </HStack>
            </VStack>
          </Box>
        )}
      </Box>

      {/* Noscript block for SEO/crawlers */}
      <noscript>
        <section>
          <h2>AI Garment Tracking</h2>
          <p>
            Smart Laundry Basket uses AI-powered garment tracking to protect businesses
            and build customer trust. The system photographs garments at intake, uses
            computer vision to identify and count items, and then reconciles the fold
            count against the intake count to flag any discrepancies automatically.
          </p>
          <ul>
            <li>Automated photo intake workflow for documenting garments</li>
            <li>AI-powered item recognition with category detection and confidence scores</li>
            <li>Fold reconciliation comparing intake count vs fold count</li>
            <li>Automatic discrepancy alerts when counts do not match</li>
            <li>Full lifecycle tracking: Intake → AI Count → Processing → Fold Verification → Ready</li>
            <li>Protects against lost item disputes with documented evidence</li>
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

export default AITrackingView;
