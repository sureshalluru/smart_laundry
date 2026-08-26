import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Flex,
  Text,
  Spinner,
  Image,
  Alert,
  AlertIcon,
  AlertDescription,
  VStack,
  Badge,
  useToast,
} from '@chakra-ui/react';
import { GoogleMap, Marker, DirectionsRenderer } from '@react-google-maps/api';
import axios from 'axios';
import { useGoogleMaps } from '../Components/Contexts/GoogleMapsProvider';
import ProgressBar from '../Components/Tracking/ProgressBar';
import { formatEta } from '../Components/Tracking/formatEta';
import { lerp, easeInOut, isArriving } from '../utils/trackingUtils';

const API_URL = process.env.REACT_APP_AWS_API_URL;
const POLL_INTERVAL = 10000; // 10 seconds
const MAX_CONSECUTIVE_FAILURES = 3;
const STALE_THRESHOLD_MS = 60000; // 60 seconds
const ANIMATION_DURATION = 2000; // 2 seconds for smoother animation

const mapContainerStyle = {
  width: '100%',
  height: '400px',
};

const defaultCenter = { lat: 30.5, lng: -97.7 };

/**
 * Car icon for driver marker — rotated based on heading.
 */
function getCarIcon(heading = 0) {
  return {
    path: 'M29.395,0H17.636c-3.117,0-5.643,3.467-5.643,6.584v34.804c0,3.116,2.526,5.644,5.643,5.644h11.759c3.116,0,5.644-2.527,5.644-5.644V6.584C35.037,3.467,32.511,0,29.395,0z M17.636,10.062h11.759v5.644H17.636V10.062z',
    fillColor: '#4285F4',
    fillOpacity: 1,
    strokeWeight: 1,
    strokeColor: '#2563EB',
    scale: 0.5,
    anchor: { x: 24, y: 24 },
    rotation: heading,
  };
}

