import React, { useState, useRef } from 'react';
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
import { FaCamera, FaRedo, FaUpload, FaTimes, FaCheckCircle } from 'react-icons/fa';

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
 * MobileScalePhoto — camera capture and upload for scale photos.
 *
 * Props:
 * - order: { orderId, laundryId, scalePhoto, scalePhotoUrl }
 * - onPhotoUploaded: () => void — callback notifies parent on successful upload
 */
const MobileScalePhoto = ({ order, onPhotoUploaded }) => {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const [cameraError, setCameraError] = useState(false);
  const [detectedWeight, setDetectedWeight] = useState(null);
  const [detectingWeight, setDetectingWeight] = useState(false);

  const existingPhoto = order?.scalePhoto || order?.scalePhotoUrl;

  const handleCaptureClick = () => {
    setCameraError(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if camera access was denied (some browsers fire change with no file)
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

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'File Too Large',
        description: 'Photo must be less than 10MB. Please retake with lower resolution.',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
      return;
    }

    setCameraError(false);
    setSelectedFile(file);
    setUploadedUrl(null);

    // Generate preview
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !order) return;

    setIsUploading(true);
    try {
      const authToken = localStorage.getItem('idToken');
      const imageBase64 = await fileToBase64(selectedFile);

      const response = await axios.post(
        `${API_URL}/api/driver/upload-image`,
        { imageBase64 },
        {
          params: {
            operation: 'uploadImage',
            laundryId: order.laundryId,
            orderId: order.orderId,
            imageType: 'weight',
          },
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      if (response.data?.statusCode === 200 || response.status === 200) {
        const photoUrl = response.data?.body?.imageUrl || response.data?.imageUrl || previewUrl;
        setUploadedUrl(photoUrl);
        setSelectedFile(null);
        setPreviewUrl(null);

        toast({
          title: 'Photo Uploaded',
          description: 'Scale photo saved. Detecting weight...',
          status: 'success',
          duration: 2000,
          isClosable: true,
        });

        // Call Claude Vision to detect weight from the scale photo
        setDetectingWeight(true);
        try {
          const detectRes = await axios.post(
            `${API_URL}/api/item-tracking/detect-weight`,
            { imageBase64, orderId: order.orderId, laundryId: order.laundryId },
            { headers: { Authorization: `Bearer ${authToken}` } }
          );
          const body = detectRes.data?.body || detectRes.data || {};
          const weight = body.weight;
          const confidence = body.confidence || 0;

          if (weight && weight > 0) {
            setDetectedWeight(weight);
            toast({
              title: `Weight Detected: ${weight} lbs`,
              description: confidence > 80 ? `Confidence: ${confidence}%` : 'Low confidence — please verify',
              status: confidence > 80 ? 'success' : 'warning',
              duration: 5000,
              isClosable: true,
            });
          } else {
            toast({
              title: 'Could not detect weight',
              description: 'Please enter weight manually.',
              status: 'warning',
              duration: 4000,
              isClosable: true,
            });
          }
        } catch (detectErr) {
          console.error('Weight detection error:', detectErr);
          toast({
            title: 'Weight detection unavailable',
            description: 'Photo saved. Please enter weight manually.',
            status: 'info',
            duration: 4000,
            isClosable: true,
          });
        } finally {
          setDetectingWeight(false);
        }

        if (onPhotoUploaded) {
          onPhotoUploaded();
        }
      } else {
        toast({
          title: 'Upload Failed',
          description: 'Failed to upload photo. Please try again.',
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
      }
    } catch (err) {
      toast({
        title: 'Upload Error',
        description: err?.response?.data?.message || 'Failed to upload photo. Please try again.',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetake = () => {
    setUploadedUrl(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    handleCaptureClick();
  };

  // Determine what to display
  const showExistingPhoto = existingPhoto && !previewUrl && !uploadedUrl;
  const showUploadedPhoto = uploadedUrl && !previewUrl;
  const showPreview = previewUrl && selectedFile;

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
        aria-label="Capture scale photo"
      />

      <VStack spacing={4} align="stretch">
        <HStack spacing={3} align="center">
          <Icon as={FaCamera} color="blue.500" boxSize={5} />
          <Text fontSize="sm" fontWeight="bold" color="gray.700">
            Scale Photo
          </Text>
          {(existingPhoto || uploadedUrl) && (
            <Icon as={FaCheckCircle} color="green.500" boxSize={4} />
          )}
        </HStack>

        {/* Camera permission denied message */}
        {cameraError && (
          <Box bg="orange.50" border="1px" borderColor="orange.200" p={3} borderRadius="md">
            <Text fontSize="sm" color="orange.700" fontWeight="medium">
              Camera access required
            </Text>
            <Text fontSize="xs" color="orange.600" mt={1}>
              Please allow camera access in your browser settings. Go to Settings → Safari/Chrome → Camera and enable access for this site.
            </Text>
          </Box>
        )}

        {/* Existing photo display */}
        {showExistingPhoto && (
          <VStack spacing={3}>
            <Box borderRadius="md" overflow="hidden" border="1px" borderColor="gray.200">
              <Image
                src={existingPhoto}
                alt="Current scale photo"
                maxH="200px"
                objectFit="contain"
                width="100%"
              />
            </Box>
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

        {/* Uploaded photo display */}
        {showUploadedPhoto && (
          <VStack spacing={3}>
            <Box borderRadius="md" overflow="hidden" border="1px" borderColor="green.200">
              <Image
                src={uploadedUrl}
                alt="Uploaded scale photo"
                maxH="200px"
                objectFit="contain"
                width="100%"
              />
            </Box>
            <Text fontSize="xs" color="green.600" textAlign="center">
              Photo uploaded successfully
            </Text>
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
                colorScheme="blue"
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

        {/* Capture button (shown when no preview and no uploaded photo) */}
        {!showPreview && !showExistingPhoto && !showUploadedPhoto && (
          <Button
            leftIcon={<FaCamera />}
            colorScheme="blue"
            size="lg"
            minH="44px"
            width="100%"
            onClick={handleCaptureClick}
          >
            Take Scale Photo
          </Button>
        )}

        {/* Loading overlay */}
        {isUploading && (
          <HStack justify="center" spacing={2} py={2}>
            <Spinner size="sm" color="blue.500" />
            <Text fontSize="xs" color="gray.500">Uploading photo...</Text>
          </HStack>
        )}

        {/* Weight detection in progress */}
        {detectingWeight && (
          <HStack justify="center" spacing={2} py={2} bg="blue.50" borderRadius="md" p={3}>
            <Spinner size="sm" color="blue.500" />
            <Text fontSize="sm" color="blue.700" fontWeight="medium">Detecting weight from scale...</Text>
          </HStack>
        )}

        {/* Detected weight display */}
        {detectedWeight && !detectingWeight && (
          <Box bg="green.50" border="1px" borderColor="green.200" p={3} borderRadius="md" textAlign="center">
            <Text fontSize="lg" fontWeight="bold" color="green.700">
              ⚖️ {detectedWeight} lbs
            </Text>
            <Text fontSize="xs" color="green.600">Detected from scale photo</Text>
          </Box>
        )}
      </VStack>
    </Box>
  );
};

export default MobileScalePhoto;
