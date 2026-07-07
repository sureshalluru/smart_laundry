import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  SimpleGrid,
  Icon,
  Image,
  Spinner,
  Badge,
  IconButton,
  useToast,
} from '@chakra-ui/react';
import { FaWeight, FaTshirt, FaCamera, FaPlus, FaCheckCircle, FaExclamationTriangle, FaTrash, FaRedo, FaMinus } from 'react-icons/fa';
import { MODE_CONFIG, compressWithFallback, validateFile } from './photoUtils';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

/**
 * UnifiedPhotoPanel — Consolidates 5 photo upload workflows into a single panel.
 *
 * Renders 5 action buttons (Scale/Weight, Received, Washing, Drying, Folded),
 * a shared source picker dialog, and conditionally renders mode-specific flows.
 */
export default function UnifiedPhotoPanel({ orderId, laundryId, employeeId, order, onOrderRefresh }) {
  // --- Panel-level state ---
  const [activeMode, setActiveMode] = useState(null);
  const [flowReady, setFlowReady] = useState(false);

  // --- FileInputManager: shared file input rendered at component root level ---
  const fileInputRef = useRef(null);
  const onFileSelectedRef = useRef(null);

  // Pending file ref: queues the initial file from source picker for the flow about to render
  const pendingFileRef = useRef(null);

  const triggerFilePick = useCallback((onFileSelected) => {
    onFileSelectedRef.current = onFileSelected;
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }, []);

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    if (onFileSelectedRef.current) {
      onFileSelectedRef.current(files);
      onFileSelectedRef.current = null;
    }
  };

  // --- Button click handler: show the flow panel directly (no auto file picker) ---
  const handleButtonClick = (modeKey) => {
    setActiveMode(modeKey);
    setFlowReady(true);
  };

  // --- Handler when a flow completes (Done button) ---
  const handleFlowDone = useCallback(() => {
    if (onOrderRefresh) onOrderRefresh();
    setActiveMode(null);
    setFlowReady(false);
  }, [onOrderRefresh]);

  // --- Icon resolver for mode buttons ---
  const getButtonIcon = (modeKey) => {
    switch (modeKey) {
      case 'weight': return FaWeight;
      case 'received': return FaCamera;
      case 'fold': return FaTshirt;
      default: return null;
    }
  };

  // --- Mode keys for rendering ---
  const modeKeys = Object.keys(MODE_CONFIG);

  return (
    <Box w="100%">
      {/* Hidden file input — rendered at component root level, NO capture attribute */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Panel Buttons — 2-column grid, last row (fold) spans full width */}
      <SimpleGrid columns={2} spacing={2} w="100%">
        {modeKeys.map((modeKey) => {
          const config = MODE_CONFIG[modeKey];
          const icon = getButtonIcon(modeKey);
          const isLastRow = modeKey === 'fold';

          return (
            <Button
              key={modeKey}
              colorScheme={config.colorScheme}
              variant="outline"
              minH="44px"
              onClick={() => handleButtonClick(modeKey)}
              gridColumn={isLastRow ? '1 / -1' : undefined}
              leftIcon={icon ? <Icon as={icon} /> : undefined}
            >
              {!icon && config.emoji ? `${config.emoji} ` : ''}
              {config.label}
            </Button>
          );
        })}
      </SimpleGrid>

      {/* Active flow rendering */}
      {activeMode && flowReady && activeMode === 'weight' && (
        <WeightFlow
          orderId={orderId}
          laundryId={laundryId}
          employeeId={employeeId}
          order={order}
          triggerFilePick={triggerFilePick}
          pendingFileRef={pendingFileRef}
          onDone={handleFlowDone}
        />
      )}

      {activeMode && flowReady && (activeMode === 'washing' || activeMode === 'drying') && (
        <PersistFlow
          orderId={orderId}
          laundryId={laundryId}
          employeeId={employeeId}
          order={order}
          triggerFilePick={triggerFilePick}
          pendingFileRef={pendingFileRef}
          onDone={handleFlowDone}
          imageType={MODE_CONFIG[activeMode].imageType}
        />
      )}

      {activeMode && flowReady && (activeMode === 'received' || activeMode === 'fold') && (
        <VisionFlow
          orderId={orderId}
          laundryId={laundryId}
          employeeId={employeeId}
          order={order}
          triggerFilePick={triggerFilePick}
          pendingFileRef={pendingFileRef}
          onDone={handleFlowDone}
          phase={MODE_CONFIG[activeMode].phase}
        />
      )}

      {/* Source Picker Dialog - removed, file picker opens directly */}
    </Box>
  );
}

