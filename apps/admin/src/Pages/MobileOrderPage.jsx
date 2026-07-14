import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Spinner,
  Divider,
  Icon,
  Center,
  Button,
  SimpleGrid,
  useToast,
  useDisclosure,
  Image,
  IconButton,
} from '@chakra-ui/react';
import {
  FaUser,
  FaShoppingBag,
  FaUserCheck,
  FaWeight,
  FaTshirt,
  FaCamera,
  FaPlus,
  FaCheckCircle,
  FaExclamationTriangle,
  FaTrash,
} from 'react-icons/fa';
import { useEmployeeAuth } from '../Context/EmployeeAuthContext';
import MobilePhotoAction from '../Components/MobileOrder/MobilePhotoAction';
import MobileWeightEntry from '../Components/MobileOrder/MobileWeightEntry';
import MobileInlineUpload from '../Components/MobileOrder/MobileInlineUpload';
import ItemTrackingPanel from '../Components/ItemTracking/ItemTrackingPanel';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

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
 * MobileOrderPage — Streamlined mobile-optimized page for processing a single order.
 * Accessed via /:laundryId/admin/order/:orderId after employee PIN authentication.
 *
 * Displays: order summary (customer name, order ID, services, status badge)
 * Actions: Scan Received, Processing, Fold Complete, Enter Weight/Count
 */
