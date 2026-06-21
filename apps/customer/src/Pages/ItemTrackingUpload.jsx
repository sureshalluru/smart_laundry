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
  const [photos, setPhotos] = useState([null, null, null, null]); // 4 slots: left, right, front, top
  const [photoUrls, setPhotoUrls] = useState([]);
  const [currentAngle, setCurrentAngle] = useState(0);

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
    newPhotos[currentAngle] = files[0];
    setPhotos(newPhotos);
    e.target.value = ''; // Reset input
  };

  const removePhoto = (index) => {
    const newPhotos = [...photos];
    newPhotos[index] = null;
    setPhotos(newPhotos);
  };

  const uploadAndAnalyze = async () => {
    const validPhotos = photos.filter(Boolean);
    if (validPhotos.length < 4) {
      toast({
        title: 'Need 4 photos',
        description: 'Take photos from Left, Right, Front, and Top angles.',
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    setProcessing(true);

    try {
      // Convert photos to base64 (in order: left, right, front, top)
      const base64Images = await Promise.all(
        validPhotos.map(file => fileToBase64(file))
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
              📸 Take 4 photos from these angles:
            </Text>

            {/* 4 Photo Frames */}
            <SimpleGrid columns={2} spacing={3} w="full">
              {/* Left Angle */}
              <Box
                borderWidth="2px"
                borderColor={photos[0] ? 'green.400' : 'gray.300'}
                borderStyle={photos[0] ? 'solid' : 'dashed'}
                borderRadius="lg"
                h="120px"
                position="relative"
                overflow="hidden"
                cursor="pointer"
                onClick={() => {
                  if (!photos[0]) {
                    setCurrentAngle(0);
                    fileInputRef.current?.click();
                  }
                }}
              >
                {photos[0] ? (
                  <>
                    <Image src={URL.createObjectURL(photos[0])} h="full" w="full" objectFit="cover" />
                    <IconButton
                      icon={<Text fontSize="xs">✕</Text>}
                      size="xs"
                      position="absolute"
                      top={1}
                      right={1}
                      colorScheme="red"
                      borderRadius="full"
                      onClick={(e) => { e.stopPropagation(); removePhoto(0); }}
                      aria-label="Remove"
                    />
                    <Badge position="absolute" bottom={1} left={1} colorScheme="green" fontSize="xs">✓ Left</Badge>
                  </>
                ) : (
                  <VStack h="full" justify="center" spacing={1}>
                    <Text fontSize="2xl">← 📷</Text>
                    <Text fontSize="xs" fontWeight="bold" color="gray.500">LEFT SIDE</Text>
                  </VStack>
                )}
              </Box>

              {/* Right Angle */}
              <Box
                borderWidth="2px"
                borderColor={photos[1] ? 'green.400' : 'gray.300'}
                borderStyle={photos[1] ? 'solid' : 'dashed'}
                borderRadius="lg"
                h="120px"
                position="relative"
                overflow="hidden"
                cursor="pointer"
                onClick={() => {
                  if (!photos[1]) {
                    setCurrentAngle(1);
                    fileInputRef.current?.click();
                  }
                }}
              >
                {photos[1] ? (
                  <>
                    <Image src={URL.createObjectURL(photos[1])} h="full" w="full" objectFit="cover" />
                    <IconButton
                      icon={<Text fontSize="xs">✕</Text>}
                      size="xs"
                      position="absolute"
                      top={1}
                      right={1}
                      colorScheme="red"
                      borderRadius="full"
                      onClick={(e) => { e.stopPropagation(); removePhoto(1); }}
                      aria-label="Remove"
                    />
                    <Badge position="absolute" bottom={1} left={1} colorScheme="green" fontSize="xs">✓ Right</Badge>
                  </>
                ) : (
                  <VStack h="full" justify="center" spacing={1}>
                    <Text fontSize="2xl">📷 →</Text>
                    <Text fontSize="xs" fontWeight="bold" color="gray.500">RIGHT SIDE</Text>
                  </VStack>
                )}
              </Box>

              {/* Front/Straight Angle */}
              <Box
                borderWidth="2px"
                borderColor={photos[2] ? 'green.400' : 'gray.300'}
                borderStyle={photos[2] ? 'solid' : 'dashed'}
                borderRadius="lg"
                h="120px"
                position="relative"
                overflow="hidden"
                cursor="pointer"
                onClick={() => {
                  if (!photos[2]) {
                    setCurrentAngle(2);
                    fileInputRef.current?.click();
                  }
                }}
              >
                {photos[2] ? (
                  <>
                    <Image src={URL.createObjectURL(photos[2])} h="full" w="full" objectFit="cover" />
                    <IconButton
                      icon={<Text fontSize="xs">✕</Text>}
                      size="xs"
                      position="absolute"
                      top={1}
                      right={1}
                      colorScheme="red"
                      borderRadius="full"
                      onClick={(e) => { e.stopPropagation(); removePhoto(2); }}
                      aria-label="Remove"
                    />
                    <Badge position="absolute" bottom={1} left={1} colorScheme="green" fontSize="xs">✓ Front</Badge>
                  </>
                ) : (
                  <VStack h="full" justify="center" spacing={1}>
                    <Text fontSize="2xl">↑ 📷</Text>
                    <Text fontSize="xs" fontWeight="bold" color="gray.500">FRONT VIEW</Text>
                  </VStack>
                )}
              </Box>

              {/* Top/Overhead Angle */}
              <Box
                borderWidth="2px"
                borderColor={photos[3] ? 'green.400' : 'gray.300'}
                borderStyle={photos[3] ? 'solid' : 'dashed'}
                borderRadius="lg"
                h="120px"
                position="relative"
                overflow="hidden"
                cursor="pointer"
                onClick={() => {
                  if (!photos[3]) {
                    setCurrentAngle(3);
                    fileInputRef.current?.click();
                  }
                }}
              >
                {photos[3] ? (
                  <>
                    <Image src={URL.createObjectURL(photos[3])} h="full" w="full" objectFit="cover" />
                    <IconButton
                      icon={<Text fontSize="xs">✕</Text>}
                      size="xs"
                      position="absolute"
                      top={1}
                      right={1}
                      colorScheme="red"
                      borderRadius="full"
                      onClick={(e) => { e.stopPropagation(); removePhoto(3); }}
                      aria-label="Remove"
                    />
                    <Badge position="absolute" bottom={1} left={1} colorScheme="green" fontSize="xs">✓ Top</Badge>
                  </>
                ) : (
                  <VStack h="full" justify="center" spacing={1}>
                    <Text fontSize="2xl">⬇ 📷</Text>
                    <Text fontSize="xs" fontWeight="bold" color="gray.500">TOP VIEW</Text>
                  </VStack>
                )}
              </Box>
            </SimpleGrid>

            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handlePhotoCapture}
            />

            {photos.filter(Boolean).length >= 4 && (
              <Button
                colorScheme="green"
                size="lg"
                w="full"
                onClick={uploadAndAnalyze}
                isLoading={processing}
                loadingText="Analyzing 4 angles..."
              >
                🔍 Analyze Photos
              </Button>
            )}

            {photos.filter(Boolean).length > 0 && photos.filter(Boolean).length < 4 && (
              <Text fontSize="xs" color="gray.500" textAlign="center">
                {4 - photos.filter(Boolean).length} more photo{4 - photos.filter(Boolean).length > 1 ? 's' : ''} needed — tap an empty frame
              </Text>
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

            {/* Add next batch button */}
            <Button
              variant="outline"
              colorScheme="blue"
              size="md"
              w="full"
              onClick={() => {
                setResults(null);
                setPhotos([null, null, null, null]);
              }}
            >
              ➕ Add Next Batch (more items on table)
            </Button>

            <Divider />

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

            {/* Confirm Button — only after all batches are done */}
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
              ✓ All Batches Done — Confirm {tokenData.phase === 'intake' ? 'Intake' : 'Fold'}
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
