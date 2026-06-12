// DriverHome.jsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Box,
  Flex,
  Text,
  Button,
  Stack,
  Spinner,
  Image,
  useToast,
  SimpleGrid,
  Badge,
  HStack,
  Link,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  NumberInput,
  NumberInputField,
} from '@chakra-ui/react';
import { PhoneIcon, ExternalLinkIcon } from '@chakra-ui/icons';
import { format, addDays, subDays } from 'date-fns';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

import { fetchDriverOrders } from './DriverOrders';
import DateFilter from './DriverDateFilter';
import SidebarLayout from './DriverSidebar';
import LocationAutocompleteInput from '../hooks/LocationAutocompleteInput';
import DriverNoDelivery from '../images/DriverNoDelivery.png';

/* ───────────────────────── Helper: convert File → base64 ───────────────────────── */
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (err) => reject(err);
  });

/* Map orderStatus → { label, color } */
const statusBadge = (status = '') => {
  switch (status.trim().toLowerCase()) {
    case 'ordersubmitted':
      return { label: 'Pickup Order', color: 'orange' };
    case 'readyforintake':
      return { label: 'Picked Up', color: 'green' };
    case 'enroutetodelivery':
      return { label: 'Delivery Order', color: 'blue' };
    case 'delivered':
      return { label: 'Delivered', color: 'purple' };
    default:
      return { label: status || 'Unknown', color: 'gray' };
  }
};