const MobileOrderPage = () => {
  const { laundryId, orderId } = useParams();
  const { session } = useEmployeeAuth();
  const toast = useToast();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trackingRecord, setTrackingRecord] = useState(null);

  // Active photo action state
  const [activeAction, setActiveAction] = useState(null); // 'scan_received' | 'processing' | 'fold_complete' | null

  // Track vision results display after successful actions
  const [showVisionResults, setShowVisionResults] = useState(null); // 'scan_received' | 'fold_complete' | null

  // Multi-photo state for washing/drying steps
  const [washingPhotos, setWashingPhotos] = useState([]);
  const [dryingPhotos, setDryingPhotos] = useState([]);
  const [activePhotoStep, setActivePhotoStep] = useState(null); // 'washing' | 'drying' | null
  const washingFileInputRef = useRef(null);
  const dryingFileInputRef = useRef(null);
  const photoCaptureActiveRef = useRef(false);

  // Track whether ItemTrackingPanel's MobileInlineUpload is active
  const [itemTrackingCaptureActive, setItemTrackingCaptureActive] = useState(false);

  // Keep photoCaptureActiveRef in sync with all photo-active states
  useEffect(() => {
    photoCaptureActiveRef.current = (
      activePhotoStep !== null ||
      activeAction !== null ||
      itemTrackingCaptureActive
    );
  }, [activePhotoStep, activeAction, itemTrackingCaptureActive]);

  // Weight/Count entry drawer
  const {
    isOpen: isWeightEntryOpen,
    onOpen: onWeightEntryOpen,
    onClose: onWeightEntryClose,
  } = useDisclosure();

  const employeeId = session?.employeeId || '';

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API_URL}/api/admin/employee-order-info`, {
        params: {
          laundryId,
          orderId,
        },
        timeout: 15000,
      });

      const data = response.data?.body || response.data;

      if (!data || data.message === 'Order not found' || response.data?.statusCode === 404) {
        setError('Order not found');
        setOrder(null);
      } else {
        setOrder(data);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Order not found');
      } else {
        setError('Unable to load order. Please try again.');
      }
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [laundryId, orderId]);

  const fetchTrackingRecord = useCallback(async () => {
    if (!laundryId || !orderId) return;
    try {
      const res = await fetch(
        `${API_URL}/api/admin/item-tracking/record?orderId=${encodeURIComponent(orderId)}&laundryId=${encodeURIComponent(laundryId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setTrackingRecord(data);
      }
    } catch (e) {
      console.error('Failed to fetch tracking record:', e);
    }
  }, [laundryId, orderId]);

  /**
   * Silently refresh order data without showing the full-page loading spinner.
   * Used after weight entry save and for background refresh on visibility/focus.
   */
  const silentFetchOrder = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/admin/employee-order-info`, {
        params: { laundryId, orderId },
        timeout: 15000,
      });
      const data = response.data?.body || response.data;
      if (data && data.message !== 'Order not found' && response.data?.statusCode !== 404) {
        setOrder(data);
      }
    } catch (err) {
      // Silent refresh — don't show error UI on failure
      console.error('Silent order refresh failed:', err);
    }
  }, [laundryId, orderId]);

  useEffect(() => {
    if (laundryId && orderId) {
      fetchOrder();
      fetchTrackingRecord();
    }
  }, [laundryId, orderId, fetchOrder, fetchTrackingRecord]);

  // Refresh tracking status and order when page regains focus
  // Uses silentFetchOrder to avoid showing the full-page loading spinner
  // which would unmount all children and lose photo capture state
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && laundryId && orderId && !photoCaptureActiveRef.current) {
        fetchTrackingRecord();
        silentFetchOrder();
      }
    };

    const handleFocus = () => {
      if (laundryId && orderId && !photoCaptureActiveRef.current) {
        fetchTrackingRecord();
        silentFetchOrder();
      }
    };

    // iOS Safari fires pageshow when returning from camera — guard it too
    const handlePageShow = (e) => {
      if (e.persisted && laundryId && orderId && !photoCaptureActiveRef.current) {
        fetchTrackingRecord();
        silentFetchOrder();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [laundryId, orderId, fetchTrackingRecord, silentFetchOrder]);

  /**
   * Called when a photo action completes successfully.
   * Refreshes order data and shows vision results if applicable.
   */
  const handlePhotoComplete = (actionType) => {
    fetchOrder();
    fetchTrackingRecord();
    setActiveAction(null);
    // Show vision results inline for scan_received and fold_complete
    if (actionType === 'scan_received' || actionType === 'fold_complete') {
      setShowVisionResults(actionType);
    }
  };

  /**
   * Compress an image file client-side before sending to the API.
   */
  const compressImage = (file, maxDimension = 1024, quality = 0.75) => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  /**
   * Handle file selection for washing/drying photo capture.
   */
  const handleStepPhotoCapture = async (file, step) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'Photo must be less than 10MB.',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
      return;
    }

    let base64Image;
    try {
      base64Image = await compressImage(file);
    } catch {
      const reader = new FileReader();
      base64Image = await new Promise((resolve) => {
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
    }

    const newPhoto = { preview: base64Image, uploading: true, uploaded: false, error: null };
    const setPhotos = step === 'washing' ? setWashingPhotos : setDryingPhotos;
    const getPhotos = step === 'washing' ? washingPhotos : dryingPhotos;
    const photoIndex = getPhotos.length;

    setPhotos((prev) => [...prev, newPhoto]);

    // Persist to backend via photo-upload-status
    const targetStatus = step === 'washing' ? order.orderStatus : order.orderStatus;
    const params = new URLSearchParams({
      laundryId,
      orderId,
      imageType: step,
      targetStatus: targetStatus,
      empId: employeeId || 'EMP',
    });

    try {
      await axios.post(
        `${API_URL}/api/admin/photo-upload-status?${params}`,
        { imageBase64: base64Image }
      );
      setPhotos((prev) =>
        prev.map((p, idx) =>
          idx === photoIndex ? { ...p, uploading: false, uploaded: true } : p
        )
      );
      toast({
        title: 'Photo Uploaded',
        description: `${step === 'washing' ? 'Washer' : 'Dryer'} photo saved.`,
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (err) {
      setPhotos((prev) =>
        prev.map((p, idx) =>
          idx === photoIndex ? { ...p, uploading: false, error: 'Upload failed' } : p
        )
      );
      toast({
        title: 'Upload Failed',
        description: 'Could not save photo. Please try again.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  /**
   * Complete the washing step — transition status to Processing.
   */
  const handleWashingDone = async () => {
    try {
      // Use the last washing photo to trigger the status change to Processing
      // Re-upload the last photo with Processing as targetStatus
      const lastPhoto = washingPhotos.find((p) => p.uploaded);
      if (!lastPhoto) return;

      const params = new URLSearchParams({
        laundryId,
        orderId,
        imageType: 'washing',
        targetStatus: 'ProcessingStarted',
        empId: employeeId || 'EMP',
      });
      await axios.post(
        `${API_URL}/api/admin/photo-upload-status?${params}`,
        { imageBase64: lastPhoto.preview }
      );
      toast({
        title: 'Status Updated',
        description: 'Order moved to Processing.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      setActivePhotoStep(null);
      silentFetchOrder();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Could not update status. Please try again.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  /**
   * Remove a photo from the washing/drying list (local only).
   */
  const handleRemoveStepPhoto = (step, index) => {
    const setPhotos = step === 'washing' ? setWashingPhotos : setDryingPhotos;
    setPhotos((prev) => prev.filter((_, idx) => idx !== index));
  };

  /**
   * Called when weight/count entry is saved.
   * Uses silent refresh to avoid full-page loading spinner.
   */
  const handleWeightSaved = () => {
    silentFetchOrder();
  };

  // Loading state
  if (loading) {
    return (
      <Center minH="100vh" bg="gray.50">
        <VStack spacing={4}>
          <Spinner size="xl" color="blue.500" thickness="4px" />
          <Text color="gray.600" fontSize="sm">Loading order...</Text>
        </VStack>
      </Center>
    );
  }

  // Error / not found state
  if (error || !order) {
    return (
      <Center minH="100vh" bg="gray.50" px={4}>
        <VStack spacing={4} textAlign="center">
          <Icon as={FaShoppingBag} boxSize={12} color="gray.300" />
          <Text fontSize="xl" fontWeight="bold" color="gray.700">
            Order Not Found
          </Text>
          <Text fontSize="sm" color="gray.500">
            {error || 'The order you are looking for does not exist or could not be loaded.'}
          </Text>
          <Text fontSize="xs" color="gray.400">
            Order ID: {orderId}
          </Text>
        </VStack>
      </Center>
    );
  }

  const services = order.services || [];
  const employeeName = session?.fullName || 'Unknown Employee';

  return (
    <Box
      bg="gray.50"
      minH="100vh"
      maxW="428px"
      mx="auto"
      px={3}
      py={4}
      overflowX="hidden"
    >
      <VStack spacing={4} align="stretch">
        {/* Employee Info */}
        <HStack spacing={2} bg="blue.50" px={3} py={2} borderRadius="md">
          <Icon as={FaUserCheck} color="blue.500" boxSize={4} />
          <Text fontSize="xs" color="blue.700" fontWeight="medium">
            Logged in as: {employeeName}
          </Text>
        </HStack>

        {/* Order Summary */}
        <Box bg="white" borderRadius="lg" p={4} shadow="sm">
          <VStack spacing={3} align="stretch">
            {/* Order ID and Status Badge */}
            <HStack justify="space-between" align="center">
              <Text fontSize="lg" fontWeight="bold" color="gray.800">
                {order.orderId}
              </Text>
              <Badge
                colorScheme={getStatusColor(order.orderStatus)}
                fontSize="xs"
                px={2}
                py={1}
                borderRadius="md"
              >
                {order.orderStatus}
              </Badge>
            </HStack>

            <Divider />

            {/* Customer Name */}
            <HStack spacing={2}>
              <Icon as={FaUser} color="gray.500" boxSize={3} />
              <Text fontSize="sm" color="gray.700">
                {order.customerName || 'N/A'}
              </Text>
            </HStack>

            {/* Services List */}
            {services.length > 0 && (
              <Box>
                <Text fontSize="xs" fontWeight="bold" color="gray.600" mb={1}>
                  Services
                </Text>
                <VStack spacing={1} align="stretch">
                  {services.map((svc, idx) => (
                    <HStack key={svc.id || idx} justify="space-between">
                      <Text fontSize="xs" color="gray.700">
                        {svc.service || svc.serviceName || 'Service'}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        {svc.weightOrCount != null ? svc.weightOrCount : '-'}
                        {svc.inputWeight ? ' lbs' : (svc.service || svc.serviceName || '').toLowerCase().includes('bag') ? ' bag' : ' pcs'}
                      </Text>
                    </HStack>
                  ))}
                </VStack>
              </Box>
            )}
          </VStack>
        </Box>

        {/* Action Buttons — New workflow layout */}
        <Box bg="white" borderRadius="lg" p={4} shadow="sm">
          <HStack justify="space-between" mb={3}>
            <Text fontSize="sm" fontWeight="bold" color="gray.700">
              Actions
            </Text>
            {/* Next step suggestion */}
            {order.orderStatus === 'ReceivedAtFacility' && !order.services?.some(s => s.weightOrCount > 0) && (
              <Badge colorScheme="purple" fontSize="2xs" variant="subtle">Next: Enter Weight</Badge>
            )}
            {order.orderStatus === 'ReceivedAtFacility' && order.services?.some(s => s.weightOrCount > 0) && !trackingRecord?.intakeRecord && (
              <Badge colorScheme="blue" fontSize="2xs" variant="subtle">Next: Scan Received</Badge>
            )}
            {order.orderStatus === 'ReceivedAtFacility' && trackingRecord?.intakeRecord && washingPhotos.length === 0 && (
              <Badge colorScheme="yellow" fontSize="2xs" variant="subtle">Next: Washing</Badge>
            )}
            {(order.orderStatus === 'ProcessingStarted' || order.orderStatus === 'Processing') && washingPhotos.length === 0 && (
              <Badge colorScheme="yellow" fontSize="2xs" variant="subtle">Next: Washing</Badge>
            )}
            {(order.orderStatus === 'ProcessingStarted' || order.orderStatus === 'Processing') && washingPhotos.length > 0 && dryingPhotos.length === 0 && (
              <Badge colorScheme="orange" fontSize="2xs" variant="subtle">Next: Drying</Badge>
            )}
            {(order.orderStatus === 'ProcessingStarted' || order.orderStatus === 'Processing') && washingPhotos.length > 0 && dryingPhotos.length > 0 && (
              <Badge colorScheme="green" fontSize="2xs" variant="subtle">Next: Fold Complete</Badge>
            )}
            {order.orderStatus === 'ProcessingCompleted' && (
              <Badge colorScheme="green" fontSize="2xs" variant="solid">✓ Processing Done</Badge>
            )}
          </HStack>
          <SimpleGrid columns={2} spacing={3}>
            {/* Row 1 */}
            <Button
              leftIcon={<FaWeight />}
              variant={order.services?.some(s => s.weightOrCount > 0) ? "solid" : "outline"}
              colorScheme="purple"
              size="md"
              minH="44px"
              fontSize="xs"
              onClick={onWeightEntryOpen}
            >
              {order.services?.some(s => s.weightOrCount > 0) ? '✓ ' : ''}Enter Weight/Count
            </Button>
            <Button
              leftIcon={<FaCamera />}
              variant={activeAction === 'received' ? 'solid' : (trackingRecord?.intakeRecord ? 'solid' : 'outline')}
              colorScheme="blue"
              size="md"
              minH="44px"
              fontSize="xs"
              onClick={() => setActiveAction(activeAction === 'received' ? null : 'received')}
            >
              {trackingRecord?.intakeRecord ? '✓ ' : '📷 '}Received Items
            </Button>
            {/* Row 2 */}
            <Button
              variant={activePhotoStep === 'washing' ? 'solid' : (washingPhotos.length > 0 ? 'solid' : 'outline')}
              colorScheme="yellow"
              size="md"
              minH="44px"
              fontSize="xs"
              onClick={() => setActivePhotoStep(activePhotoStep === 'washing' ? null : 'washing')}
            >
              {washingPhotos.length > 0 ? `✓ Washing (${washingPhotos.length})` : '🧺 Washing'}
            </Button>
            <Button
              variant={activePhotoStep === 'drying' ? 'solid' : (dryingPhotos.length > 0 ? 'solid' : 'outline')}
              colorScheme="orange"
              size="md"
              minH="44px"
              fontSize="xs"
              onClick={() => setActivePhotoStep(activePhotoStep === 'drying' ? null : 'drying')}
            >
              {dryingPhotos.length > 0 ? `✓ Drying (${dryingPhotos.length})` : '🔥 Drying'}
            </Button>
            {/* Row 3 — full width */}
            <Button
              leftIcon={<FaTshirt />}
              variant={activeAction === 'fold_complete' ? 'solid' : (order.orderStatus === 'ProcessingCompleted' || trackingRecord?.foldRecord ? 'solid' : 'outline')}
              colorScheme="green"
              size="md"
              minH="44px"
              fontSize="xs"
              gridColumn="span 2"
              onClick={() => setActiveAction(activeAction === 'fold_complete' ? null : 'fold_complete')}
            >
              {(order.orderStatus === 'ProcessingCompleted' || trackingRecord?.foldRecord) ? '✓ ' : '👕 '}Fold Complete
            </Button>
          </SimpleGrid>
        </Box>

        {/* Washing Multi-Photo Capture Section */}
        {activePhotoStep === 'washing' && (
          <Box bg="white" borderRadius="lg" p={4} shadow="sm">
            <HStack spacing={2} mb={3}>
              <Text fontSize="sm" fontWeight="bold" color="gray.700">🧺 Washing Photos</Text>
              {washingPhotos.length > 0 && (
                <Badge colorScheme="yellow" fontSize="xs">
                  {washingPhotos.length} photo{washingPhotos.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </HStack>

            {/* Hidden file input */}
            <input
              type="file"
              accept="image/*"
              ref={washingFileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleStepPhotoCapture(file, 'washing');
                e.target.value = '';
              }}
              style={{ display: 'none' }}
              aria-label="Capture washing photo"
            />

            {/* Photo Cards */}
            {washingPhotos.length > 0 && (
              <VStack spacing={2} mb={3}>
                {washingPhotos.map((photo, idx) => (
                  <Box
                    key={`washing-${idx}`}
                    bg="gray.50"
                    border="1px solid"
                    borderColor={photo.error ? 'red.200' : photo.uploaded ? 'green.200' : 'gray.200'}
                    borderRadius="lg"
                    p={2}
                    width="100%"
                  >
                    <HStack spacing={3} align="center">
                      <Box borderRadius="md" overflow="hidden" flexShrink={0} width="60px" height="60px">
                        <Image src={photo.preview} alt={`Washer ${idx + 1}`} objectFit="cover" width="60px" height="60px" />
                      </Box>
                      <VStack align="start" spacing={0} flex={1}>
                        <Text fontSize="xs" color="gray.500" fontWeight="medium">Washer {idx + 1}</Text>
                        {photo.uploading ? (
                          <HStack spacing={2}>
                            <Spinner size="xs" color="yellow.400" />
                            <Text fontSize="sm" color="yellow.600">Uploading...</Text>
                          </HStack>
                        ) : photo.uploaded ? (
                          <HStack spacing={1}>
                            <Icon as={FaCheckCircle} color="green.500" boxSize={3} />
                            <Text fontSize="sm" color="green.700">Saved</Text>
                          </HStack>
                        ) : (
                          <HStack spacing={1}>
                            <Icon as={FaExclamationTriangle} color="red.500" boxSize={3} />
                            <Text fontSize="sm" color="red.600">{photo.error}</Text>
                          </HStack>
                        )}
                      </VStack>
                      <IconButton
                        icon={<FaTrash />}
                        aria-label={`Remove washer ${idx + 1}`}
                        size="sm"
                        variant="ghost"
                        colorScheme="red"
                        onClick={() => handleRemoveStepPhoto('washing', idx)}
                        isDisabled={photo.uploading}
                      />
                    </HStack>
                  </Box>
                ))}
              </VStack>
            )}

            {/* Capture / Add button */}
            <Button
              leftIcon={washingPhotos.length === 0 ? <FaCamera /> : <FaPlus />}
              colorScheme="yellow"
              variant={washingPhotos.length === 0 ? 'outline' : 'solid'}
              size="lg"
              minH="48px"
              width="100%"
              onClick={() => washingFileInputRef.current?.click()}
              fontSize="sm"
              mb={2}
            >
              {washingPhotos.length === 0 ? 'Take Washer Photo' : 'Add Another Washer'}
            </Button>

            {/* Done button — requires at least 1 photo */}
            {washingPhotos.length > 0 && washingPhotos.some((p) => p.uploaded) && (
              <Button
                colorScheme="green"
                size="lg"
                minH="48px"
                width="100%"
                onClick={handleWashingDone}
                fontSize="sm"
              >
                ✅ Done — Move to Processing
              </Button>
            )}
          </Box>
        )}

        {/* Drying Multi-Photo Capture Section */}
        {activePhotoStep === 'drying' && (
          <Box bg="white" borderRadius="lg" p={4} shadow="sm">
            <HStack spacing={2} mb={3}>
              <Text fontSize="sm" fontWeight="bold" color="gray.700">🔥 Drying Photos</Text>
              {dryingPhotos.length > 0 && (
                <Badge colorScheme="orange" fontSize="xs">
                  {dryingPhotos.length} photo{dryingPhotos.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </HStack>

            {/* Hidden file input */}
            <input
              type="file"
              accept="image/*"
              ref={dryingFileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleStepPhotoCapture(file, 'drying');
                e.target.value = '';
              }}
              style={{ display: 'none' }}
              aria-label="Capture drying photo"
            />

            {/* Photo Cards */}
            {dryingPhotos.length > 0 && (
              <VStack spacing={2} mb={3}>
                {dryingPhotos.map((photo, idx) => (
                  <Box
                    key={`drying-${idx}`}
                    bg="gray.50"
                    border="1px solid"
                    borderColor={photo.error ? 'red.200' : photo.uploaded ? 'green.200' : 'gray.200'}
                    borderRadius="lg"
                    p={2}
                    width="100%"
                  >
                    <HStack spacing={3} align="center">
                      <Box borderRadius="md" overflow="hidden" flexShrink={0} width="60px" height="60px">
                        <Image src={photo.preview} alt={`Dryer ${idx + 1}`} objectFit="cover" width="60px" height="60px" />
                      </Box>
                      <VStack align="start" spacing={0} flex={1}>
                        <Text fontSize="xs" color="gray.500" fontWeight="medium">Dryer {idx + 1}</Text>
                        {photo.uploading ? (
                          <HStack spacing={2}>
                            <Spinner size="xs" color="orange.400" />
                            <Text fontSize="sm" color="orange.600">Uploading...</Text>
                          </HStack>
                        ) : photo.uploaded ? (
                          <HStack spacing={1}>
                            <Icon as={FaCheckCircle} color="green.500" boxSize={3} />
                            <Text fontSize="sm" color="green.700">Saved</Text>
                          </HStack>
                        ) : (
                          <HStack spacing={1}>
                            <Icon as={FaExclamationTriangle} color="red.500" boxSize={3} />
                            <Text fontSize="sm" color="red.600">{photo.error}</Text>
                          </HStack>
                        )}
                      </VStack>
                      <IconButton
                        icon={<FaTrash />}
                        aria-label={`Remove dryer ${idx + 1}`}
                        size="sm"
                        variant="ghost"
                        colorScheme="red"
                        onClick={() => handleRemoveStepPhoto('drying', idx)}
                        isDisabled={photo.uploading}
                      />
                    </HStack>
                  </Box>
                ))}
              </VStack>
            )}

            {/* Capture / Add button */}
            <Button
              leftIcon={dryingPhotos.length === 0 ? <FaCamera /> : <FaPlus />}
              colorScheme="orange"
              variant={dryingPhotos.length === 0 ? 'outline' : 'solid'}
              size="lg"
              minH="48px"
              width="100%"
              onClick={() => dryingFileInputRef.current?.click()}
              fontSize="sm"
              mb={2}
            >
              {dryingPhotos.length === 0 ? 'Take Dryer Photo' : 'Add Another Dryer'}
            </Button>

            {/* Done button */}
            {dryingPhotos.length > 0 && dryingPhotos.some((p) => p.uploaded) && (
              <Button
                colorScheme="green"
                size="lg"
                minH="48px"
                width="100%"
                onClick={() => {
                  setActivePhotoStep(null);
                  toast({
                    title: 'Drying Complete',
                    description: 'Drying photos saved.',
                    status: 'success',
                    duration: 3000,
                    isClosable: true,
                  });
                  silentFetchOrder();
                }}
                fontSize="sm"
              >
                ✅ Done
              </Button>
            )}
          </Box>
        )}

        {/* Received Items — Inline 4-angle photo grid for intake */}
        {activeAction === 'received' && (
          <Box bg="white" borderRadius="lg" p={4} shadow="sm">
            <MobileInlineUpload
              orderId={orderId}
              laundryId={laundryId}
              phase="intake"
              employeeId={employeeId}
              onComplete={() => {
                setActiveAction(null);
                fetchTrackingRecord();
                silentFetchOrder();
              }}
              onCancel={() => setActiveAction(null)}
            />
          </Box>
        )}

        {/* Fold Complete — Inline 4-angle photo grid for fold */}
        {activeAction === 'fold_complete' && (
          <Box bg="white" borderRadius="lg" p={4} shadow="sm">
            <MobileInlineUpload
              orderId={orderId}
              laundryId={laundryId}
              phase="fold"
              employeeId={employeeId}
              onComplete={() => {
                setActiveAction(null);
                fetchTrackingRecord();
                silentFetchOrder();
              }}
              onCancel={() => setActiveAction(null)}
            />
          </Box>
        )}

        {/* Item Tracking — uses same flow as desktop POS order drawer */}
        <Box id="item-tracking-section" bg="white" borderRadius="lg" p={4} shadow="sm">
          <Text fontSize="sm" fontWeight="bold" color="gray.700" mb={3}>
            Item Tracking
          </Text>
          <ItemTrackingPanel
            orderId={orderId}
            laundryId={laundryId}
            orderStatus={order.orderStatus}
            employeeId={employeeId}
            onOrderRefresh={fetchOrder}
            onCaptureActiveChange={setItemTrackingCaptureActive}
          />
        </Box>

        {/* Processing Photo Action (simple single photo for status update) */}
        {activeAction === 'processing' && (
          <Box bg="white" borderRadius="lg" p={4} shadow="sm">
            <MobilePhotoAction
              order={order}
              actionType="processing"
              targetStatus="ProcessingStarted"
              imageType="processing"
              employeeId={employeeId}
              onComplete={() => handlePhotoComplete('processing')}
            />
          </Box>
        )}

        {/* Special Instructions */}
        {order.specialInstructions && (
          <Box bg="yellow.50" borderRadius="lg" p={3} borderLeft="3px solid" borderColor="yellow.400">
            <Text fontSize="xs" fontWeight="bold" color="yellow.800" mb={1}>
              Special Instructions
            </Text>
            <Text fontSize="xs" color="gray.700">
              {order.specialInstructions}
            </Text>
          </Box>
        )}
      </VStack>

      {/* Weight/Count Entry Drawer */}
      <MobileWeightEntry
        order={order}
        laundryId={laundryId}
        employeeId={employeeId}
        isOpen={isWeightEntryOpen}
        onClose={onWeightEntryClose}
        onSaved={handleWeightSaved}
      />
    </Box>
  );
};

export default MobileOrderPage;
