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
import { useLocationBroadcaster } from '../hooks/useLocationBroadcaster';
import { getUserEmpId } from '../utils/permissions';
import DriverNoDelivery from '../images/DriverNoDelivery.png';

/* ───────────────────────── Helper: convert File → base64 ───────────────────────── */
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    // Compress image before upload for reliability
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new window.Image();
    img.onload = () => {
      // Resize to max 1200px wide while maintaining aspect ratio
      const maxWidth = 1200;
      const maxHeight = 1200;
      let width = img.width;
      let height = img.height;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      // Export as JPEG at 80% quality
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      // Send raw base64 (without data: prefix) — backend handles both formats
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = (err) => reject(err);
    img.src = URL.createObjectURL(file);
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

  /* Route assignment state */
  const [routeAssignments, setRouteAssignments] = useState(null); // {orderId: sequencePosition}
  const [assignedOrderIds, setAssignedOrderIds] = useState(null); // Set of assigned order IDs or null

  const [photoUploaded, setPhotoUploaded] = useState({});
  const [loadingOrderIds, setLoadingOrderIds] = useState({}); // spinner per-button

  const fileInputRef = useRef(null);
  const [pendingUploadOrderId, setPendingUploadOrderId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null); // 'upload' | 'missed'
  const [fileInputKey, setFileInputKey] = useState(Date.now());
  const [includeUberOrders, setIncludeUberOrders] = useState(false);
  const [laundryPhone, setLaundryPhone] = useState('');
  const [laundryAddress, setLaundryAddress] = useState('');

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

  /* ─── Wake Lock: keep screen on during active routes ─── */
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isRouteActive) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
          // Wake Lock request failed (e.g., low battery)
          console.log('Wake Lock failed:', err.message);
        }
      }
    };
    requestWakeLock();

    // Re-acquire on page visibility change (iOS releases it when tab goes background)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isRouteActive) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [isRouteActive]);

  /* ─── Location Broadcaster (live tracking) ─── */
  const empId = getUserEmpId();

  // Determine isRouteActive: true when driver has active delivery/pickup orders
  const isRouteActive = useMemo(() => {
    // Active if ANY orders are in delivery/pickup states (regardless of assignments)
    return orders.some(
      (o) => ['ordersubmitted', 'enroutetodelivery'].includes(o.orderStatus?.trim().toLowerCase())
    );
  }, [orders]);

  // Determine currentStopPosition: sequence_position of the first pending/active stop
  const currentStopPosition = useMemo(() => {
    if (!routeAssignments || !assignedOrderIds || assignedOrderIds.size === 0) return 1;
    const activeStops = orders
      .filter(
        (o) =>
          assignedOrderIds.has(o.orderId) &&
          ['ordersubmitted', 'enroutetodelivery'].includes(o.orderStatus?.trim().toLowerCase())
      )
      .sort((a, b) => (routeAssignments[a.orderId] || 999) - (routeAssignments[b.orderId] || 999));
    return activeStops.length > 0 ? (routeAssignments[activeStops[0].orderId] || 1) : 1;
  }, [orders, routeAssignments, assignedOrderIds]);

  const { permissionDenied } = useLocationBroadcaster({
    laundryId,
    driverId: empId,
    isRouteActive,
    currentStopPosition,
  });

  // Show a toast reminder if location permission was denied and route is active
  useEffect(() => {
    if (permissionDenied && isRouteActive) {
      toast({
        title: 'Location Sharing Disabled',
        description: 'Enable location access so customers can track your position.',
        status: 'warning',
        duration: 6000,
        isClosable: true,
        position: 'top',
      });
    }
  }, [permissionDenied, isRouteActive, toast]);

  // Fetch laundry contact info
  useEffect(() => {
    const fetchLaundryContact = async () => {
      try {
        const res = await axios.get(
          `${process.env.REACT_APP_AWS_API_URL}/api/admin/laundry-products-info`,
          { params: { operation: 'viewShopInfo', laundryId }, headers: { Authorization: `Bearer ${authToken}` } }
        );
        const info = res.data?.body?.data || {};
        setLaundryPhone(info.phone || info.phoneNumber || '');
        // Build address from parts
        const parts = [info.street, info.city, info.state, info.zipCode].filter(Boolean);
        setLaundryAddress(parts.join(', '));
      } catch (err) {
        // Non-critical, ignore
      }
    };
    fetchLaundryContact();
  }, [laundryId, authToken]);

  /* Check for route assignments for the current driver + date */
  useEffect(() => {
    const checkRouteAssignments = async () => {
      if (!selectedDateValues.length) return;
      const empId = getUserEmpId();

      try {
        // Check all selected dates for route assignments
        const allStops = [];
        for (const dateStr of selectedDateValues) {
          // Fetch assignments — try with empId first, then without if no results
          let response = await axios.get(
            `${process.env.REACT_APP_AWS_API_URL}/api/routes/assignments`,
            {
              params: { laundryId, date: dateStr, ...(empId ? { driverId: empId } : {}) },
              headers: { Authorization: `Bearer ${authToken}` },
            }
          );
          let assignments = response.data?.assignments || {};

          // If empId search returned results, use them keyed by empId
          let driverStops = empId ? assignments[empId] : null;

          // If no results with empId, fetch all and find this driver's stops
          // by matching against orders we can see
          if (!driverStops || driverStops.length === 0) {
            if (empId) {
              // Retry without driverId filter to get all assignments
              response = await axios.get(
                `${process.env.REACT_APP_AWS_API_URL}/api/routes/assignments`,
                {
                  params: { laundryId, date: dateStr },
                  headers: { Authorization: `Bearer ${authToken}` },
                }
              );
              assignments = response.data?.assignments || {};
            }
            // Take the first driver's assignments (for single-driver laundries this is fine)
            // Or match by checking which assignments contain orders from our orders list
            const allDriverIds = Object.keys(assignments);
            for (const dId of allDriverIds) {
              const stops = assignments[dId];
              if (stops && stops.length > 0) {
                // Check if any of these orders are in our visible orders
                const matchesOurOrders = stops.some((s) =>
                  orders.some((o) => o.orderId === s.orderId)
                );
                if (matchesOurOrders) {
                  driverStops = stops;
                  break;
                }
              }
            }
          }

          if (driverStops && driverStops.length > 0) {
            allStops.push(...driverStops);
          }
        }

        if (allStops.length > 0) {
          // Build lookup maps from all dates
          const seqMap = {};
          const idSet = new Set();
          allStops.forEach((s) => {
            seqMap[s.orderId] = s.sequencePosition;
            idSet.add(s.orderId);
          });
          setRouteAssignments(seqMap);
          setAssignedOrderIds(idSet);
        } else {
          setRouteAssignments(null);
          setAssignedOrderIds(null);
        }
      } catch (err) {
        // If route assignments not available, just ignore and show all orders
        console.log('No route assignments found or API unavailable');
        setRouteAssignments(null);
        setAssignedOrderIds(null);
      }
    };
    checkRouteAssignments();
  }, [laundryId, selectedDateValues, authToken]);

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
        'processingcompleted',
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
          const normalizedPickup = pickupSvc?.replace(/\s/g, '') || '';
          if (normalizedPickup !== 'laundrydriver') return false;
          return selectedDateValues.includes(pickupDate);
        }
        if (isInstore) {
          // In-store/commercial: driver doesn’t handle pickup leg → hide
          return false;
        }
        return false;
      }

      // Dropoff leg statuses
      if (s === 'enroutetodelivery' || s === 'delivered' || s === 'processingcompleted') {
        // For both online and in-store, include only LaundryDriver dropoffs on matching dropoff date
        const normalizedDropoff = dropoffSvc?.replace(/\s/g, '') || '';
        if (normalizedDropoff !== 'laundrydriver') return false;
        return selectedDateValues.includes(dropoffDate);
      }

      return false;
    })
  : [];

        // If route assignments exist, filter to only assigned stops and sort by sequence
        let finalOrders = filtered;
        if (assignedOrderIds && assignedOrderIds.size > 0) {
          finalOrders = filtered
            .filter((o) => assignedOrderIds.has(o.orderId))
            .sort((a, b) => (routeAssignments[a.orderId] || 999) - (routeAssignments[b.orderId] || 999));
        }

        setOrders(finalOrders);
        setHasMore(finalOrders.length > pageSize * currentPage);
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
  }, [laundryId, selectedDateValues, currentPage, assignedOrderIds, routeAssignments]);

  /* ───────────── Unassigned orders (Available pool) ───────────── */
  const [unassignedOrders, setUnassignedOrders] = useState([]);
  const [claimingOrderId, setClaimingOrderId] = useState(null);

  useEffect(() => {
    const fetchUnassigned = async () => {
      if (!selectedDateValues.length) return;
      // Only fetch unassigned orders if the driver has route assignments
      // (meaning admin has done some assignment but may have missed orders)
      if (!assignedOrderIds || assignedOrderIds.size === 0) {
        setUnassignedOrders([]);
        return;
      }
      const dateStr = selectedDateValues[0];
      try {
        const res = await axios.get(
          `${process.env.REACT_APP_AWS_API_URL}/api/routes/unassigned`,
          {
            params: { laundryId, date: dateStr },
            headers: { Authorization: `Bearer ${authToken}` },
          }
        );
        setUnassignedOrders(res.data?.unassignedOrders || []);
      } catch (err) {
        console.log('Unable to fetch unassigned orders');
        setUnassignedOrders([]);
      }
    };
    fetchUnassigned();
  }, [laundryId, selectedDateValues, authToken, assignedOrderIds]);

  const handleClaimOrder = async (orderId) => {
    const empId = getUserEmpId();
    if (!empId || !selectedDateValues.length) return;
    setClaimingOrderId(orderId);
    try {
      await axios.post(
        `${process.env.REACT_APP_AWS_API_URL}/api/routes/claim`,
        { laundryId, date: selectedDateValues[0], orderId, driverId: empId },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      toast({ title: 'Order claimed!', status: 'success', duration: 2000, isClosable: true });
      // Remove from unassigned list and add to assigned
      setUnassignedOrders(prev => prev.filter(o => o.orderId !== orderId));
      setAssignedOrderIds(prev => {
        const next = new Set(prev);
        next.add(orderId);
        return next;
      });
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to claim order';
      toast({ title: msg, status: 'error', duration: 3000, isClosable: true });
    } finally {
      setClaimingOrderId(null);
    }
  };

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

  /* slice orders for pagination — backend already filters by driver assignments */
  const displayedOrders = useMemo(() => {
    return orders.slice(0, currentPage * pageSize);
  }, [orders, currentPage, pageSize]);

  /* Orders eligible for routing: pickup & delivery in-progress */
  const routeOrders = orders.filter((o) =>
    ['ordersubmitted', 'enroutetodelivery'].includes(o.orderStatus?.trim().toLowerCase())
  );

  /* ───────────── Render ───────────── */
  return (
    <SidebarLayout laundryId={laundryId}>
      <Box p={[3, 4]} bg="white" minH="100vh">
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
          {/* Navigate button for route assignments */}
          {assignedOrderIds && assignedOrderIds.size > 0 && (
            <Button
              colorScheme="blue"
              size="sm"
              onClick={() => {
                const assignedStops = orders
                  .filter((o) => assignedOrderIds.has(o.orderId) && o.customerAddress)
                  .sort((a, b) => (routeAssignments[a.orderId] || 999) - (routeAssignments[b.orderId] || 999));
                if (assignedStops.length === 0) {
                  toast({ title: 'No addresses', status: 'warning', duration: 3000 });
                  return;
                }
                const waypoints = assignedStops.map((o) => encodeURIComponent(o.customerAddress)).join('|');
                const url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&waypoints=${waypoints}`;
                window.open(url, '_blank');
              }}
            >
              🧭 Navigate
            </Button>
          )}
        </Flex>

        {/* Start Route button - shown when driver has delivery/pickup orders to start */}
        {orders.length > 0 && orders.some(
          (o) => ['enroutetodelivery', 'processingcompleted', 'ordersubmitted'].includes(o.orderStatus?.trim().toLowerCase())
        ) && (
          <Button
            colorScheme="orange"
            size="md"
            width="100%"
            mb={3}
            isLoading={loadingOrderIds['start_route']}
            onClick={async () => {
              setLoadingOrderIds(p => ({ ...p, start_route: true }));
              try {
                // Pass the first delivery-eligible order from what the driver sees
                const firstDeliveryOrder = orders.find(
                  (o) => ['enroutetodelivery', 'processingcompleted', 'ordersubmitted'].includes(o.orderStatus?.trim().toLowerCase())
                );
                const response = await axios.post(
                  `${process.env.REACT_APP_AWS_API_URL}/api/tracking/start-route`,
                  { orderId: firstDeliveryOrder?.orderId || null },
                  { headers: { Authorization: `Bearer ${authToken}` } }
                );
                if (response.data.status === 'success') {
                  toast({ title: '🚗 Route Started!', description: 'First customer notified.', status: 'success', duration: 4000 });
                  navigate(0); // Refresh to show updated statuses
                } else {
                  toast({ title: response.data.message || 'No stops to start', status: 'info', duration: 3000 });
                }
              } catch (err) {
                toast({ title: 'Error starting route', status: 'error', duration: 3000 });
              } finally {
                setLoadingOrderIds(p => ({ ...p, start_route: false }));
              }
            }}
          >
            🚀 Start Route
          </Button>
        )}

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
                  bg="#F7FAFC"
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

                    {/* Confirm Pickup button for pickup orders */}
                    {order.orderStatus?.toLowerCase() === 'ordersubmitted' && (
                      <Button
                        size="sm"
                        colorScheme="teal"
                        mt={2}
                        width="100%"
                        isLoading={loadingOrderIds[`pickup_${order.orderId}`]}
                        onClick={async () => {
                          setLoadingOrderIds(p => ({ ...p, [`pickup_${order.orderId}`]: true }));
                          try {
                            const bags = order._bagCount || order.laundryBags || 1;
                            await axios.put(
                              `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-order`,
                              { orderStatus: 'ReadyForIntake', laundryBags: bags },
                              { params: { operation: 'updateOrder', orderId: order.orderId, laundryId, empId: '' }, headers: { Authorization: `Bearer ${authToken}` } }
                            );
                            toast({ title: '✅ Pickup Confirmed!', status: 'success', duration: 3000 });
                            // Fire-and-forget: deactivate tracking for this order
                            axios.post(
                              `${process.env.REACT_APP_AWS_API_URL}/api/tracking/deactivate`,
                              { orderId: order.orderId },
                              { headers: { Authorization: `Bearer ${authToken}` } }
                            ).catch(() => {}); // silently ignore errors
                            setOrders((prev) =>
                              prev.map((o) => (o.orderId === order.orderId ? { ...o, orderStatus: 'ReadyForIntake', laundryBags: bags } : o))
                            );
                          } catch (err) {
                            console.error(err);
                            toast({ title: 'Error confirming pickup', status: 'error', duration: 3000 });
                          } finally {
                            setLoadingOrderIds(p => ({ ...p, [`pickup_${order.orderId}`]: false }));
                          }
                        }}
                      >
                        ✓ Confirm Pickup
                      </Button>
                    )}

                    {/* Confirm Delivery button for dropoff orders */}
                    {order.orderStatus?.toLowerCase() === 'enroutetodelivery' && (
                      <Button
                        size="sm"
                        colorScheme="green"
                        mt={2}
                        width="100%"
                        isLoading={loadingOrderIds[`deliver_${order.orderId}`]}
                        isDisabled={!photoUploaded[order.orderId]}
                        title={!photoUploaded[order.orderId] ? 'Upload delivery photo first' : ''}
                        onClick={async () => {
                          setLoadingOrderIds(p => ({ ...p, [`deliver_${order.orderId}`]: true }));
                          try {
                            await axios.put(
                              `${process.env.REACT_APP_AWS_API_URL}/api/admin/update-order`,
                              { orderStatus: 'Delivered' },
                              { params: { operation: 'updateOrder', orderId: order.orderId, laundryId, empId: '' }, headers: { Authorization: `Bearer ${authToken}` } }
                            );
                            toast({ title: '✅ Marked as Delivered!', status: 'success', duration: 3000 });
                            // Fire-and-forget: deactivate tracking for this order
                            axios.post(
                              `${process.env.REACT_APP_AWS_API_URL}/api/tracking/deactivate`,
                              { orderId: order.orderId },
                              { headers: { Authorization: `Bearer ${authToken}` } }
                            ).catch(() => {});
                            // Fire-and-forget: notify next customer in route
                            const dateStr = selectedDateValues[0] || format(new Date(), 'yyyy-MM-dd');
                            axios.post(
                              `${process.env.REACT_APP_AWS_API_URL}/api/tracking/notify-next`,
                              { date: dateStr, completedOrderId: order.orderId },
                              { headers: { Authorization: `Bearer ${authToken}` } }
                            ).catch(() => {});
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

        {/* ───────────── Available (Unassigned) Orders ───────────── */}
        {unassignedOrders.length > 0 && (
          <Box mt={6}>
            <HStack mb={3}>
              <Badge colorScheme="orange" fontSize="sm" px={2} py={1}>Available</Badge>
              <Text fontSize="sm" color="gray.600">
                {unassignedOrders.length} unassigned order{unassignedOrders.length > 1 ? 's' : ''} — tap Claim to add to your route
              </Text>
            </HStack>
            <Stack spacing={3}>
              {unassignedOrders.map((order) => {
                const { label, color } = statusBadge(order.orderStatus || '');
                return (
                  <Box
                    key={order.orderId}
                    p={3}
                    borderWidth="2px"
                    borderColor="orange.200"
                    borderRadius="lg"
                    bg="orange.50"
                    boxShadow="sm"
                  >
                    <Flex justify="space-between" align="center" mb={1}>
                      <HStack>
                        <Badge colorScheme={color} fontSize="xs">{label}</Badge>
                        <Text fontWeight="bold" fontSize="sm">{order.orderId}</Text>
                      </HStack>
                      <Button
                        size="sm"
                        colorScheme="green"
                        onClick={() => handleClaimOrder(order.orderId)}
                        isLoading={claimingOrderId === order.orderId}
                      >
                        Claim
                      </Button>
                    </Flex>
                    <Text fontSize="sm">{order.customerName}</Text>
                    {order.address && (
                      <Text fontSize="xs" color="gray.600" noOfLines={1}>{order.address}</Text>
                    )}
                  </Box>
                );
              })}
            </Stack>
          </Box>
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

        {/* Laundry Contact Info */}
        <Box mt={6} p={4} bg="gray.50" borderRadius="md" borderWidth="1px" textAlign="center">
          <Text fontSize="xs" color="gray.500" fontWeight="bold" mb={1}>Need Help? Contact Laundry</Text>
          <Text fontSize="sm" color="gray.600">
            Call or text the laundry if you have questions about pickups or deliveries.
          </Text>
          {laundryAddress && (
            <Text fontSize="sm" color="gray.700" mt={1}>
              📍 {laundryAddress}
            </Text>
          )}
          {laundryPhone && (
            <Link href={`tel:${laundryPhone}`} color="blue.600" fontWeight="bold" fontSize="sm" mt={1} display="block">
              📞 {laundryPhone}
            </Link>
          )}
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default DriverHome;