/* ─────────────────────────────── Component ─────────────────────────────── */
const DriverHome = ({ laundryId }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const authToken = localStorage.getItem('idToken');

  /* ───────────── State ───────────── */
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1); // each page = 10 orders
  const pageSize = 10;

  const [photoUploaded, setPhotoUploaded] = useState({});
  const [loadingOrderIds, setLoadingOrderIds] = useState({}); // spinner per-button

  const fileInputRef = useRef(null);
  const [pendingUploadOrderId, setPendingUploadOrderId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null); // 'upload' | 'missed'
  const [fileInputKey, setFileInputKey] = useState(Date.now());
  const [includeUberOrders, setIncludeUberOrders] = useState(false);

  /* Optimized-route modal */
  const {
    isOpen: isRouteModalOpen,
    onOpen: openRouteModal,
    onClose: closeRouteModal,
  } = useDisclosure();
  const [startLocation, setStartLocation] = useState('');
  const [endLocation, setEndLocation] = useState('');

  /* date filter */
  const today = new Date();
  const [selectedDates, setSelectedDates] = useState([
    { label: format(today, 'yyyy-MM-dd'), value: format(today, 'yyyy-MM-dd') },
  ]);
  const selectedDateValues = useMemo(() => selectedDates.map((d) => d.value), [selectedDates]);

  /* ───────────── Effects ───────────── */
  useEffect(() => {
    const loadOrders = async () => {
      setLoading(true);
      try {
        const start = format(subDays(today, 3), 'yyyy-MM-dd');
        const end = format(addDays(today, 7), 'yyyy-MM-dd');
        const data = await fetchDriverOrders(laundryId, start, end);

        const allowedStatuses = [
          'ordersubmitted',
          'readyforintake',
          'enroutetodelivery',
          'delivered',
        ];

  //       const filtered = Array.isArray(data)
  //         ? data.filter((o) => {
  //             const s = o.orderStatus?.trim().toLowerCase();
  //             // if (!o.orderId?.startsWith('O-')) return false;
  //             const isOnline = o.orderId?.startsWith('O-');
  //             const isInstore =
  // o.orderId?.startsWith('IS') &&
  // ['laundry driver'].includes(o.dropoffService?.toLowerCase());


  //             if (!isOnline && !isInstore) return false;

  //             if (!allowedStatuses.includes(s)) return false;

  //             const pickup = o.pickupDate?.split('T')[0];
  //             const dropoff = o.dropoffDate?.split('T')[0];

  //             if (['ordersubmitted', 'readyforintake'].includes(s))
  //               return selectedDateValues.includes(pickup);
  //             if (['enroutetodelivery', 'delivered'].includes(s))
  //               return selectedDateValues.includes(dropoff);
  //             return false;
  //           })
  //         : [];

  const filtered = Array.isArray(data)
  ? data.filter((o) => {
      const s = o.orderStatus?.trim().toLowerCase();
      const allowedStatuses = [
        'ordersubmitted',
        'readyforintake',
        'enroutetodelivery',
        'delivered',
      ];
      if (!allowedStatuses.includes(s)) return false;

      const isOnline = o.orderId?.startsWith('O-');
      const isInstore = o.orderId?.startsWith('IS');

      const pickupSvc  = o.pickupService?.toLowerCase();
      const dropoffSvc = o.dropoffService?.toLowerCase();

      const pickupDate  = o.pickupDate?.split('T')[0];
      const dropoffDate = o.dropoffDate?.split('T')[0];

      // Pickup leg statuses
      if (s === 'ordersubmitted' || s === 'readyforintake') {
        if (isOnline) {
          // Online: show only if pickup is handled by LaundryDriver AND pickup date is selected
          if (pickupSvc !== 'laundrydriver') return false;
          return selectedDateValues.includes(pickupDate);
        }
        if (isInstore) {
          // In-store/commercial: driver doesn’t handle pickup leg → hide
          return false;
        }
        return false;
      }

      // Dropoff leg statuses
      if (s === 'enroutetodelivery' || s === 'delivered') {
        // For both online and in-store, include only LaundryDriver dropoffs on matching dropoff date
        if (dropoffSvc !== 'laundrydriver') return false;
        return selectedDateValues.includes(dropoffDate);
      }

      return false;
    })
  : [];


        setOrders(filtered);
        setHasMore(filtered.length > pageSize * currentPage);
      } catch (err) {
        console.error(err);
        toast({
          title: 'Error',
          description: 'Unable to fetch orders.',
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [laundryId, selectedDateValues, currentPage]);

  /* ───────────── Upload helper ───────────── */
  const handleUpload = async (orderId, file, action) => {
    const key = action === 'missed' ? `miss_${orderId}` : `upload_${orderId}`;
    setLoadingOrderIds((p) => ({ ...p, [key]: true }));

    try {
      const imageBase64 = await fileToBase64(file);
      await axios.post(
        `${process.env.REACT_APP_AWS_API_URL}/api/driver/upload-image`,
        { imageBase64 },
        {
          params: { operation: 'uploadImage', laundryId, orderId },
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      toast({ title: 'Uploaded', status: 'success', duration: 3000, isClosable: true });
      setPhotoUploaded((prev) => ({ ...prev, [orderId]: true }));
    } catch (err) {
      console.error(err);
      toast({ title: 'Upload failed', status: 'error', duration: 3500, isClosable: true });
    } finally {
      setLoadingOrderIds((p) => ({ ...p, [key]: false }));
    }
  };

  /* ───────────── File-picker handler ───────────── */
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    const orderId = pendingUploadOrderId;
    setFileInputKey(Date.now()); // reset chooser

    // picker closed without selection
    if (!file || !orderId) {
      if (pendingAction === 'missed' && orderId) {
        setLoadingOrderIds((p) => ({ ...p, [`miss_${orderId}`]: false }));
      }
      setPendingUploadOrderId(null);
      setPendingAction(null);
      return;
    }

    /* preview */
    const reader = new FileReader();
    reader.onload = () =>
      setOrders((prev) =>
        prev.map((o) => (o.orderId === orderId ? { ...o, selectedFilePreview: reader.result } : o))
      );
    reader.readAsDataURL(file);

    /* 1️⃣  upload */
    await handleUpload(orderId, file, pendingAction);

    /* 2️⃣  if came from Missed, cancel order */
    if (pendingAction === 'missed') {
      try {
        await axios.put(
          `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-order`,
          { orderStatus: 'OrderCanceled' },
          {
            params: { operation: 'updateOrder', orderId, laundryId },
            headers: { Authorization: `Bearer ${authToken}` },
          }
        );
        toast({ title: 'Order canceled', status: 'success', duration: 3000, isClosable: true });
        setOrders((prev) =>
          prev.map((o) => (o.orderId === orderId ? { ...o, orderStatus: 'OrderCanceled' } : o))
        );
      } catch (err) {
        console.error(err);
        toast({
          title: 'Error',
          description: 'Unable to cancel order.',
          status: 'error',
          duration: 3500,
          isClosable: true,
        });
      } finally {
        setLoadingOrderIds((p) => ({ ...p, [`miss_${orderId}`]: false }));
      }
    }
    navigate(0)
    setPendingUploadOrderId(null);
    setPendingAction(null);
  };

  /* ───────────── Misc handlers ───────────── */
  const handleLoadMore = () => setCurrentPage((p) => p + 1);

  // const handleShowOptimizedRoute = (list, start, end) => {
  //   const valid = list.filter((o) => o.customerAddress);
  //   if (valid.length === 0) {
  //     toast({
  //       title: 'No addresses',
  //       description: 'No valid stops to map.',
  //       status: 'warning',
  //       duration: 3000,
  //       isClosable: true,
  //     });
  //     return;
  //   }
  //   const origin = encodeURIComponent(start);
  //   const destination = encodeURIComponent(end);
  //   const waypoints = valid.map((o) => encodeURIComponent(o.customerAddress)).join('|');
  //   const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving${
  //     waypoints ? `&waypoints=${waypoints}` : ''
  //   }`;
  //   window.open(url, '_blank');
  // };

  const handleShowOptimizedRoute = (list, start, end) => {
  const filtered = list.filter((o) => {
    const s = o.orderStatus?.toLowerCase();

    if (["ordersubmitted", "readyforintake"].includes(s)) {
      // pickup task
      if (!includeUberOrders && o.pickupService?.toLowerCase() === "uber") return false;
    }

    if (["enroutetodelivery", "delivered"].includes(s)) {
      // dropoff task
      if (!includeUberOrders && o.dropoffService?.toLowerCase() === "uber") return false;
    }

    return !!o.customerAddress;
  });

  if (filtered.length === 0) {
    toast({
      title: 'No addresses',
      description: includeUberOrders
        ? 'No valid stops to map.'
        : 'No non-Uber stops to include.',
      status: 'warning',
      duration: 3000,
      isClosable: true,
    });
    return;
  }

  const origin = encodeURIComponent(start);
  const destination = encodeURIComponent(end);
  const waypoints = filtered.map((o) => encodeURIComponent(o.customerAddress)).join('|');
  const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving${
    waypoints ? `&waypoints=${waypoints}` : ''
  }`;

  window.open(url, '_blank');
};

  /* slice orders for pagination */
  const displayedOrders = orders.slice(0, currentPage * pageSize);

  /* Orders eligible for routing: pickup & delivery in-progress */
  const routeOrders = orders.filter((o) =>
    ['ordersubmitted', 'enroutetodelivery'].includes(o.orderStatus?.trim().toLowerCase())
  );

  /* ───────────── Render ───────────── */
  return (
    <SidebarLayout laundryId={laundryId}>
      <Box p={[3, 4]} bg="#AADDD9" minH="100vh">
        <Flex justify="space-between" wrap="wrap" mb={4} gap={3}>
          <DateFilter
            selectedDates={selectedDates}
            setSelectedDates={setSelectedDates}
            startDate={format(subDays(today, 3), 'yyyy-MM-dd')}
            endDate={format(addDays(today, 7), 'yyyy-MM-dd')}
          />
          <Button
            colorScheme="teal"
            size="sm"
            onClick={openRouteModal}
            isDisabled={routeOrders.length === 0}
          >
            Optimized Route
          </Button>
        </Flex>

        {/* Orders list */}
        {loading ? (
          <Flex justify="center" align="center" minH="200px">
            <Spinner size="lg" />
            <Text ml={3}>Loading…</Text>
          </Flex>
        ) : displayedOrders.length === 0 ? (
          <Flex direction="column" align="center" minH="300px" textAlign="center">
            <Image src={DriverNoDelivery} alt="No orders" boxSize="110px" mb={3} />
            <Text fontSize="md" fontWeight="bold" color="gray.600">
              No orders scheduled
            </Text>
          </Flex>
        ) : (
          <Stack spacing={4}>
            {displayedOrders.map((order) => {
              const { label, color } = statusBadge(order.orderStatus || '');
              return (
                <Box
                  key={order.orderId}
                  p={3}
                  borderWidth="1px"
                  borderRadius="lg"
                  bg="#ccf0ed"
                  boxShadow="base"
                >
                  {/* Header row */}
                  <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
                    <HStack spacing={2}>
                      <Text fontWeight="semibold" fontSize="sm" color="blue.600">
                        {order.orderId}
                      </Text>
                      <Badge
                        variant="solid"
                        colorScheme={color}
                        fontSize="0.65rem"
                        textTransform="initial"
                        px={2}
                        py={1}
                        borderRadius="md"
                      >
                        {label}
                      </Badge>
                    </HStack>

<HStack spacing={2} mt={1}>
  <Badge
    variant="solid"
    colorScheme={
      ["ordersubmitted", "readyforintake"].includes(order.orderStatus?.toLowerCase())
        ? order.pickupService?.toLowerCase() === "uber"
          ? "purple"
          : "green"
        : order.dropoffService?.toLowerCase() === "uber"
        ? "purple"
        : "green"
    }
    fontSize="xs"
    px={3}
    py={1}
    borderRadius="lg"
    textTransform="uppercase"
  >
    {["ordersubmitted", "readyforintake"].includes(order.orderStatus?.toLowerCase())
      ? `Pickup: ${order.pickupService || "LaundryDriver"}`
      : `Dropoff: ${order.dropoffService || "LaundryDriver"}`}
  </Badge>
</HStack>



                    <HStack gap={1}>
                      {order.orderStatus?.toLowerCase() === 'ordersubmitted' && (
                        <Button
                          size="xs"
                          colorScheme="red"
                          isLoading={loadingOrderIds[`miss_${order.orderId}`]}
                          onClick={() => {
                            setPendingAction('missed');
                            setPendingUploadOrderId(order.orderId);
                            fileInputRef.current?.click();
                          }}
                        >
                          Missed
                        </Button>
                      )}

                      <Button
                        size="xs"
                        colorScheme="blue"
                        isLoading={loadingOrderIds[`upload_${order.orderId}`]}
                        onClick={() => {
                          setPendingAction('upload');
                          setPendingUploadOrderId(order.orderId);
                          fileInputRef.current?.click();
                        }}
                      >
                        {photoUploaded[order.orderId] ? 'Retake' : 'Upload'}
                      </Button>
                    </HStack>

                    {/* Bag count input for pickup */}
                    {['ordersubmitted', 'readyforintake'].includes(order.orderStatus?.toLowerCase()) && (
                      <HStack mt={2} spacing={2} align="center">
                        <Text fontSize="xs" fontWeight="600" color="gray.600">Bags:</Text>
                        <NumberInput
                          size="xs"
                          maxW="70px"
                          min={1}
                          max={50}
                          defaultValue={order.laundryBags || 1}
                          onChange={(val) => {
                            order._bagCount = parseInt(val) || 1;
                          }}
                        >
                          <NumberInputField />
                        </NumberInput>
                        <Button
                          size="xs"
                          colorScheme="green"
                          onClick={async () => {
                            const bags = order._bagCount || order.laundryBags || 1;
                            try {
                              await axios.put(
                                `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-order`,
                                { laundryBags: bags },
                                { params: { operation: 'updateOrder', orderId: order.orderId, laundryId, empId: '' }, headers: { Authorization: `Bearer ${authToken}` } }
                              );
                              toast({ title: `Bags updated to ${bags}`, status: 'success', duration: 2000 });
                            } catch (err) {
                              toast({ title: 'Error updating bags', status: 'error', duration: 3000 });
                            }
                          }}
                        >
                          Save
                        </Button>
                      </HStack>
                    )}

                    {/* Confirm Delivery button for dropoff orders */}
                    {order.orderStatus?.toLowerCase() === 'enroutetodelivery' && (
                      <Button
                        size="sm"
                        colorScheme="green"
                        mt={2}
                        width="100%"
                        isLoading={loadingOrderIds[`deliver_${order.orderId}`]}
                        onClick={async () => {
                          setLoadingOrderIds(p => ({ ...p, [`deliver_${order.orderId}`]: true }));
                          try {
                            await axios.put(
                              `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-order`,
                              { orderStatus: 'Delivered' },
                              { params: { operation: 'updateOrder', orderId: order.orderId, laundryId, empId: '' }, headers: { Authorization: `Bearer ${authToken}` } }
                            );
                            toast({ title: '✅ Marked as Delivered!', status: 'success', duration: 3000 });
                            navigate(0); // Refresh
                          } catch (err) {
                            toast({ title: 'Error marking delivered', status: 'error', duration: 3000 });
                          } finally {
                            setLoadingOrderIds(p => ({ ...p, [`deliver_${order.orderId}`]: false }));
                          }
                        }}
                      >
                        ✓ Confirm Delivery
                      </Button>
                    )}
                  </Flex>
                  <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={2} mt={2} fontSize="sm">
                    <Box>
                      <Text>
                        <strong>Name:</strong> {order.customerName || 'N/A'}
                      </Text>
                      <Text>
                        <strong>Phone:</strong>{' '}
                        {order.customerPhone ? (
                          <Link href={`tel:${order.customerPhone}`} color="blue.600" isExternal>
                            <HStack spacing={1}>
                              <PhoneIcon boxSize={3} />
                              <Text>{order.customerPhone}</Text>
                            </HStack>
                          </Link>
                        ) : (
                          'N/A'
                        )}
                      </Text>
                      {order.pickupDate && (
                        <Text>
                          <strong>Pickup:</strong> {order.pickupDate}
                        </Text>
                      )}
                      {order.dropoffDate && (
                        <Text>
                          <strong>Drop-off:</strong> {order.dropoffDate}
                        </Text>
                      )}
                      
                    </Box>
                    <Box>
                      <Text>
                        <strong>Address:</strong>{' '}
                        {order.customerAddress ? (
                          <Link
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                              order.customerAddress
                            )}`}
                            color="blue.600"
                            isExternal
                          >
                            <HStack spacing={1}>
                              <ExternalLinkIcon boxSize={3} />
                              <Text>{order.customerAddress}</Text>
                            </HStack>
                          </Link>
                        ) : (
                          'N/A'
                        )}
                      </Text>
                      <Text>
                        <strong>Door:</strong> {order.doorNumber || 'N/A'}
                      </Text>
                      <Text>
                        <strong>Instructions:</strong> {order.addressInstructions || 'N/A'}
                      </Text>
                    </Box>
                  </SimpleGrid>

                  {/* Photo */}
                  {(order.selectedFilePreview || order.imageUrl) && (
                    <Image
                      src={order.selectedFilePreview || order.imageUrl}
                      alt="Evidence"
                      boxSize="140px"
                      objectFit="cover"
                      borderRadius="md"
                      mt={2}
                    />
                  )}
                </Box>
              );
            })}
          </Stack>
        )}

        {/* pagination */}
        {hasMore && !loading && (
          <Flex justify="center" mt={5}>
            <Button size="sm" onClick={handleLoadMore} colorScheme="blue">
              Load More
            </Button>
          </Flex>
        )}

        {/* Route modal */}
        <Modal isOpen={isRouteModalOpen} onClose={closeRouteModal} size="md">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Enter Route Points</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Text mb={2}>
                <strong>Start Location</strong>
              </Text>
              <LocationAutocompleteInput
                value={startLocation}
                onChange={setStartLocation}
                placeholder="e.g. 123 Main St"
              />
              <Text mt={4} mb={2}>
                <strong>End Location</strong>
              </Text>
              <LocationAutocompleteInput
                value={endLocation}
                onChange={setEndLocation}
                placeholder="e.g. 789 Elm St"
              />

              {/* <Text mt={4} mb={1}>
                <strong>Include Uber Orders?</strong>
              </Text>
              <HStack spacing={4}>
                <Button
                  size="sm"
                  colorScheme={includeUberOrders ? "blue" : "gray"}
                  variant={includeUberOrders ? "solid" : "outline"}
                  onClick={() => setIncludeUberOrders(false)}
                >
                  Yes
                </Button>
                <Button
                  size="sm"
                  colorScheme={!includeUberOrders ? "red" : "gray"}
                  variant={!includeUberOrders ? "solid" : "outline"}
                  onClick={() => setIncludeUberOrders(false)}
                >
                  No
                </Button>
              </HStack> */}

            </ModalBody>
            <ModalFooter>
              <Button
                colorScheme="blue"
                onClick={() => {
                  handleShowOptimizedRoute(routeOrders, startLocation, endLocation);
                  closeRouteModal();
                }}
                isDisabled={!startLocation || !endLocation}
              >
                Generate Route
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* hidden picker */}
        <input
          key={fileInputKey}
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept="image/*"
          onChange={handleFileSelect}
        />
      </Box>
    </SidebarLayout>
  );
};

export default DriverHome;
