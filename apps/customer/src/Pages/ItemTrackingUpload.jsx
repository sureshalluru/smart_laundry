import { useState, useEffect, useRef } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Heading,
  Badge,
  Image,
  SimpleGrid,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Spinner,
  IconButton,
  useToast,
  Progress,
  Divider,
  Card,
  CardBody,
} from '@chakra-ui/react';
import { useParams } from 'react-router-dom';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Mobile Upload Page for Item Tracking.
 * Accessed via QR code scan — no login required (token-based auth).
 * Employee takes 2-3 angle photos of laundry items on a table,
 * Claude Vision identifies and counts items automatically.
 */
function ItemTrackingUpload() {
  const { token } = useParams();
  const toast = useToast();
  const fileInputRef = useRef(null);

  // Token validation state
  const [tokenData, setTokenData] = useState(null);
  const [tokenError, setTokenError] = useState(null);
  const [validating, setValidating] = useState(true);

  // Photo capture state
  const [photos, setPhotos] = useState([]);
  const [photoUrls, setPhotoUrls] = useState([]);

  // Vision processing state
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [allRounds, setAllRounds] = useState([]);
  const [runningTally, setRunningTally] = useState([]);

  // Intake record for fold phase
  const [intakeRecord, setIntakeRecord] = useState(null);

  // Confirmation state
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Fold acknowledgements
  const [acknowledgements, setAcknowledgements] = useState([]);

  // Validate token on mount
  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/track/validate?token=${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setTokenError(err.detail || 'Invalid or expired link');
        setValidating(false);
        return;
      }
      const data = await res.json();
      setTokenData(data);

      // If fold phase, fetch intake record
      if (data.phase === 'fold') {
        fetchIntakeRecord(data.orderId, data.laundryId);
      }
    } catch (e) {
      setTokenError('Could not validate link. Please check your connection.');
    }
    setValidating(false);
  };

  const fetchIntakeRecord = async (orderId, laundryId) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/item-tracking/record?orderId=${orderId}&laundryId=${laundryId}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.intakeRecord) {
          setIntakeRecord(data.intakeRecord);
        }
      }
    } catch (e) {
      console.error('Failed to fetch intake record:', e);
    }
  };

  const handlePhotoCapture = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newPhotos = [...photos];
    files.forEach(file => {
      if (newPhotos.length < 3) {
        newPhotos.push(file);
      }
    });
    setPhotos(newPhotos);
    e.target.value = ''; // Reset input
  };

  const removePhoto = (index) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const uploadAndAnalyze = async () => {
    if (photos.length < 2) {
      toast({
        title: 'Need more photos',
        description: 'Please take at least 2 photos from different angles.',
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    setProcessing(true);

    try {
      // Convert photos to base64
      const base64Images = await Promise.all(
        photos.map(file => fileToBase64(file))
      );

      const res = await fetch(`${API_BASE}/api/track/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          images: base64Images,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Upload failed');
      }

      const data = await res.json();
      setResults(data.result);
      setPhotoUrls(prev => [...prev, ...(data.result.imageUrls || [])]);

      // Update running tally
      const newRounds = [...allRounds, data.result.items];
      setAllRounds(newRounds);
      updateRunningTally(newRounds);

      // Clear photos for potential next round
      setPhotos([]);

      toast({
        title: 'Photos analyzed',
        description: `Found ${data.result.items.length} item types.`,
        status: 'success',
        duration: 3000,
      });
    } catch (e) {
      toast({
        title: 'Analysis failed',
        description: e.message || 'Please try again.',
        status: 'error',
        duration: 5000,
      });
    }

    setProcessing(false);
  };

  const updateRunningTally = (rounds) => {
    const tally = {};
    rounds.forEach(roundItems => {
      roundItems.forEach(item => {
        if (tally[item.category]) {
          tally[item.category].count += item.count;
          tally[item.category].confidence = Math.min(
            tally[item.category].confidence,
            item.confidence
          );
        } else {
          tally[item.category] = { ...item };
        }
      });
    });
    setRunningTally(Object.values(tally));
  };

  const confirmItems = async () => {
    setConfirming(true);

    try {
      const endpoint = tokenData.phase === 'intake'
        ? '/api/track/confirm-intake'
        : '/api/track/confirm-fold';

      const body = {
        token,
        items: runningTally.map(item => ({
          category: item.category,
          count: item.count,
        })),
        photoUrls,
      };

      // Add acknowledgements for fold phase
      if (tokenData.phase === 'fold') {
        body.acknowledgements = acknowledgements;
      }

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail?.message || err.detail || 'Confirmation failed');
      }

      setConfirmed(true);
      toast({
        title: 'Confirmed!',
        description: tokenData.phase === 'intake'
          ? 'Item count recorded. Customer will receive SMS.'
          : 'Fold count confirmed. Customer will receive SMS.',
        status: 'success',
        duration: 5000,
      });
    } catch (e) {
      toast({
        title: 'Confirmation failed',
        description: e.message,
        status: 'error',
        duration: 5000,
      });
    }

    setConfirming(false);
  };

  // ── Render States ──────────────────────────────────────────────────────────

  if (validating) {
    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" p={4}>
        <VStack spacing={4}>
          <Spinner size="xl" color="blue.500" />
          <Text>Validating link...</Text>
        </VStack>
      </Box>
    );
  }

  if (tokenError) {
    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" p={4}>
        <Alert status="error" borderRadius="md" flexDirection="column" textAlign="center" p={6}>
          <AlertIcon boxSize="40px" mr={0} mb={3} />
          <AlertTitle fontSize="lg">Link Expired or Invalid</AlertTitle>
          <AlertDescription mt={2}>
            {tokenError}
            <br /><br />
            Please scan a new QR code from the POS.
          </AlertDescription>
        </Alert>
      </Box>
    );
  }

  if (confirmed) {
    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" p={4}>
        <VStack spacing={4} textAlign="center">
          <Text fontSize="4xl">✅</Text>
          <Heading size="md">
            {tokenData.phase === 'intake' ? 'Intake Recorded' : 'Fold Complete'}
          </Heading>
          <Text color="gray.600">
            You can close this page. Results are synced to the POS.
          </Text>
        </VStack>
      </Box>
    );
  }

  // ── Main UI ────────────────────────────────────────────────────────────────

  const hasLowConfidence = runningTally.some(item => item.flagged || item.confidence < 80);
  const discrepancies = getDiscrepancies(runningTally, intakeRecord);
  const allAcknowledged = discrepancies.length === 0 ||
    discrepancies.every(d => acknowledgements.some(a => a.category === d.category));

  return (
    <Box minH="100vh" bg="gray.50" p={4} maxW="500px" mx="auto">
      <VStack spacing={4} align="stretch">
        {/* Header */}
        <Box textAlign="center" pt={2}>
          <Badge colorScheme={tokenData.phase === 'intake' ? 'blue' : 'green'} fontSize="sm" mb={2}>
            {tokenData.phase === 'intake' ? 'INTAKE' : 'FOLD'}
          </Badge>
          <Heading size="sm">Order: {tokenData.orderId}</Heading>
        </Box>

        <Divider />

        {/* Photo Capture Section */}
        {!results && (
          <VStack spacing={3}>
            <Text fontWeight="bold" fontSize="md">
              📸 Take 2-3 photos from different angles
            </Text>
            <Text fontSize="sm" color="gray.600">
              Lay items on the table, then photograph from overhead, left, and right.
            </Text>

            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handlePhotoCapture}
            />

            <Button
              colorScheme="blue"
              size="lg"
              w="full"
              onClick={() => fileInputRef.current?.click()}
              isDisabled={photos.length >= 3}
            >
              📷 Take Photo ({photos.length}/3)
            </Button>

            {/* Photo previews */}
            {photos.length > 0 && (
              <SimpleGrid columns={3} spacing={2} w="full">
                {photos.map((photo, i) => (
                  <Box key={i} position="relative">
                    <Image
                      src={URL.createObjectURL(photo)}
                      borderRadius="md"
                      h="80px"
                      w="full"
                      objectFit="cover"
                    />
                    <IconButton
                      icon={<Text>✕</Text>}
                      size="xs"
                      position="absolute"
                      top={1}
                      right={1}
                      colorScheme="red"
                      borderRadius="full"
                      onClick={() => removePhoto(i)}
                      aria-label="Remove photo"
                    />
                  </Box>
                ))}
              </SimpleGrid>
            )}

            {photos.length >= 2 && (
              <Button
                colorScheme="green"
                size="lg"
                w="full"
                onClick={uploadAndAnalyze}
                isLoading={processing}
                loadingText="Analyzing..."
              >
                🔍 Analyze Photos
              </Button>
            )}
          </VStack>
        )}

        {/* Results Section */}
        {runningTally.length > 0 && (
          <VStack spacing={3} align="stretch">
            <HStack justify="space-between">
              <Text fontWeight="bold" fontSize="md">📋 Items Found:</Text>
              <Text fontSize="xs" color="gray.500">Tap count to edit</Text>
            </HStack>

            {runningTally.map((item, i) => (
              <Card key={i} variant="outline" size="sm">
                <CardBody py={2} px={3}>
                  <HStack justify="space-between">
                    <HStack flex={1}>
                      <Text fontWeight="medium" fontSize="sm">{item.category}</Text>
                      {item.confidence < 80 && (
                        <Badge colorScheme="orange" fontSize="xs">?</Badge>
                      )}
                    </HStack>
                    <HStack spacing={1}>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                          const updated = [...runningTally];
                          if (updated[i].count > 0) {
                            updated[i] = { ...updated[i], count: updated[i].count - 1 };
                            setRunningTally(updated);
                          }
                        }}
                      >−</Button>
                      <Text fontWeight="bold" fontSize="lg" minW="30px" textAlign="center">
                        {item.count}
                      </Text>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                          const updated = [...runningTally];
                          updated[i] = { ...updated[i], count: updated[i].count + 1 };
                          setRunningTally(updated);
                        }}
                      >+</Button>
                      {tokenData.phase === 'fold' && intakeRecord && (
                        <Text fontSize="xs" color="gray.500">
                          / {getExpectedCount(item.category, intakeRecord)}
                        </Text>
                      )}
                    </HStack>
                  </HStack>
                </CardBody>
              </Card>
            ))}

            {/* Low confidence warning */}
            {hasLowConfidence && (
              <Alert status="warning" borderRadius="md" size="sm">
                <AlertIcon />
                <Box>
                  <AlertTitle fontSize="sm">Some items are uncertain</AlertTitle>
                  <AlertDescription fontSize="xs">
                    Take additional photos from different angles for better accuracy.
                  </AlertDescription>
                </Box>
              </Alert>
            )}

            {/* Add more items button (for large orders) */}
            <Button
              variant="outline"
              colorScheme="blue"
              size="sm"
              onClick={() => {
                setResults(null);
                setPhotos([]);
              }}
            >
              ➕ Add More Items (next batch)
            </Button>

            {/* Fold Phase: Discrepancy Handling */}
            {tokenData.phase === 'fold' && discrepancies.length > 0 && (
              <VStack spacing={2} align="stretch">
                <HStack justify="space-between">
                  <Text fontWeight="bold" color="red.500" fontSize="sm">
                    ⚠️ Discrepancies ({discrepancies.length}):
                  </Text>
                  <Button
                    size="xs"
                    colorScheme="orange"
                    variant="outline"
                    onClick={() => {
                      // Accept all discrepancies as "Miscounted at intake"
                      const allAcks = discrepancies.map(d => ({
                        category: d.category,
                        reason: 'Miscounted at intake',
                        intakeCount: d.intakeCount,
                        foldCount: d.foldCount,
                      }));
                      setAcknowledgements(allAcks);
                    }}
                  >
                    Accept All
                  </Button>
                </HStack>
                {discrepancies.map((d, i) => (
                  <DiscrepancyAck
                    key={i}
                    discrepancy={d}
                    acknowledged={acknowledgements.find(a => a.category === d.category)}
                    onAcknowledge={(reason, freeText) => {
                      setAcknowledgements(prev => [
                        ...prev.filter(a => a.category !== d.category),
                        { category: d.category, reason, freeText, intakeCount: d.intakeCount, foldCount: d.foldCount },
                      ]);
                    }}
                  />
                ))}
              </VStack>
            )}

            {/* All matched indicator for fold phase */}
            {tokenData.phase === 'fold' && intakeRecord && discrepancies.length === 0 && (
              <Alert status="success" borderRadius="md">
                <AlertIcon />
                <Text fontWeight="bold">✓ All Items Matched!</Text>
              </Alert>
            )}

            {/* Confirm Button */}
            <Button
              colorScheme="green"
              size="lg"
              w="full"
              onClick={confirmItems}
              isLoading={confirming}
              loadingText="Confirming..."
              isDisabled={
                runningTally.length === 0 ||
                (tokenData.phase === 'fold' && discrepancies.length > 0 && !allAcknowledged)
              }
            >
              ✓ Confirm {tokenData.phase === 'intake' ? 'Intake' : 'Fold'} Count
            </Button>
          </VStack>
        )}
      </VStack>
    </Box>
  );
}

// ── Helper Components ──────────────────────────────────────────────────────────

function DiscrepancyAck({ discrepancy, acknowledged, onAcknowledge }) {
  const [selectedReason, setSelectedReason] = useState(acknowledged?.reason || '');
  const [freeText, setFreeText] = useState(acknowledged?.freeText || '');

  const reasons = [
    { key: 'Found in machine', icon: '🔄' },
    { key: 'Customer never sent', icon: '❌' },
    { key: 'Damaged/Disposed', icon: '🗑️' },
    { key: 'Miscounted at intake', icon: '🔢' },
    { key: 'Other', icon: '📝' },
  ];

  const diff = discrepancy.foldCount - discrepancy.intakeCount;
  const diffText = diff > 0
    ? `+${diff} extra`
    : `${diff} missing`;

  return (
    <Box
      bg="white"
      borderWidth="2px"
      borderColor={selectedReason ? 'green.300' : 'orange.300'}
      borderRadius="lg"
      p={3}
      mb={1}
    >
      {/* Header — category and counts */}
      <HStack justify="space-between" mb={2}>
        <Text fontSize="md" fontWeight="bold">{discrepancy.category}</Text>
        <Badge
          colorScheme={Math.abs(diff) >= 2 ? 'red' : 'orange'}
          fontSize="sm"
          px={2}
          py={1}
          borderRadius="md"
        >
          {discrepancy.foldCount} folded / {discrepancy.intakeCount} received ({diffText})
        </Badge>
      </HStack>

      {/* Reason selection — vertical list with large tap targets */}
      {!selectedReason ? (
        <VStack spacing={2} align="stretch">
          <Text fontSize="xs" color="gray.500" fontWeight="semibold">Why is there a difference?</Text>
          {reasons.map(({ key, icon }) => (
            <Button
              key={key}
              size="md"
              w="full"
              variant="outline"
              colorScheme="gray"
              justifyContent="flex-start"
              leftIcon={<Text>{icon}</Text>}
              onClick={() => {
                setSelectedReason(key);
                onAcknowledge(key, key === 'Other' ? freeText : undefined);
              }}
            >
              <Text fontSize="sm">{key}</Text>
            </Button>
          ))}
        </VStack>
      ) : (
        <HStack justify="space-between" bg="green.50" p={2} borderRadius="md">
          <Text fontSize="sm" color="green.700">
            ✓ {selectedReason}
          </Text>
          <Button
            size="xs"
            variant="ghost"
            colorScheme="gray"
            onClick={() => {
              setSelectedReason('');
            }}
          >
            Change
          </Button>
        </HStack>
      )}

      {selectedReason === 'Other' && (
        <Box mt={2}>
          <input
            type="text"
            placeholder="Explain briefly..."
            value={freeText}
            onChange={(e) => {
              setFreeText(e.target.value);
              onAcknowledge('Other', e.target.value);
            }}
            style={{
              padding: '10px 12px',
              border: '1px solid #ccc',
              borderRadius: '8px',
              fontSize: '14px',
              width: '100%',
            }}
          />
        </Box>
      )}
    </Box>
  );
}

// ── Helper Functions ───────────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getExpectedCount(category, intakeRecord) {
  if (!intakeRecord?.items) return '?';
  const item = intakeRecord.items.find(i => i.category === category);
  return item ? item.count : 0;
}

function getDiscrepancies(foldItems, intakeRecord) {
  if (!intakeRecord?.items) return [];

  const intakeMap = {};
  intakeRecord.items.forEach(item => {
    intakeMap[item.category] = item.count;
  });

  const discrepancies = [];
  const allCategories = new Set([
    ...Object.keys(intakeMap),
    ...foldItems.map(i => i.category),
  ]);

  allCategories.forEach(category => {
    const intakeCount = intakeMap[category] || 0;
    const foldItem = foldItems.find(i => i.category === category);
    const foldCount = foldItem ? foldItem.count : 0;

    if (intakeCount !== foldCount) {
      discrepancies.push({ category, intakeCount, foldCount, difference: foldCount - intakeCount });
    }
  });

  return discrepancies;
}

export default ItemTrackingUpload;
