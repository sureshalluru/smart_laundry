import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Input,
  InputGroup,
  InputRightAddon,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerCloseButton,
  Image,
  Spinner,
  Icon,
  Badge,
  IconButton,
  useToast,
} from '@chakra-ui/react';
import {
  FaWeight,
  FaCamera,
  FaCheckCircle,
  FaSave,
  FaPlus,
  FaExclamationTriangle,
  FaTrash,
  FaBalanceScale,
} from 'react-icons/fa';
import { useScale } from '../../Services/scale/useScale';
import { convertToStoreUnit } from '../../Services/scale/convertToStoreUnit';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Compress an image data URL to max 640px and JPEG quality 0.5.
 * Reduces phone photos for faster upload + faster Vision AI processing.
 * Returns a Promise that resolves to a compressed base64 data URL.
 */
function compressForUpload(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      const maxDim = 640;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.5));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * MobileWeightEntry — Drawer for entering weight/count values for order services.
 *
 * Displays all services on the order with appropriate numeric inputs:
 * - Weight-based services (inputWeight: true): decimal input
 * - Count-based services: integer input
 *
 * Supports multi-bag scale photos with auto-weight detection via Claude Vision AI.
 * Each bag photo is analyzed independently and weights are summed for the total.
 * On submit, calls POST /api/admin/employee-update-services with updated values.
 *
 * Props:
 * - order: Order object with orderId, laundryId, services array
 * - laundryId: the laundry shop ID
 * - employeeId: authenticated employee ID for audit trail
 * - isOpen: controls drawer visibility
 * - onClose: callback to close the drawer
 * - onSaved: callback when services are successfully updated (refresh order)
 */