export default function TrackingPage() {
  const { laundryId, orderId } = useParams();
  const { isLoaded } = useGoogleMaps();

  // Order state
  const [orderStatus, setOrderStatus] = useState(null);
  const [isTrackable, setIsTrackable] = useState(false);
  const [customerAddress, setCustomerAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orderError, setOrderError] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);

  // Tracking state
  const [driverPosition, setDriverPosition] = useState(null);
  const [animatedPosition, setAnimatedPosition] = useState(null);
  const [driverName, setDriverName] = useState('');
  const [trackingStatus, setTrackingStatus] = useState(null); // 'active', 'unavailable'
  const [unavailableReason, setUnavailableReason] = useState(null);
  const [directions, setDirections] = useState(null);
  const [eta, setEta] = useState(null);
  const [connectionLost, setConnectionLost] = useState(false);

  // Stale & arrival detection
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const [isStale, setIsStale] = useState(false);
  const [hasShownArrival, setHasShownArrival] = useState(false);
  const [driverHeading, setDriverHeading] = useState(0);
  const toast = useToast();

  // Refs
  const consecutiveFailuresRef = useRef(0);
  const pollIntervalRef = useRef(null);
  const animationFrameRef = useRef(null);
  const previousPositionRef = useRef(null);
  const staleTimerRef = useRef(null);

  /**
   * Fetch order details on mount to determine trackability.
   */
  useEffect(() => {
    async function fetchOrderDetails() {
      try {
        const response = await axios.get(`${API_URL}/api/customer/get-order-id-info`, {
          params: {
            operation: 'getCustomerOrderInfo',
            orderId,
            laundryId,
          },
        });

        const order = response.data?.body?.data || response.data?.order || response.data;
        const status = order.orderStatus || order.order_status || order.status;
        setOrderStatus(status);

        // Determine trackability
        const pickupSvc = (order.pickupService || order.pickup_service || '').replace(/\s/g, '').toLowerCase();
        const dropoffSvc = (order.dropoffService || order.dropoff_service || '').replace(/\s/g, '').toLowerCase();

        const pickupTrackable = status === 'OrderSubmitted' && pickupSvc === 'laundrydriver';
        const deliveryTrackable = status === 'EnRouteToDelivery' && dropoffSvc === 'laundrydriver';

        setIsTrackable(pickupTrackable || deliveryTrackable);
        setOrderDetails(order);

        // Get customer address coordinates for destination marker
        if (order.customerLat && order.customerLng) {
          setCustomerAddress({ lat: order.customerLat, lng: order.customerLng });
        } else if (order.delivery_address || order.address) {
          // Fallback: we'll geocode later if needed or use a placeholder
          setCustomerAddress(null);
        }

        setLoading(false);
      } catch (err) {
        setOrderError('Unable to load order details');
        setLoading(false);
      }
    }

    fetchOrderDetails();
  }, [orderId, laundryId]);

  /**
   * Poll driver location when tracking is active.
   */
  const fetchDriverLocation = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/tracking/driver`, {
        params: { orderId, laundryId },
      });

      const data = response.data;

      // Reset failure counter on successful response
      consecutiveFailuresRef.current = 0;
      setConnectionLost(false);

      if (data.status === 'active') {
        // Clear unavailable reason when transitioning to active (e.g., from "not_your_turn")
        const wasUnavailable = trackingStatus === 'unavailable';
        setTrackingStatus('active');
        setUnavailableReason(null);
        setLastUpdateTime(Date.now());
        setIsStale(false);

        const newPosition = { lat: data.latitude, lng: data.longitude };
        const newHeading = data.heading || 0;
        setDriverHeading(newHeading);

        // If transitioning from unavailable, clear stale directions/ETA so they refresh
        if (wasUnavailable) {
          setDirections(null);
          setEta(null);
        }

        previousPositionRef.current = driverPosition || newPosition;
        setDriverPosition(newPosition);
        setDriverName(data.driverName || '');

        // Arrival detection — show toast once when within 200m
        if (customerAddress && !hasShownArrival && isArriving(newPosition, customerAddress)) {
          setHasShownArrival(true);
          toast({
            title: '🚗 Driver is arriving!',
            description: 'Your driver is almost at your location.',
            status: 'success',
            duration: 8000,
            isClosable: true,
          });
        }

        // Animate marker to new position
        animateMarker(previousPositionRef.current, newPosition);
      } else if (data.status === 'unavailable') {
        setTrackingStatus('unavailable');
        setUnavailableReason(data.reason);
        // Clear active tracking data when becoming unavailable
        setDriverPosition(null);
        setAnimatedPosition(null);
        setDirections(null);
        setEta(null);
      }
    } catch (err) {
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        setConnectionLost(true);
      }
    }
  }, [orderId, laundryId, driverPosition, trackingStatus]);

  /**
   * Start polling when trackable.
   */
  useEffect(() => {
    if (!isTrackable || loading) return;

    // Fetch immediately
    fetchDriverLocation();

    // Set up interval
    pollIntervalRef.current = setInterval(fetchDriverLocation, POLL_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isTrackable, loading, fetchDriverLocation]);

  /**
   * Animate driver marker smoothly between positions with easing.
   */
  function animateMarker(from, to) {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const startTime = performance.now();

    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const rawT = Math.min(elapsed / ANIMATION_DURATION, 1);
      const t = easeInOut(rawT); // Apply easing for smoother movement

      const interpolated = lerp(from, to, t);
      setAnimatedPosition(interpolated);

      if (rawT < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      }
    }

    animationFrameRef.current = requestAnimationFrame(step);
  }

  /**
   * Fetch directions from driver to destination when both positions are available.
   */
  useEffect(() => {
    if (
      !isLoaded ||
      !driverPosition ||
      !customerAddress ||
      trackingStatus !== 'active'
    ) {
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();

    directionsService.route(
      {
        origin: driverPosition,
        destination: customerAddress,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirections(result);

          // Extract ETA from directions result
          const leg = result.routes[0]?.legs[0];
          if (leg?.duration?.value) {
            setEta(formatEta(leg.duration.value));
          } else {
            setEta(null);
          }
        } else {
          // On Directions API failure, hide ETA (Requirement 7.4)
          setEta(null);
        }
      }
    );
  }, [isLoaded, driverPosition, customerAddress, trackingStatus]);

  /**
   * Cleanup animation frame on unmount.
   */
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (staleTimerRef.current) {
        clearInterval(staleTimerRef.current);
      }
    };
  }, []);

  /**
   * Stale detection — check every 10s if last update is > 60s ago.
   */
  useEffect(() => {
    if (!lastUpdateTime || trackingStatus !== 'active') return;

    staleTimerRef.current = setInterval(() => {
      if (Date.now() - lastUpdateTime > STALE_THRESHOLD_MS) {
        setIsStale(true);
      }
    }, 10000);

    return () => {
      if (staleTimerRef.current) clearInterval(staleTimerRef.current);
    };
  }, [lastUpdateTime, trackingStatus]);

  // Loading state
  if (loading) {
    return (
      <Flex justify="center" align="center" minH="60vh">
        <Spinner size="xl" color="green.500" />
      </Flex>
    );
  }

  // Order fetch error
  if (orderError) {
    return (
      <Box p={4}>
        <Alert status="error" borderRadius="md">
          <AlertIcon />
          <AlertDescription>{orderError}</AlertDescription>
        </Alert>
      </Box>
    );
  }

  return (
    <Box p={4} maxW="800px" mx="auto">
      <VStack spacing={4} align="stretch">
        {/* Connection lost banner */}
        {connectionLost && (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            <AlertDescription>Connection lost</AlertDescription>
          </Alert>
        )}

        {/* Progress bar - always visible */}
        {orderStatus && <ProgressBar orderStatus={orderStatus} />}

        {/* Tracking content */}
        {isTrackable ? (
          <>
            {/* Unavailable states */}
            {trackingStatus === 'unavailable' && unavailableReason === 'not_your_turn' && (
              <Alert status="info" borderRadius="md">
                <AlertIcon />
                <AlertDescription>
                  Driver is completing other stops. Tracking will activate when driver is heading to you.
                </AlertDescription>
              </Alert>
            )}

            {trackingStatus === 'unavailable' && unavailableReason === 'stale_data' && (
              <Alert status="warning" borderRadius="md">
                <AlertIcon />
                <AlertDescription>
                  Driver location temporarily unavailable
                </AlertDescription>
              </Alert>
            )}

            {/* ETA + Driver info panel */}
            {trackingStatus === 'active' && (
              <Box bg="white" borderRadius="md" p={3} boxShadow="sm" borderWidth="1px">
                <Flex justify="space-between" align="center">
                  <VStack align="start" spacing={0}>
                    {driverName && <Text fontSize="sm" color="gray.600">Driver: <strong>{driverName}</strong></Text>}
                    <Text fontSize="sm" color={hasShownArrival ? 'green.600' : 'gray.600'} fontWeight="500">
                      {hasShownArrival ? '🚗 Driver is arriving!' : '🚗 Driver is on the way'}
                    </Text>
                  </VStack>
                  {eta && !isStale && (
                    <Badge colorScheme="green" fontSize="md" px={3} py={1} borderRadius="md">
                      {eta}
                    </Badge>
                  )}
                </Flex>
              </Box>
            )}

            {/* Stale location indicator */}
            {isStale && trackingStatus === 'active' && (
              <Alert status="info" borderRadius="md">
                <AlertIcon />
                <AlertDescription>Updating driver location...</AlertDescription>
              </Alert>
            )}

            {/* Google Map */}
            {isLoaded && trackingStatus === 'active' && (
              <Box borderRadius="md" overflow="hidden" boxShadow="md">
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={animatedPosition || driverPosition || defaultCenter}
                  zoom={14}
                  options={{
                    disableDefaultUI: false,
                    zoomControl: true,
                    streetViewControl: false,
                    mapTypeControl: false,
                  }}
                >
                  {/* Driver marker with car icon — rotated to heading */}
                  {(animatedPosition || driverPosition) && !isStale && (
                    <Marker
                      position={animatedPosition || driverPosition}
                      icon={getCarIcon(driverHeading)}
                      title={driverName ? `Driver: ${driverName}` : 'Driver'}
                    />
                  )}

                  {/* Destination marker */}
                  {customerAddress && (
                    <Marker
                      position={customerAddress}
                      title="Delivery destination"
                    />
                  )}

                  {/* Route polyline from Directions API */}
                  {directions && (
                    <DirectionsRenderer
                      directions={directions}
                      options={{
                        suppressMarkers: true,
                        polylineOptions: {
                          strokeColor: '#4285F4',
                          strokeWeight: 4,
                          strokeOpacity: 0.8,
                        },
                      }}
                    />
                  )}
                </GoogleMap>
              </Box>
            )}

            {/* Loading map state */}
            {!isLoaded && trackingStatus === 'active' && (
              <Flex justify="center" align="center" h="400px" bg="gray.100" borderRadius="md">
                <Spinner size="lg" />
                <Text ml={3}>Loading map...</Text>
              </Flex>
            )}

            {/* Waiting for first poll */}
            {trackingStatus === null && !connectionLost && (
              <Flex justify="center" align="center" h="200px">
                <Spinner size="md" mr={3} />
                <Text>Locating driver...</Text>
              </Flex>
            )}
          </>
        ) : (
          // Not trackable - show only progress bar (already shown above) with info message
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <AlertDescription>
              Live tracking is not yet available for this order. The progress bar above shows your order's current status.
            </AlertDescription>
          </Alert>
        )}

        {/* Order Details Card */}
        {orderDetails && (
          <Box borderWidth="1px" borderRadius="md" p={4} bg="white" boxShadow="sm">
            <Text fontWeight="bold" fontSize="md" mb={2}>Order Details</Text>
            <VStack spacing={1} align="stretch" fontSize="sm">
              <Flex justify="space-between">
                <Text color="gray.600">Order ID</Text>
                <Text fontWeight="600">{orderDetails.orderId || orderId}</Text>
              </Flex>
              {orderDetails.imageUrl && (
                <Box pt={1}>
                  <Text color="gray.600" mb={1}>
                    {orderStatus === 'EnRouteToDelivery' || orderStatus === 'Delivered' || orderStatus === 'OrderPickedUp'
                      ? 'Delivery Photo'
                      : 'Pickup Photo'}
                  </Text>
                  <Image
                    src={
                      orderDetails.imageUrl.startsWith('data:') || orderDetails.imageUrl.startsWith('http')
                        ? orderDetails.imageUrl
                        : `data:image/jpeg;base64,${orderDetails.imageUrl}`
                    }
                    alt="Order photo"
                    maxH="180px"
                    borderRadius="md"
                    objectFit="cover"
                    border="1px solid"
                    borderColor="gray.200"
                  />
                </Box>
              )}
              {orderDetails.services && orderDetails.services.length > 0 && (
                <Box>
                  <Text color="gray.600" mb={1}>Services</Text>
                  {orderDetails.services.map((s, i) => (
                    <Flex key={i} justify="space-between" pl={2}>
                      <Text>{s.serviceName} × {s.weightOrCount > 0 ? s.weightOrCount : 1}</Text>
                      <Text>${(Number(s.servicePrice) * (s.weightOrCount > 0 ? Number(s.weightOrCount) : 1)).toFixed(2)}</Text>
                    </Flex>
                  ))}
                </Box>
              )}
              {orderDetails.dropoffDate && (
                <Flex justify="space-between">
                  <Text color="gray.600">Delivery Date</Text>
                  <Text>{orderDetails.dropoffDate}</Text>
                </Flex>
              )}
              {orderDetails.grandTotal > 0 && (
                <Box pt={1} borderTopWidth="1px">
                  {orderDetails.subTotal > 0 && (
                    <Flex justify="space-between" color="gray.600">
                      <Text>Subtotal</Text>
                      <Text>${Number(orderDetails.subTotal).toFixed(2)}</Text>
                    </Flex>
                  )}
                  {orderDetails.discountedPrice > 0 && (
                    <Flex justify="space-between" color="green.600">
                      <Text>Discount{orderDetails.coupon && orderDetails.coupon !== 'None' ? ` (${orderDetails.coupon})` : ''}</Text>
                      <Text>−${Number(orderDetails.discountedPrice).toFixed(2)}</Text>
                    </Flex>
                  )}
                  {orderDetails.tip?.tipAmount > 0 && (
                    <Flex justify="space-between" color="gray.600">
                      <Text>Tip</Text>
                      <Text>${Number(orderDetails.tip.tipAmount).toFixed(2)}</Text>
                    </Flex>
                  )}
                  <Flex justify="space-between" fontWeight="bold" mt={1}>
                    <Text>Total</Text>
                    <Text>${Number(orderDetails.grandTotal).toFixed(2)}</Text>
                  </Flex>
                </Box>
              )}
            </VStack>
          </Box>
        )}
      </VStack>
    </Box>
  );
}
