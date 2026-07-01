import React, { useState, useEffect, useRef } from 'react';
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
  useToast,
} from '@chakra-ui/react';
import {
  FaWeight,
  FaCamera,
  FaCheckCircle,
  FaSave,
  FaTimes,
  FaUpload,
  FaRedo,
} from 'react-icons/fa';

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
 * MobileWeightEntry — Drawer for entering weight/count values for order services.
 *
 * Displays all services on the order with appropriate numeric inputs:
 * - Weight-based services (inputWeight: true): decimal input
 * - Count-based services: integer input
 *
 * Includes a camera button to capture scale photo (reuses MobileScalePhoto pattern).
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

  // Scale photo state
  const [scalePreview, setScalePreview] = useState(null);
  const [scaleFile, setScaleFile] = useState(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploaded, setPhotoUploaded] = useState(false);

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
      setScalePreview(null);
      setScaleFile(null);
      setPhotoUploaded(false);
    }
  }, [isOpen, order]);

  // Handle value change for a service
  const handleValueChange = (index, value) => {
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

  // --- Scale Photo Handlers (reuse MobileScalePhoto pattern) ---

  const handleCaptureClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

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

    setScaleFile(file);
    setPhotoUploaded(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      setScalePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoUpload = async () => {
    if (!scaleFile || !order) return;

    setIsUploadingPhoto(true);
    try {
      const imageBase64 = await fileToBase64(scaleFile);

      const response = await axios.post(
        `${API_URL}/api/admin/photo-upload-status`,
        { imageBase64 },
        {
          params: {
            laundryId: order.laundryId,
            orderId: order.orderId,
            targetStatus: order.orderStatus, // no status change for scale photo
            empId: employeeId,
            imageType: 'weight',
          },
        }
      );

      if (response.data?.statusCode === 200 || response.status === 200) {
        setPhotoUploaded(true);
        setScaleFile(null);
        toast({
          title: 'Photo Uploaded',
          description: 'Scale photo saved successfully.',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } else {
        toast({
          title: 'Upload Failed',
          description: 'Failed to upload scale photo. Please try again.',
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
      }
    } catch (err) {
      toast({
        title: 'Upload Error',
        description: err?.response?.data?.message || 'Failed to upload photo.',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handlePhotoClear = () => {
    setScalePreview(null);
    setScaleFile(null);
    setPhotoUploaded(false);
  };

  return (
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
            {/* Scale Photo Section */}
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
                  Scale Photo (Optional)
                </Text>
                {photoUploaded && (
                  <Icon as={FaCheckCircle} color="green.500" boxSize={4} />
                )}
              </HStack>

              {/* Hidden file input */}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                aria-label="Capture scale photo"
              />

              {/* Photo preview */}
              {scalePreview && (
                <VStack spacing={2} mb={3}>
                  <Box borderRadius="md" overflow="hidden" border="1px" borderColor="gray.300">
                    <Image
                      src={scalePreview}
                      alt="Scale photo preview"
                      maxH="150px"
                      objectFit="contain"
                      width="100%"
                    />
                  </Box>
                  {!photoUploaded && scaleFile && (
                    <HStack spacing={2} width="100%">
                      <Button
                        leftIcon={<FaTimes />}
                        size="sm"
                        variant="outline"
                        colorScheme="gray"
                        minH="44px"
                        flex={1}
                        onClick={handlePhotoClear}
                        isDisabled={isUploadingPhoto}
                      >
                        Cancel
                      </Button>
                      <Button
                        leftIcon={<FaUpload />}
                        size="sm"
                        colorScheme="blue"
                        minH="44px"
                        flex={1}
                        onClick={handlePhotoUpload}
                        isLoading={isUploadingPhoto}
                        loadingText="Uploading..."
                      >
                        Upload
                      </Button>
                    </HStack>
                  )}
                  {photoUploaded && (
                    <Button
                      leftIcon={<FaRedo />}
                      size="sm"
                      variant="outline"
                      colorScheme="orange"
                      minH="44px"
                      width="100%"
                      onClick={() => {
                        handlePhotoClear();
                        handleCaptureClick();
                      }}
                    >
                      Retake
                    </Button>
                  )}
                </VStack>
              )}

              {/* Capture button */}
              {!scalePreview && (
                <Button
                  leftIcon={<FaCamera />}
                  colorScheme="blue"
                  variant="outline"
                  size="md"
                  minH="44px"
                  width="100%"
                  onClick={handleCaptureClick}
                >
                  Take Scale Photo
                </Button>
              )}
            </Box>

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
  );
};

export default MobileWeightEntry;
