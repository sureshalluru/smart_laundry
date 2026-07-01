import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Image,
  useToast,
  Spinner,
  Icon,
} from '@chakra-ui/react';
import {
  FaCamera,
  FaRedo,
  FaUpload,
  FaTimes,
  FaCheckCircle,
} from 'react-icons/fa';
import ItemTrackingPanel from '../ItemTracking/ItemTrackingPanel';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Converts a File to a base64 data URL string.
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * MobilePhotoAction — Reusable camera-capture + upload + auto-status-change component.
 *
 * Handles the full flow: trigger camera → preview → upload to photo-upload-status endpoint
 * → show success toast → optionally show ItemTrackingPanel for vision results.
 *
 * Props:
 * - order: Order object with orderId, laundryId, etc.
 * - actionType: 'scan_received' | 'processing' | 'fold_complete'
 * - targetStatus: The status the order should transition to on success
 * - imageType: S3 folder/type tag (e.g., 'scan_received', 'processing', 'fold_complete')
 * - employeeId: The authenticated employee's ID for audit trail
 * - onComplete: Callback invoked after successful upload (refresh order)
 */
const MobilePhotoAction = ({
  order,
  actionType,
  targetStatus,
  imageType,
  employeeId,
  onComplete,
}) => {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [cameraError, setCameraError] = useState(false);
  const [visionPending, setVisionPending] = useState(false);
  const [showTracking, setShowTracking] = useState(false);

  // Whether this action type triggers vision AI
  const hasVision = actionType === 'scan_received' || actionType === 'fold_complete';

  const handleCaptureClick = () => {
    setCameraError(false);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setCameraError(true);
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

    setCameraError(false);
    setSelectedFile(file);
    setUploadSuccess(false);
    setUploadError(null);
    setShowTracking(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target.result);
    };
    reader.onerror = () => {
      setCameraError(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !order) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const imageBase64 = await fileToBase64(selectedFile);

      const response = await axios.post(
        `${API_URL}/api/admin/photo-upload-status`,
        { imageBase64 },
        {
          params: {
            laundryId: order.laundryId,
            orderId: order.orderId,
            targetStatus,
            empId: employeeId,
            imageType,
          },
        }
      );

      const data = response.data?.body || response.data;

      if (response.data?.statusCode === 200 || response.status === 200) {
        setUploadSuccess(true);
        setSelectedFile(null);
        setPreviewUrl(null);

        toast({
          title: 'Photo Uploaded',
          description: `Status updated to ${targetStatus}.`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });

        // Check if vision results are pending
        if (hasVision && data?.visionPending) {
          setVisionPending(true);
          setShowTracking(true);
        }

        if (onComplete) {
          onComplete();
        }
      } else if (response.data?.statusCode === 400 && data?.photoUploaded) {
        // Payment gate blocked the status transition but photo was saved
        const errorMsg = data?.message || 'Payment required';
        setUploadError(errorMsg);
        toast({
          title: 'Status Transition Blocked',
          description: 'Photo saved, but status transition blocked — payment required',
          status: 'warning',
          duration: 5000,
          isClosable: true,
        });
      } else {
        setUploadError('Upload failed. Please try again.');
        toast({
          title: 'Upload Failed',
          description: 'Failed to upload photo. Please try again.',
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
      }
    } catch (err) {
      const errBody = err?.response?.data?.body || err?.response?.data || {};
      const errMsg =
        errBody?.message ||
        err?.response?.data?.message ||
        'Failed to upload photo. Please try again.';

      // Check if this is a payment gate error where the photo was still saved
      const isPaymentGateError =
        (err?.response?.status === 400 || err?.response?.data?.statusCode === 400) &&
        (errBody?.photoUploaded === true || errMsg?.toLowerCase().includes('payment'));

      if (isPaymentGateError) {
        setUploadError(errMsg);
        toast({
          title: 'Status Transition Blocked',
          description: 'Photo saved, but status transition blocked — payment required',
          status: 'warning',
          duration: 5000,
          isClosable: true,
        });
      } else {
        setUploadError(errMsg);
        toast({
          title: 'Upload Error',
          description: errMsg,
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetry = () => {
    // Retry upload with same captured photo
    handleUpload();
  };

  const handleRetake = () => {
    setUploadSuccess(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadError(null);
    setShowTracking(false);
    setVisionPending(false);
    handleCaptureClick();
  };

  const getActionLabel = useCallback(() => {
    switch (actionType) {
      case 'scan_received':
        return 'Scan Received';
      case 'processing':
        return 'Processing';
      case 'fold_complete':
        return 'Fold Complete';
      default:
        return 'Take Photo';
    }
  }, [actionType]);

  const getColorScheme = useCallback(() => {
    switch (actionType) {
      case 'scan_received':
        return 'cyan';
      case 'processing':
        return 'yellow';
      case 'fold_complete':
        return 'teal';
      default:
        return 'blue';
    }
  }, [actionType]);

  // Display states
  const showPreview = previewUrl && selectedFile && !uploadSuccess;
  const showSuccess = uploadSuccess && !previewUrl;

  return (
    <Box>
      {/* Hidden file input for camera capture */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-label={`Capture photo for ${getActionLabel()}`}
      />

      <VStack spacing={4} align="stretch">
        {/* Camera permission denied message */}
        {cameraError && (
          <Box bg="orange.50" border="1px" borderColor="orange.200" p={3} borderRadius="md">
            <Text fontSize="sm" color="orange.700" fontWeight="medium">
              Camera access required
            </Text>
            <Text fontSize="xs" color="orange.600" mt={1}>
              Please allow camera access in your browser settings.
            </Text>
          </Box>
        )}

        {/* Upload error with retry */}
        {uploadError && !isUploading && (
          <Box bg="red.50" border="1px" borderColor="red.200" p={3} borderRadius="md">
            <Text fontSize="sm" color="red.700" fontWeight="medium">
              {uploadError}
            </Text>
            {selectedFile && (
              <Button
                size="sm"
                colorScheme="red"
                variant="outline"
                mt={2}
                onClick={handleRetry}
              >
                Retry Upload
              </Button>
            )}
          </Box>
        )}

        {/* Preview before upload */}
        {showPreview && (
          <VStack spacing={3}>
            <Box borderRadius="md" overflow="hidden" border="1px" borderColor="blue.200">
              <Image
                src={previewUrl}
                alt="Photo preview"
                maxH="200px"
                objectFit="contain"
                width="100%"
              />
            </Box>
            <HStack spacing={3} width="100%">
              <Button
                leftIcon={<FaTimes />}
                colorScheme="gray"
                variant="outline"
                size="lg"
                minH="44px"
                flex={1}
                onClick={handleCancel}
                isDisabled={isUploading}
              >
                Cancel
              </Button>
              <Button
                leftIcon={<FaUpload />}
                colorScheme={getColorScheme()}
                size="lg"
                minH="44px"
                flex={1}
                onClick={handleUpload}
                isLoading={isUploading}
                loadingText="Uploading..."
              >
                Upload
              </Button>
            </HStack>
          </VStack>
        )}

        {/* Success state */}
        {showSuccess && (
          <VStack spacing={3}>
            <HStack spacing={2} justify="center" py={2}>
              <Icon as={FaCheckCircle} color="green.500" boxSize={5} />
              <Text fontSize="sm" color="green.600" fontWeight="medium">
                Photo uploaded successfully
              </Text>
            </HStack>
            <Button
              leftIcon={<FaRedo />}
              colorScheme="orange"
              variant="outline"
              size="lg"
              minH="44px"
              width="100%"
              onClick={handleRetake}
            >
              Retake Photo
            </Button>
          </VStack>
        )}

        {/* Vision pending loading state */}
        {visionPending && showTracking && (
          <Box bg="blue.50" border="1px" borderColor="blue.200" p={3} borderRadius="md">
            <HStack spacing={2} mb={2}>
              <Spinner size="sm" color="blue.500" />
              <Text fontSize="sm" color="blue.700" fontWeight="medium">
                Analyzing items with AI...
              </Text>
            </HStack>
            <Text fontSize="xs" color="blue.600">
              Vision results will appear below shortly.
            </Text>
          </Box>
        )}

        {/* ItemTrackingPanel for vision results (scan_received / fold_complete) */}
        {showTracking && hasVision && order && (
          <ItemTrackingPanel
            orderId={order.orderId}
            laundryId={order.laundryId}
            orderStatus={order.orderStatus}
            employeeId={employeeId}
          />
        )}

        {/* Capture button (shown when no preview and no success state) */}
        {!showPreview && !showSuccess && (
          <Button
            leftIcon={<FaCamera />}
            colorScheme={getColorScheme()}
            size="lg"
            minH="44px"
            width="100%"
            onClick={handleCaptureClick}
          >
            {getActionLabel()}
          </Button>
        )}

        {/* Loading overlay */}
        {isUploading && (
          <HStack justify="center" spacing={2} py={2}>
            <Spinner size="sm" color="blue.500" />
            <Text fontSize="xs" color="gray.500">Uploading photo and updating status...</Text>
          </HStack>
        )}
      </VStack>
    </Box>
  );
};

export default MobilePhotoAction;