/**
 * WeightFlow — Inline sub-component for the Scale/Weight photo flow.
 *
 * Manages multi-bag scale photos with auto-weight detection via Claude Vision AI.
 * Each photo is compressed and sent to BOTH detect-weight and photo-upload-status in parallel.
 * When all detections complete, auto-updates weight-based services on the order.
 *
 * Props:
 * - orderId, laundryId, employeeId, order: order context
 * - triggerFilePick: function from parent to open the file input
 * - pendingFileRef: ref containing queued file(s) from the initial source picker selection
 * - onDone: callback to close the flow and refresh the order
 */
function WeightFlow({ orderId, laundryId, employeeId, order, triggerFilePick, pendingFileRef, onDone }) {
  const toast = useToast();
  const [photos, setPhotos] = useState([]);

  // Process a file: validate, compress, add to photos state, then fire API calls
  const processFile = useCallback(async (file) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      toast({
        title: 'Invalid File',
        description: validation.error,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
      return;
    }

    // Add photo entry with detecting state
    const preview = URL.createObjectURL(file);
    const newPhoto = {
      preview,
      detectedWeight: null,
      detecting: true,
      uploaded: false,
      error: null,
    };

    setPhotos((prev) => {
      const updated = [...prev, newPhoto];
      const photoIndex = updated.length - 1;
      // Fire detection in background
      runDetection(file, photoIndex);
      return updated;
    });
  }, [orderId, laundryId, employeeId, order, toast]);

  // Run compression + parallel API calls for a photo
  const runDetection = async (file, photoIndex) => {
    let base64Image;
    try {
      base64Image = await compressWithFallback(file);
    } catch (err) {
      setPhotos((prev) =>
        prev.map((p, i) =>
          i === photoIndex ? { ...p, detecting: false, error: 'Failed to process image.' } : p
        )
      );
      return;
    }

    // Fire BOTH calls in parallel: persist to S3 + detect weight
    const persistParams = new URLSearchParams({
      laundryId,
      orderId,
      imageType: 'weight',
      targetStatus: order?.orderStatus || 'ReceivedAtFacility',
      empId: employeeId || 'EMP',
    });

    // Persist photo (fire-and-forget, update uploaded status on success)
    axios
      .post(`${API_URL}/api/admin/photo-upload-status?${persistParams}`, { imageBase64: base64Image })
      .then(() => {
        setPhotos((prev) =>
          prev.map((p, i) => (i === photoIndex ? { ...p, uploaded: true } : p))
        );
      })
      .catch(() => {
        // Persist failure is non-blocking for weight detection
      });

    // Detect weight (this is the primary call for UI feedback)
    try {
      const response = await axios.post(`${API_URL}/api/admin/item-tracking/detect-weight`, {
        imageBase64: base64Image,
        laundryId,
        orderId,
      });

      const body = response.data?.body || response.data;
      const detectedWeight = body?.weight;

      setPhotos((prev) =>
        prev.map((p, i) =>
          i === photoIndex
            ? {
                ...p,
                detecting: false,
                detectedWeight: detectedWeight != null ? detectedWeight : null,
                error:
                  detectedWeight == null
                    ? 'Could not read scale. Enter weight manually.'
                    : null,
              }
            : p
        )
      );

      if (detectedWeight != null) {
        toast({
          title: 'Weight Detected',
          description: `Detected ${detectedWeight} lbs from scale photo.`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (err) {
      const errMsg = err?.response?.data?.message || err?.message || 'Detection failed.';
      toast({
        title: 'Weight detection failed',
        description: errMsg,
        status: 'warning',
        duration: 5000,
        isClosable: true,
      });
      setPhotos((prev) =>
        prev.map((p, i) =>
          i === photoIndex
            ? { ...p, detecting: false, error: 'Could not read scale. Enter weight manually.' }
            : p
        )
      );
    }
  };

  // Consume pending file from the initial source picker selection
  useEffect(() => {
    if (pendingFileRef.current) {
      const files = pendingFileRef.current;
      pendingFileRef.current = null;
      files.forEach((file) => processFile(file));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute total detected weight
  const totalWeight = photos.reduce((sum, p) => {
    const w = parseFloat(p.detectedWeight);
    return sum + (isNaN(w) ? 0 : w);
  }, 0);

  // Check if all photos have finished detecting
  const allComplete = photos.length > 0 && photos.every((p) => !p.detecting);

  // Auto-call employee-update-services when all photos finish detection
  const hasAutoUpdatedRef = useRef(false);
  useEffect(() => {
    if (allComplete && totalWeight > 0 && !hasAutoUpdatedRef.current) {
      hasAutoUpdatedRef.current = true;
      autoUpdateServices();
    }
  }, [allComplete, totalWeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoUpdateServices = async () => {
    if (!order?.services) return;

    const servicesToUpdate = order.services
      .filter((s) => s.inputWeight)
      .map((s) => ({
        id: s.id,
        serviceName: s.serviceName || s.service,
        weightOrCount: totalWeight,
      }));

    if (servicesToUpdate.length === 0) return;

    try {
      await axios.post(`${API_URL}/api/admin/employee-update-services`, {
        servicesToUpdate,
        empId: employeeId,
        orderId,
        laundryId,
      });
      toast({
        title: 'Weight Updated',
        description: `Total ${totalWeight.toFixed(1)} lbs applied to weight-based services.`,
        status: 'success',
        duration: 4000,
        isClosable: true,
      });
    } catch (err) {
      const errMsg = err?.response?.data?.message || 'Failed to update weight on services.';
      toast({
        title: 'Update Failed',
        description: errMsg,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  // Handle "Add Bag" button
  const handleAddBag = () => {
    triggerFilePick((files) => {
      files.forEach((file) => processFile(file));
    });
  };

  // Handle remove photo
  const handleRemovePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    // Reset auto-update flag so it recalculates if needed
    hasAutoUpdatedRef.current = false;
  };

  return (
    <Box mt={4} p={3} borderWidth="1px" borderRadius="lg" bg="white">
      <VStack spacing={3} align="stretch">
        {/* Header */}
        <HStack spacing={2}>
          <Icon as={FaWeight} color="purple.500" boxSize={4} />
          <Text fontSize="sm" fontWeight="bold" color="gray.700">
            Scale Photos
          </Text>
          {photos.length > 0 && (
            <Badge colorScheme="purple" fontSize="xs">
              {photos.length} bag{photos.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </HStack>

        {/* Photo Cards */}
        {photos.map((photo, idx) => (
          <Box
            key={`weight-photo-${idx}`}
            bg="gray.50"
            border="1px solid"
            borderColor={
              photo.error ? 'yellow.300' : photo.detectedWeight != null ? 'green.200' : 'gray.200'
            }
            borderRadius="lg"
            p={2}
            width="100%"
          >
            <HStack spacing={3} align="center">
              {/* Thumbnail 60x60 */}
              <Box
                borderRadius="md"
                overflow="hidden"
                border="1px"
                borderColor="gray.200"
                flexShrink={0}
                width="60px"
                height="60px"
              >
                <Image
                  src={photo.preview}
                  alt={`Bag ${idx + 1} scale photo`}
                  objectFit="cover"
                  width="60px"
                  height="60px"
                />
              </Box>

              {/* Weight detection status */}
              <VStack align="start" spacing={0} flex={1}>
                <Text fontSize="xs" color="gray.500" fontWeight="medium">
                  Bag {idx + 1}
                </Text>
                {photo.detecting ? (
                  <HStack spacing={2}>
                    <Spinner size="xs" color="blue.400" />
                    <Text fontSize="sm" color="blue.500">
                      Reading scale...
                    </Text>
                  </HStack>
                ) : photo.detectedWeight != null ? (
                  <HStack spacing={1}>
                    <Icon as={FaCheckCircle} color="green.500" boxSize={3} />
                    <Text fontSize="md" fontWeight="bold" color="green.700">
                      {photo.detectedWeight} lbs
                    </Text>
                  </HStack>
                ) : (
                  <HStack spacing={1}>
                    <Icon as={FaExclamationTriangle} color="yellow.500" boxSize={3} />
                    <Text fontSize="sm" color="yellow.700">
                      {photo.error || 'Could not read scale.'}
                    </Text>
                  </HStack>
                )}
              </VStack>

              {/* Remove button */}
              <IconButton
                icon={<FaTrash />}
                aria-label={`Remove bag ${idx + 1} photo`}
                size="sm"
                variant="ghost"
                colorScheme="red"
                minH="44px"
                minW="44px"
                onClick={() => handleRemovePhoto(idx)}
                isDisabled={photo.detecting}
              />
            </HStack>
          </Box>
        ))}

        {/* Total Weight Summary */}
        {totalWeight > 0 && (
          <Box
            bg="green.50"
            border="2px solid"
            borderColor="green.300"
            borderRadius="lg"
            p={3}
            textAlign="center"
          >
            <Text fontSize="xs" color="green.600" fontWeight="medium" textTransform="uppercase">
              Total Detected Weight
            </Text>
            <Text fontSize="2xl" fontWeight="bold" color="green.700">
              {totalWeight.toFixed(1)} lbs
            </Text>
            {photos.filter((p) => p.detectedWeight != null).length > 1 && (
              <Text fontSize="xs" color="green.500" mt={1}>
                Sum of {photos.filter((p) => p.detectedWeight != null).length} bags
              </Text>
            )}
          </Box>
        )}

        {/* Add Bag Button */}
        <Button
          leftIcon={photos.length === 0 ? <FaCamera /> : <FaPlus />}
          colorScheme="purple"
          variant={photos.length === 0 ? 'outline' : 'solid'}
          size="lg"
          minH="52px"
          width="100%"
          onClick={handleAddBag}
          fontSize="md"
        >
          {photos.length === 0 ? 'Take Scale Photo' : 'Add Bag'}
        </Button>

        {/* Done Button */}
        {photos.length > 0 && (
          <Button
            colorScheme="green"
            size="lg"
            minH="44px"
            width="100%"
            onClick={onDone}
            isDisabled={photos.some((p) => p.detecting)}
          >
            Done
          </Button>
        )}
      </VStack>
    </Box>
  );
}


/**
 * PersistFlow — Inline sub-component for Washing & Drying photo flows.
 *
 * Uploads photos to S3 without any Vision AI calls.
 * Each photo is compressed and sent to POST /api/admin/photo-upload-status.
 *
 * Props:
 * - orderId, laundryId, employeeId, order: order context
 * - triggerFilePick: function from parent to open the file input
 * - pendingFileRef: ref containing queued file(s) from the initial source picker selection
 * - onDone: callback to close the flow and refresh the order
 * - imageType: 'washing' or 'drying'
 */
function PersistFlow({ orderId, laundryId, employeeId, order, triggerFilePick, pendingFileRef, onDone, imageType }) {
  const toast = useToast();
  const [photos, setPhotos] = useState([]); // { preview, uploading, uploaded, error }
  const [saving, setSaving] = useState(false);

  // Process a file: validate and add to photos array
  const processFile = useCallback((file) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      toast({ title: 'Invalid File', description: validation.error, status: 'error', duration: 4000, isClosable: true });
      return;
    }
    const preview = URL.createObjectURL(file);
    setPhotos((prev) => [...prev, { file, preview, uploading: false, uploaded: false, error: null }]);
  }, [toast]);

  // Consume pending file on mount
  useEffect(() => {
    if (pendingFileRef.current) {
      const files = pendingFileRef.current;
      pendingFileRef.current = null;
      files.forEach((file) => processFile(file));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddPhoto = () => {
    triggerFilePick((files) => {
      files.forEach((file) => processFile(file));
    });
  };

  const handleRemovePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Upload a single photo by index
  const uploadPhoto = async (index) => {
    const photo = photos[index];
    if (!photo || photo.uploaded) return;

    setPhotos((prev) => prev.map((p, i) => i === index ? { ...p, uploading: true, error: null } : p));

    try {
      const base64Image = await compressWithFallback(photo.file);
      const params = new URLSearchParams({
        laundryId, orderId, imageType,
        targetStatus: order?.orderStatus || 'ReceivedAtFacility',
        empId: employeeId || 'EMP',
      });
      await axios.post(`${API_URL}/api/admin/photo-upload-status?${params}`, { imageBase64: base64Image });
      setPhotos((prev) => prev.map((p, i) => i === index ? { ...p, uploading: false, uploaded: true } : p));
    } catch (err) {
      const errMsg = err?.response?.data?.message || 'Upload failed. Please check your connection and try again.';
      setPhotos((prev) => prev.map((p, i) => i === index ? { ...p, uploading: false, error: errMsg } : p));
    }
  };

  // Save All: upload all non-uploaded photos
  const handleSaveAll = async () => {
    setSaving(true);
    const promises = photos.map((p, i) => (!p.uploaded ? uploadPhoto(i) : Promise.resolve()));
    await Promise.all(promises);
    setSaving(false);

    // Check if all succeeded
    setPhotos((current) => {
      const allDone = current.every((p) => p.uploaded);
      if (allDone) {
        const label = imageType === 'washing' ? 'Washing' : 'Drying';
        toast({ title: `${label} photos saved!`, status: 'success', duration: 3000, isClosable: true });
      }
      return current;
    });
  };

  const handleRetry = (index) => uploadPhoto(index);

  const allUploaded = photos.length > 0 && photos.every((p) => p.uploaded);
  const hasErrors = photos.some((p) => p.error);
  const label = imageType === 'washing' ? 'Washing' : 'Drying';
  const colorScheme = imageType === 'washing' ? 'yellow' : 'orange';
  const emoji = imageType === 'washing' ? '🧺' : '🔥';

  return (
    <Box mt={4} p={3} borderWidth="1px" borderRadius="lg" bg="white">
      <VStack spacing={3} align="stretch">
        <HStack spacing={2}>
          <Text fontSize="md">{emoji}</Text>
          <Text fontSize="sm" fontWeight="bold" color="gray.700">{label} Photos</Text>
          {photos.length > 0 && (
            <Badge colorScheme={colorScheme} fontSize="xs">{photos.length}</Badge>
          )}
        </HStack>

        {/* Photo Cards */}
        {photos.map((photo, idx) => (
          <Box key={`persist-${idx}`} bg="gray.50" border="1px solid"
            borderColor={photo.error ? 'red.200' : photo.uploaded ? 'green.200' : 'gray.200'}
            borderRadius="lg" p={2}>
            <HStack spacing={3} align="center">
              <Box borderRadius="md" overflow="hidden" flexShrink={0} w="60px" h="60px">
                <Image src={photo.preview} alt={`${label} photo ${idx + 1}`} objectFit="cover" w="60px" h="60px" />
              </Box>
              <VStack align="start" spacing={0} flex={1}>
                <Text fontSize="xs" color="gray.500">Photo {idx + 1}</Text>
                {photo.uploading ? (
                  <HStack spacing={2}><Spinner size="xs" color="blue.400" /><Text fontSize="sm" color="blue.500">Uploading...</Text></HStack>
                ) : photo.uploaded ? (
                  <HStack spacing={1}><Icon as={FaCheckCircle} color="green.500" boxSize={3} /><Text fontSize="sm" color="green.600">Saved</Text></HStack>
                ) : photo.error ? (
                  <HStack spacing={1}>
                    <Icon as={FaExclamationTriangle} color="red.500" boxSize={3} />
                    <Text fontSize="xs" color="red.600" noOfLines={1}>{photo.error}</Text>
                  </HStack>
                ) : (
                  <Text fontSize="sm" color="gray.500">Ready</Text>
                )}
              </VStack>
              {photo.error && !photo.uploading && (
                <IconButton icon={<FaRedo />} aria-label="Retry upload" size="sm" variant="ghost" colorScheme="blue" minH="44px" minW="44px" onClick={() => handleRetry(idx)} />
              )}
              {!photo.uploading && !photo.uploaded && (
                <IconButton icon={<FaTrash />} aria-label={`Remove photo ${idx + 1}`} size="sm" variant="ghost" colorScheme="red" minH="44px" minW="44px" onClick={() => handleRemovePhoto(idx)} />
              )}
            </HStack>
          </Box>
        ))}

        {/* Add Photo */}
        <Button leftIcon={<FaPlus />} colorScheme={colorScheme} variant="outline" size="lg" minH="48px" w="100%" onClick={handleAddPhoto}>
          Add Photo
        </Button>

        {/* Save All */}
        {photos.length > 0 && !allUploaded && (
          <Button colorScheme="blue" size="lg" minH="44px" w="100%" onClick={handleSaveAll}
            isLoading={saving} isDisabled={saving || photos.every((p) => p.uploaded)}>
            Save All
          </Button>
        )}

        {/* Retry failed */}
        {hasErrors && !saving && (
          <Text fontSize="xs" color="red.500" textAlign="center">Some uploads failed. Tap retry on failed photos or Save All again.</Text>
        )}

        {/* Done */}
        {allUploaded && (
          <Button colorScheme="green" size="lg" minH="44px" w="100%" onClick={onDone}>Done</Button>
        )}
      </VStack>
    </Box>
  );
}


/**
 * VisionFlow — Inline sub-component for Received (intake) & Fold photo flows.
 *
 * 4 angle slots with Vision AI analysis and item count adjustment.
 *
 * Props:
 * - orderId, laundryId, employeeId, order: order context
 * - triggerFilePick: function from parent to open the file input
 * - pendingFileRef: ref containing queued file(s) from the initial source picker selection
 * - onDone: callback to close the flow and refresh the order
 * - phase: 'intake' or 'fold'
 */
function VisionFlow({ orderId, laundryId, employeeId, order, triggerFilePick, pendingFileRef, onDone, phase }) {
  const toast = useToast();
  const [photos, setPhotos] = useState([null, null, null, null]); // 4 angle slots
  const [step, setStep] = useState('capture'); // capture | analyzing | results | adjust | confirmed
  const [token, setToken] = useState(null);
  const [visionResults, setVisionResults] = useState(null);
  const [adjustedItems, setAdjustedItems] = useState([]);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const SLOTS = [
    { label: 'Front View', required: true },
    { label: 'Top View', required: true },
    { label: 'Left Side', required: false },
    { label: 'Right Side', required: false },
  ];

  // Consume pending file on mount
  useEffect(() => {
    if (pendingFileRef.current) {
      const files = pendingFileRef.current;
      pendingFileRef.current = null;
      if (files.length > 0) {
        const file = files[0];
        const validation = validateFile(file);
        if (validation.valid) {
          const preview = URL.createObjectURL(file);
          setPhotos((prev) => {
            const next = [...prev];
            next[0] = { file, preview };
            return next;
          });
          setActiveSlotIndex(1);
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Find next empty slot
  const getNextEmptySlot = (fromIndex = 0) => {
    for (let i = fromIndex; i < 4; i++) {
      if (!photos[i]) return i;
    }
    return -1;
  };

  const handleSlotClick = (slotIdx) => {
    if (photos[slotIdx]) return; // already filled
    setActiveSlotIndex(slotIdx);
    triggerFilePick((files) => {
      if (files.length === 0) return;
      const file = files[0];
      const validation = validateFile(file);
      if (!validation.valid) {
        toast({ title: 'Invalid File', description: validation.error, status: 'error', duration: 4000, isClosable: true });
        return;
      }
      const preview = URL.createObjectURL(file);
      setPhotos((prev) => {
        const next = [...prev];
        next[slotIdx] = { file, preview };
        return next;
      });
      // Advance to next empty slot
      const nextSlot = getNextEmptySlot(slotIdx + 1);
      if (nextSlot >= 0) setActiveSlotIndex(nextSlot);
    });
  };

  const handleRemoveSlot = (slotIdx) => {
    setPhotos((prev) => {
      const next = [...prev];
      next[slotIdx] = null;
      return next;
    });
  };

  const canAnalyze = photos[0] !== null && photos[1] !== null;
  const filledPhotos = photos.filter(Boolean);

  // --- Analyze ---
  const handleAnalyze = async () => {
    setStep('analyzing');
    setError(null);

    try {
      // 1. Get token
      const qrParams = new URLSearchParams({
        orderId, laundryId, phase,
        employeeId: employeeId || 'EMP',
        baseUrl: window.location.origin,
      });
      const qrRes = await axios.get(`${API_URL}/api/admin/item-tracking/qr-code?${qrParams}`);
      const uploadToken = qrRes.data.token;
      setToken(uploadToken);

      // 2. Compress all filled photos
      const base64Images = [];
      for (const photo of filledPhotos) {
        const compressed = await compressWithFallback(photo.file);
        base64Images.push(compressed);
      }

      // 3. Upload for analysis
      const uploadRes = await axios.post(`${API_URL}/api/track/upload`, {
        token: uploadToken,
        images: base64Images,
      });

      const result = uploadRes.data?.result || uploadRes.data;
      if (!result?.items) {
        throw new Error('Analysis returned no results. Please retake photos.');
      }

      setVisionResults(result);
      const items = (result.items || []).map((item) => ({
        category: item.category,
        count: item.count,
        confidence: item.confidence || 100,
        flagged: item.flagged || false,
        note: item.note || null,
      }));
      setAdjustedItems(items);
      setStep('results');
    } catch (err) {
      const errMsg = err?.response?.data?.detail || err?.message || 'Analysis failed. Please retake photos.';
      setError(errMsg);
      setStep('capture');
    }
  };

  // --- Adjust counts ---
  const adjustCount = (index, delta) => {
    setAdjustedItems((prev) =>
      prev.map((item, i) => i === index ? { ...item, count: Math.max(0, item.count + delta) } : item)
    );
  };

  // --- Confirm ---
  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);

    try {
      const endpoint = phase === 'intake' ? '/api/track/confirm-intake' : '/api/track/confirm-fold';
      const confirmItems = adjustedItems.map((item) => ({ category: item.category, count: item.count }));
      const photoUrls = visionResults?.imageUrls || [];

      const body = { token, items: confirmItems, photoUrls };

      // For fold: auto-generate acknowledgements for ALL items
      if (phase === 'fold') {
        body.acknowledgements = adjustedItems.map((item) => ({
          category: item.category,
          reason: 'Employee reviewed and adjusted count',
        }));
      }

      let res = await axios.post(`${API_URL}${endpoint}`, body);

      // Handle 422 retry for unresolved fold discrepancies
      if (res.status === 422 && phase === 'fold') {
        const errData = res.data;
        if (errData?.detail?.unresolved) {
          const allCategories = [
            ...adjustedItems.map((item) => item.category),
            ...(errData.detail.unresolved || []).map((d) => d.category || d),
          ];
          body.acknowledgements = [...new Set(allCategories)].map((cat) => ({
            category: cat,
            reason: 'Employee reviewed and adjusted count',
          }));
          res = await axios.post(`${API_URL}${endpoint}`, body);
        }
      }

      setStep('confirmed');
      toast({
        title: phase === 'intake' ? 'Intake confirmed!' : 'Fold confirmed!',
        status: 'success', duration: 3000, isClosable: true,
      });
      setTimeout(() => onDone(), 1500);
    } catch (err) {
      // axios throws on 4xx/5xx — handle 422 retry here
      if (err?.response?.status === 422 && phase === 'fold') {
        const errData = err.response.data;
        if (errData?.detail?.unresolved) {
          try {
            const endpoint = '/api/track/confirm-fold';
            const confirmItems = adjustedItems.map((item) => ({ category: item.category, count: item.count }));
            const photoUrls = visionResults?.imageUrls || [];
            const allCategories = [
              ...adjustedItems.map((item) => item.category),
              ...(errData.detail.unresolved || []).map((d) => d.category || d),
            ];
            const retryBody = {
              token, items: confirmItems, photoUrls,
              acknowledgements: [...new Set(allCategories)].map((cat) => ({
                category: cat,
                reason: 'Employee reviewed and adjusted count',
              })),
            };
            await axios.post(`${API_URL}${endpoint}`, retryBody);
            setStep('confirmed');
            toast({ title: 'Fold confirmed!', status: 'success', duration: 3000, isClosable: true });
            setTimeout(() => onDone(), 1500);
            return;
          } catch (retryErr) {
            // Fall through to error handling
          }
        }
      }
      const errMsg = err?.response?.data?.detail || err?.message || 'Confirmation failed. Please try again.';
      setError(typeof errMsg === 'string' ? errMsg : errMsg?.message || 'Confirmation failed.');
    } finally {
      setConfirming(false);
    }
  };

  // --- Step indicator dots ---
  const steps = ['capture', 'analyzing', 'results', 'adjust', 'confirmed'];
  const currentIdx = steps.indexOf(step);

  // --- Inline styles (concise, like MobileInlineUpload) ---
  const dotStyle = (i) => ({
    width: '10px', height: '10px', borderRadius: '50%',
    backgroundColor: i < currentIdx ? '#38A169' : i === currentIdx ? '#3182CE' : '#CBD5E0',
  });

  return (
    <Box mt={4} p={3} borderWidth="1px" borderRadius="lg" bg="white">
      {/* Step indicator */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}>
        {steps.map((s, i) => <div key={s} style={dotStyle(i)} />)}
      </div>

      {/* Error */}
      {error && (
        <Box bg="red.50" border="1px solid" borderColor="red.200" borderRadius="md" p={3} mb={3}>
          <Text fontSize="sm" color="red.600">{error}</Text>
        </Box>
      )}

      {/* CAPTURE step */}
      {step === 'capture' && (
        <VStack spacing={3} align="stretch">
          <Text fontSize="sm" fontWeight="bold" color="gray.700">
            📷 {phase === 'intake' ? 'Count Items' : 'Fold Complete'} — Take Photos
          </Text>
          <Text fontSize="xs" color="gray.500">
            Front and Top views are <strong>required</strong>. Left and Right are optional.
          </Text>

          {/* Photo grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {SLOTS.map((slot, idx) => {
              const photo = photos[idx];
              return (
                <div key={slot.label} style={{ position: 'relative' }}>
                  {photo ? (
                    <>
                      <img src={photo.preview} alt={slot.label}
                        style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #E2E8F0' }} />
                      <button onClick={() => handleRemoveSlot(idx)}
                        style={{ position: 'absolute', top: '4px', right: '4px', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        ×
                      </button>
                    </>
                  ) : (
                    <div onClick={() => handleSlotClick(idx)}
                      style={{ width: '100%', height: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', backgroundColor: slot.required ? '#EBF8FF' : '#F7FAFC', border: slot.required ? '2px dashed #3182CE' : '1px dashed #CBD5E0', cursor: 'pointer' }}>
                      <span style={{ fontSize: '20px' }}>📷</span>
                      <span style={{ fontSize: '10px', color: slot.required ? '#2B6CB0' : '#718096', fontWeight: slot.required ? '600' : '400', marginTop: '2px' }}>{slot.label}</span>
                      {slot.required && <span style={{ fontSize: '9px', color: '#E53E3E', fontWeight: '600' }}>Required</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Text fontSize="xs" color="gray.500" textAlign="center">
            {filledPhotos.length}/4 views captured ({canAnalyze ? '✓ Ready' : 'Need Front + Top'})
          </Text>

          {canAnalyze && (
            <Button colorScheme="green" size="lg" minH="48px" w="100%" onClick={handleAnalyze}>
              ✨ Analyze Photos
            </Button>
          )}
        </VStack>
      )}

      {/* ANALYZING step */}
      {step === 'analyzing' && (
        <VStack spacing={3} py={6}>
          <Spinner size="lg" color="blue.400" />
          <Text fontSize="md" fontWeight="500" color="gray.700">Analyzing photos...</Text>
          <Text fontSize="sm" color="gray.500">AI is counting and categorizing items</Text>
        </VStack>
      )}

      {/* RESULTS step */}
      {step === 'results' && (
        <VStack spacing={3} align="stretch">
          <Text fontSize="sm" fontWeight="bold" color="gray.700">✅ Vision AI Results</Text>
          {adjustedItems.map((item, idx) => (
            <HStack key={idx} p={3} borderWidth="1px" borderRadius="md"
              borderColor={item.flagged ? 'orange.200' : 'gray.200'}
              bg={item.flagged ? 'orange.50' : 'white'} justify="space-between">
              <VStack align="start" spacing={0}>
                <Text fontSize="sm" fontWeight="500">{item.category}</Text>
                {item.flagged && <Text fontSize="xs" color="orange.600">⚠️ Low confidence</Text>}
                {item.note && <Text fontSize="xs" color="gray.500">{item.note}</Text>}
              </VStack>
              <Text fontSize="lg" fontWeight="bold">{item.count}</Text>
            </HStack>
          ))}
          <HStack spacing={2}>
            <Button flex={1} variant="outline" onClick={() => setStep('adjust')}>✏️ Adjust</Button>
            <Button flex={1} colorScheme="green" onClick={handleConfirm} isLoading={confirming}>✓ Confirm</Button>
          </HStack>
        </VStack>
      )}

      {/* ADJUST step */}
      {step === 'adjust' && (
        <VStack spacing={3} align="stretch">
          <Text fontSize="sm" fontWeight="bold" color="gray.700">✏️ Adjust Item Counts</Text>
          {adjustedItems.map((item, idx) => (
            <HStack key={idx} p={3} borderWidth="1px" borderRadius="md" borderColor="gray.200" justify="space-between">
              <Text fontSize="sm" fontWeight="500" flex={1}>{item.category}</Text>
              <HStack spacing={2}>
                <IconButton icon={<FaMinus />} aria-label={`Decrease ${item.category}`} size="sm"
                  minH="44px" minW="44px" colorScheme="red" variant="outline" onClick={() => adjustCount(idx, -1)} />
                <Text fontSize="lg" fontWeight="bold" minW="30px" textAlign="center">{item.count}</Text>
                <IconButton icon={<FaPlus />} aria-label={`Increase ${item.category}`} size="sm"
                  minH="44px" minW="44px" colorScheme="blue" variant="outline" onClick={() => adjustCount(idx, 1)} />
              </HStack>
            </HStack>
          ))}
          <HStack spacing={2}>
            <Button flex={1} variant="outline" onClick={() => setStep('results')}>← Back</Button>
            <Button flex={1} colorScheme="green" onClick={handleConfirm} isLoading={confirming}>✓ Confirm</Button>
          </HStack>
        </VStack>
      )}

      {/* CONFIRMED step */}
      {step === 'confirmed' && (
        <VStack spacing={2} py={6} textAlign="center">
          <Text fontSize="4xl">✅</Text>
          <Text fontSize="lg" fontWeight="600" color="gray.700">
            {phase === 'intake' ? 'Intake' : 'Fold'} Confirmed!
          </Text>
          <Text fontSize="sm" color="gray.500">Order status updated automatically.</Text>
        </VStack>
      )}
    </Box>
  );
}