const MobileWeightEntry = ({ order, laundryId, employeeId, isOpen, onClose, onSaved }) => {
  const toast = useToast();
  const fileInputRef = useRef(null);

  // Local editable service values
  const [serviceValues, setServiceValues] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Multi-bag photo state
  // Each entry: { file, preview, detectedWeight, detecting, uploaded, error }
  const [bagPhotos, setBagPhotos] = useState([]);

  // Track whether the employee has manually overridden the weight input
  const [weightManuallyEdited, setWeightManuallyEdited] = useState(false);

  // Digital scale integration. Degrades gracefully: when Web Serial is
  // unsupported, `isSupported` is false and the Read Scale UI is hidden.
  const scale = useScale();
  const storeUnit = 'lb'; // store billing unit; matches existing lbs labels
  // Per-bag scale readings captured from the connected scale: [{ weight }]
  const [scaleBags, setScaleBags] = useState([]);

  // Initialize service values when drawer opens or order changes
  useEffect(() => {
    if (isOpen && order?.services) {
      setServiceValues(
        order.services.map((svc) => ({
          id: svc.id,
          serviceName: svc.serviceName || svc.service || '',
          weightOrCount: svc.weightOrCount != null ? String(svc.weightOrCount) : '',
          inputWeight: Boolean(svc.inputWeight),
          servicePrice: svc.servicePrice || 0,
        }))
      );
      setSaveError(null);
      setBagPhotos([]);
      setScaleBags([]);
      setWeightManuallyEdited(false);
    }
  }, [isOpen, order]);

  // Compute the sum of detected weights from all bag photos
  const totalDetectedWeight = bagPhotos.reduce((sum, photo) => {
    const w = parseFloat(photo.detectedWeight);
    return sum + (isNaN(w) ? 0 : w);
  }, 0);

  // Auto-fill weight-based service inputs whenever a new weight is detected from Claude.
  // Always overrides — the customer estimate is just a guess, Claude's reading from the
  // actual scale is more accurate. Employee can still manually override after auto-fill.
  useEffect(() => {
    if (totalDetectedWeight > 0) {
      setWeightManuallyEdited(false);
      setServiceValues((prev) =>
        prev.map((svc) =>
          svc.inputWeight
            ? { ...svc, weightOrCount: totalDetectedWeight.toFixed(1) }
            : svc
        )
      );
    }
  }, [totalDetectedWeight]);

  // Sum of captured scale-bag weights (store unit)
  const totalScaleWeight = scaleBags.reduce((sum, b) => {
    const w = parseFloat(b.weight);
    return sum + (isNaN(w) ? 0 : w);
  }, 0);

  // When scale bags are captured, auto-fill weight-based service lines with the
  // running total (same path as photo detection). Employee can still override.
  useEffect(() => {
    if (totalScaleWeight > 0) {
      setWeightManuallyEdited(false);
      setServiceValues((prev) =>
        prev.map((svc) =>
          svc.inputWeight ? { ...svc, weightOrCount: totalScaleWeight.toFixed(1) } : svc
        )
      );
    }
  }, [totalScaleWeight]);

  // Connect the scale (must be triggered by a user gesture)
  const handleConnectScale = async () => {
    const ok = await scale.connect();
    if (!ok) {
      toast({
        title: 'Scale not connected',
        description: 'Could not open the scale. Check the cable/permissions, or enter weight manually.',
        status: 'warning',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  // Capture the current stable reading as a bag weight
  const handleReadScale = () => {
    const reading = scale.lastReading;
    if (!reading || reading.value == null) {
      toast({ title: 'No reading yet', description: 'Waiting for the scale.', status: 'info', duration: 2500, isClosable: true });
      return;
    }
    if (!reading.stable) {
      toast({ title: 'Scale still settling', description: 'Wait for a stable reading, then tap again.', status: 'info', duration: 2500, isClosable: true });
      return;
    }
    const converted = convertToStoreUnit(reading, storeUnit);
    if (converted.value == null) return;
    setScaleBags((prev) => [...prev, { weight: converted.value.toFixed(1) }]);
  };

  const handleRemoveScaleBag = (index) => {
    setScaleBags((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle value change for a service (marks as manually edited)
  const handleValueChange = (index, value) => {
    setWeightManuallyEdited(true);
    setServiceValues((prev) =>
      prev.map((svc, i) => (i === index ? { ...svc, weightOrCount: value } : svc))
    );
  };

  // Validate inputs before submit
  const validateInputs = () => {
    for (const svc of serviceValues) {
      const val = parseFloat(svc.weightOrCount);
      if (isNaN(val) || val < 0) {
        return `Invalid value for "${svc.serviceName}". Please enter a valid number.`;
      }
      if (!svc.inputWeight && !Number.isInteger(val)) {
        return `"${svc.serviceName}" requires a whole number (count).`;
      }
    }
    return null;
  };

  // Submit updated service values
  const handleSubmit = async () => {
    const validationError = validateInputs();
    if (validationError) {
      toast({
        title: 'Validation Error',
        description: validationError,
        status: 'warning',
        duration: 4000,
        isClosable: true,
      });
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const payload = {
        servicesToUpdate: serviceValues.map((svc) => ({
          id: svc.id,
          serviceName: svc.serviceName,
          weightOrCount: svc.inputWeight
            ? parseFloat(svc.weightOrCount)
            : parseInt(svc.weightOrCount, 10),
        })),
        empId: employeeId,
        orderId: order.orderId,
        laundryId: laundryId,
      };

      const response = await axios.post(
        `${API_URL}/api/admin/employee-update-services`,
        payload
      );

      const statusCode = response.data?.statusCode || response.status;

      if (statusCode === 200) {
        // Persist per-bag scale weights (if any) as order-bag detail. The order
        // total was already written via employee-update-services above; this is
        // supplementary and must not block the save if it fails.
        if (scaleBags.length > 0) {
          try {
            await axios.post(`${API_URL}/api/admin/order-bags`, {
              orderId: order.orderId,
              laundryId,
              empId: employeeId,
              bags: scaleBags.map((b, i) => ({ bagNumber: i + 1, weight: parseFloat(b.weight) })),
            });
          } catch (bagErr) {
            /* non-critical — order total is already saved */
          }
        }
        toast({
          title: 'Updated',
          description: 'Weight/count values saved successfully.',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
        if (onSaved) {
          onSaved();
        }
        onClose();
      } else {
        const errMsg = response.data?.body?.message || 'Failed to update services.';
        setSaveError(errMsg);
        toast({
          title: 'Update Failed',
          description: errMsg,
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
      }
    } catch (err) {
      const errMsg =
        err?.response?.data?.body?.message ||
        err?.response?.data?.message ||
        'Failed to save changes. Please try again.';
      setSaveError(errMsg);
      toast({
        title: 'Error',
        description: errMsg,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Multi-Bag Photo Handlers ---

  const handleCaptureClick = () => {
    if (fileInputRef.current) {
      // Note: Don't clear value before click on iOS Safari — it can prevent onChange
      // from firing when returning from camera. Clear it AFTER the file is processed instead.
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event) => {
    console.log('[MobileWeightEntry] handleFileChange FIRED', event.target.files);
    const file = event.target.files?.[0];
    if (!file) { console.log('[MobileWeightEntry] No file selected'); return; }
    console.log('[MobileWeightEntry] File selected:', file.name, file.type, file.size);

    // Clear the input value AFTER reading — allows re-selecting the same file
    // and avoids iOS Safari issue where clearing before click prevents onChange
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid File',
        description: 'Please select an image file.',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'File Too Large',
        description: 'Photo must be less than 10MB. Please retake at lower resolution.',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
      return;
    }

    // Read file directly via FileReader — same approach as MobileInlineUpload which
    // works reliably on iOS Safari camera. Backend handles resize before Claude.
    // Canvas compression on iOS Safari after camera return can silently hang.
    const reader = new FileReader();
    reader.onload = async (e) => {
      console.log('[MobileWeightEntry] FileReader loaded, dataUrl length:', (e.target.result?.length / 1024).toFixed(0), 'KB');
      const rawDataUrl = e.target.result;

      // Compress to 640px/0.5 quality before sending to API
      let dataUrl = rawDataUrl;
      try {
        dataUrl = await compressForUpload(rawDataUrl);
        console.log('[MobileWeightEntry] Compressed to:', (dataUrl.length / 1024).toFixed(0), 'KB');
      } catch (compressErr) {
        console.warn('[MobileWeightEntry] Compression failed, using original:', compressErr);
        // Fall back to uncompressed
      }

      const newPhoto = {
        file,
        preview: dataUrl,
        detectedWeight: null,
        detecting: true,
        uploaded: false,
        error: null,
      };
      setBagPhotos((prev) => [...prev, newPhoto]);
      detectWeightFromPhoto(dataUrl, bagPhotos.length);
    };
    reader.onerror = () => {
      console.error('[MobileWeightEntry] FileReader error');
      toast({ title: 'Failed to read file', status: 'error', duration: 3000 });
    };
    reader.readAsDataURL(file);
  };

  // Send photo to Vision AI for weight detection + persist in parallel
  const detectWeightFromPhoto = async (base64Image, photoIndex) => {
    console.log('[MobileWeightEntry] detectWeightFromPhoto called. photoIndex:', photoIndex, 'orderId:', order?.orderId, 'laundryId:', laundryId);

    if (!base64Image || !order?.orderId || !laundryId) {
      console.error('[MobileWeightEntry] Missing required data for detect-weight', { hasImage: !!base64Image, orderId: order?.orderId, laundryId });
      setBagPhotos((prev) =>
        prev.map((photo, idx) =>
          idx === photoIndex ? { ...photo, detecting: false, error: 'Missing order info. Close and reopen.' } : photo
        )
      );
      return;
    }

    // Fire BOTH calls in parallel: detect weight + persist to S3
    const persistParams = new URLSearchParams({
      laundryId: laundryId,
      orderId: order.orderId,
      imageType: 'weight',
      targetStatus: order.orderStatus || 'ReceivedAtFacility',
      empId: employeeId || 'EMP',
    });

    // Persist photo (fire-and-forget, don't block detection)
    axios.post(
      `${API_URL}/api/admin/photo-upload-status?${persistParams}`,
      { imageBase64: base64Image }
    ).then(() => {
      console.log('[MobileWeightEntry] photo-upload-status SUCCESS');
    }).catch((err) => {
      console.error('[MobileWeightEntry] photo-upload-status FAILED:', err?.response?.status, err?.message);
    });

    // Detect weight (this is what we await for UI feedback)
    try {
      console.log('[MobileWeightEntry] Calling detect-weight API for order:', order.orderId);
      const response = await axios.post(
        `${API_URL}/api/admin/item-tracking/detect-weight`,
        {
          imageBase64: base64Image,
          laundryId: laundryId,
          orderId: order.orderId,
        }
      );

      console.log('[MobileWeightEntry] detect-weight response:', response.status, response.data);
      const body = response.data?.body || response.data;
      const detectedWeight = body?.weight;
      const confidence = body?.confidence || 0;

      setBagPhotos((prev) =>
        prev.map((photo, idx) =>
          idx === photoIndex
            ? {
                ...photo,
                detecting: false,
                uploaded: true,
                detectedWeight: detectedWeight != null ? detectedWeight : null,
                error: detectedWeight == null ? 'Could not read scale automatically. Please enter the weight manually below.' : null,
              }
            : photo
        )
      );

      if (detectedWeight != null && confidence > 0) {
        toast({
          title: 'Weight Detected',
          description: `Detected ${detectedWeight} lbs from scale photo.`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (err) {
      console.error('[MobileWeightEntry] detect-weight API error:', err?.response?.status, err?.response?.data, err?.message);
      toast({
        title: 'Weight detection failed',
        description: `Error: ${err?.response?.status || ''} ${err?.message || 'Unknown error'}. Enter weight manually.`,
        status: 'warning',
        duration: 5000,
        isClosable: true,
      });
      setBagPhotos((prev) =>
        prev.map((photo, idx) =>
          idx === photoIndex
            ? {
                ...photo,
                detecting: false,
                uploaded: false,
                error: 'Could not read scale automatically. Please enter the weight manually below.',
              }
            : photo
        )
      );
    }
  };

  // Remove a bag photo from the array
  const handleRemovePhoto = (photoIndex) => {
    setBagPhotos((prev) => prev.filter((_, idx) => idx !== photoIndex));
  };

  return (
    <>
      {/* File input OUTSIDE Drawer so onChange fires on all browsers */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-label="Capture scale photo"
      />
    <Drawer isOpen={isOpen} placement="bottom" onClose={onClose} size="full">
      <DrawerOverlay />
      <DrawerContent maxH="90vh" borderTopRadius="xl">
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px" fontSize="md" py={3}>
          <HStack spacing={2}>
            <Icon as={FaWeight} color="purple.500" />
            <Text>Enter Weight / Count</Text>
          </HStack>
        </DrawerHeader>

        <DrawerBody px={3} py={3} overflowY="auto">
          <VStack spacing={4} align="stretch">
            {/* Scale Photo Section - Multi-Bag */}
            <Box
              bg="gray.50"
              border="1px"
              borderColor="gray.200"
              borderRadius="lg"
              p={3}
            >
              <HStack spacing={2} mb={3}>
                <Icon as={FaCamera} color="blue.500" boxSize={4} />
                <Text fontSize="sm" fontWeight="bold" color="gray.700">
                  Scale Photos
                </Text>
                {bagPhotos.length > 0 && (
                  <Badge colorScheme="blue" fontSize="xs">
                    {bagPhotos.length} bag{bagPhotos.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </HStack>

              {/* Bag Photo Cards */}
              {bagPhotos.length > 0 && (
                <VStack spacing={3} mb={3}>
                  {bagPhotos.map((photo, idx) => (
                    <Box
                      key={`bag-${idx}`}
                      bg="white"
                      border="1px solid"
                      borderColor={photo.error ? 'yellow.300' : photo.detectedWeight ? 'green.200' : 'gray.200'}
                      borderRadius="lg"
                      p={2}
                      width="100%"
                    >
                      <HStack spacing={3} align="center">
                        {/* Thumbnail */}
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

                        {/* Weight info */}
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
                                {photo.error || 'Could not read scale automatically. Please enter the weight manually below.'}
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
                </VStack>
              )}

              {/* Capture / Add Another Bag button */}
              <Button
                leftIcon={bagPhotos.length === 0 ? <FaCamera /> : <FaPlus />}
                colorScheme="blue"
                variant={bagPhotos.length === 0 ? 'outline' : 'solid'}
                size="lg"
                minH="52px"
                width="100%"
                onClick={handleCaptureClick}
                fontSize="md"
              >
                {bagPhotos.length === 0 ? 'Take Scale Photo' : 'Add Another Bag'}
              </Button>

              {/* Connected Digital Scale — only when Web Serial is supported */}
              {scale.isSupported && (
                <Box mt={3} pt={3} borderTop="1px dashed" borderColor="gray.200">
                  <HStack spacing={2} mb={2}>
                    <Icon as={FaBalanceScale} color="teal.500" boxSize={4} />
                    <Text fontSize="sm" fontWeight="bold" color="gray.700">
                      Connected Scale
                    </Text>
                    {scale.isConnected && (
                      <Badge colorScheme={scale.stable ? 'green' : 'yellow'} fontSize="xs">
                        {scale.lastReading.value != null
                          ? `${scale.lastReading.value} ${scale.lastReading.unit || ''} ${scale.stable ? '(stable)' : '(settling…)'}`
                          : 'waiting…'}
                      </Badge>
                    )}
                  </HStack>

                  {/* Captured scale-bag readings */}
                  {scaleBags.length > 0 && (
                    <VStack spacing={1} mb={2} align="stretch">
                      {scaleBags.map((b, idx) => (
                        <HStack key={`scale-bag-${idx}`} justify="space-between">
                          <Text fontSize="sm" color="gray.600">Bag {idx + 1}</Text>
                          <HStack spacing={2}>
                            <Text fontSize="sm" fontWeight="bold" color="teal.700">{b.weight} lbs</Text>
                            <IconButton
                              icon={<FaTrash />}
                              aria-label={`Remove scale bag ${idx + 1}`}
                              size="xs"
                              variant="ghost"
                              colorScheme="red"
                              onClick={() => handleRemoveScaleBag(idx)}
                            />
                          </HStack>
                        </HStack>
                      ))}
                    </VStack>
                  )}

                  {!scale.isConnected ? (
                    <Button
                      leftIcon={<FaBalanceScale />}
                      colorScheme="teal"
                      variant="outline"
                      size="lg"
                      minH="52px"
                      width="100%"
                      onClick={handleConnectScale}
                    >
                      Connect Scale
                    </Button>
                  ) : (
                    <Button
                      leftIcon={<FaBalanceScale />}
                      colorScheme="teal"
                      size="lg"
                      minH="52px"
                      width="100%"
                      onClick={handleReadScale}
                      isDisabled={!scale.stable || scale.lastReading.value == null}
                    >
                      {scaleBags.length === 0 ? 'Read Scale' : 'Read Next Bag'}
                    </Button>
                  )}
                </Box>
              )}
            </Box>

            {/* Total Detected Weight Display */}
            {bagPhotos.length > 0 && totalDetectedWeight > 0 && (
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
                  {totalDetectedWeight.toFixed(1)} lbs
                </Text>
                {bagPhotos.filter((p) => p.detectedWeight != null).length > 1 && (
                  <Text fontSize="xs" color="green.500" mt={1}>
                    Sum of {bagPhotos.filter((p) => p.detectedWeight != null).length} bags
                  </Text>
                )}
              </Box>
            )}

            {/* Services List */}
            <Text fontSize="sm" fontWeight="bold" color="gray.700">
              Services
            </Text>

            {serviceValues.length === 0 ? (
              <Text fontSize="sm" color="gray.500" textAlign="center" py={4}>
                No services on this order.
              </Text>
            ) : (
              serviceValues.map((svc, idx) => (
                <Box
                  key={svc.id || `svc-${idx}`}
                  bg="white"
                  border="1px solid"
                  borderColor="gray.200"
                  borderRadius="lg"
                  p={3}
                >
                  <VStack spacing={2} align="stretch">
                    <HStack justify="space-between">
                      <Text fontSize="sm" fontWeight="semibold" noOfLines={1} flex={1}>
                        {svc.serviceName}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        ${parseFloat(svc.servicePrice || 0).toFixed(2)}
                        {svc.inputWeight ? '/lb' : '/piece'}
                      </Text>
                    </HStack>

                    {svc.inputWeight ? (
                      <InputGroup size="md">
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          inputMode="decimal"
                          placeholder="0.0"
                          value={svc.weightOrCount}
                          onChange={(e) => handleValueChange(idx, e.target.value)}
                          textAlign="center"
                          bg="gray.50"
                          minH="44px"
                          fontSize="lg"
                          aria-label={`Weight for ${svc.serviceName}`}
                        />
                        <InputRightAddon minH="44px">lbs</InputRightAddon>
                      </InputGroup>
                    ) : (
                      <InputGroup size="md">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          inputMode="numeric"
                          placeholder="0"
                          value={svc.weightOrCount}
                          onChange={(e) => handleValueChange(idx, e.target.value)}
                          textAlign="center"
                          bg="gray.50"
                          minH="44px"
                          fontSize="lg"
                          aria-label={`Count for ${svc.serviceName}`}
                        />
                        <InputRightAddon minH="44px">pcs</InputRightAddon>
                      </InputGroup>
                    )}
                  </VStack>
                </Box>
              ))
            )}

            {/* Error message with retry hint */}
            {saveError && (
              <Box bg="red.50" border="1px" borderColor="red.200" p={3} borderRadius="md">
                <Text fontSize="sm" color="red.700" fontWeight="medium">
                  {saveError}
                </Text>
                <Text fontSize="xs" color="red.600" mt={1}>
                  Your entered values are preserved. Please try again.
                </Text>
              </Box>
            )}
          </VStack>
        </DrawerBody>

        <DrawerFooter borderTopWidth="1px" px={3} py={3}>
          <HStack w="100%" spacing={3}>
            <Button
              variant="outline"
              colorScheme="gray"
              flex={1}
              minH="44px"
              onClick={onClose}
              isDisabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              colorScheme="purple"
              flex={1}
              minH="44px"
              onClick={handleSubmit}
              isLoading={isSaving}
              loadingText="Saving..."
              leftIcon={<FaSave />}
              isDisabled={serviceValues.length === 0}
            >
              Save
            </Button>
          </HStack>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
    </>
  );
};

export default MobileWeightEntry;
