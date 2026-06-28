import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@chakra-ui/react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';
const MIN_INTERVAL_MS = 10000; // 10-second throttle

/**
 * useLocationBroadcaster
 *
 * Broadcasts the driver's GPS position to the tracking API while a route is active.
 * Uses navigator.geolocation.watchPosition and throttles updates to minimum 10-second intervals.
 *
 * @param {object} props
 * @param {string} props.laundryId - The laundry shop ID
 * @param {string} props.driverId - The driver's employee ID
 * @param {boolean} props.isRouteActive - Whether the driver has active stops
 * @param {number} props.currentStopPosition - The sequence position driver is heading to
 * @returns {{ isTracking: boolean, lastError: string|null, permissionDenied: boolean }}
 */
export function useLocationBroadcaster({ laundryId, driverId, isRouteActive, currentStopPosition }) {
  const toast = useToast();

  const [isTracking, setIsTracking] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const watchIdRef = useRef(null);
  const lastSentRef = useRef(0);
  const isMountedRef = useRef(true);

  // Post location to the backend
  const postLocation = useCallback(async (position) => {
    const now = Date.now();

    // Throttle: skip if less than 10 seconds since last send
    if (now - lastSentRef.current < MIN_INTERVAL_MS) {
      return;
    }

    const { latitude, longitude } = position.coords;
    const heading = position.coords.heading ?? 0;
    const speed = position.coords.speed ?? 0;

    const authToken = localStorage.getItem('idToken');
    if (!authToken) return;

    try {
      await axios.post(
        `${API_URL}/api/tracking/location`,
        {
          latitude,
          longitude,
          heading,
          speed,
          currentStopPosition,
        },
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );

      lastSentRef.current = Date.now();
      if (isMountedRef.current) {
        setLastError(null);
      }
    } catch (err) {
      // Network failure: silently skip, retry on next interval
      console.warn('Location broadcast failed, will retry next interval:', err.message);
      if (isMountedRef.current) {
        setLastError(err.message || 'Network error');
      }
    }
  }, [currentStopPosition]);

  // Start watching position
  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setLastError('Geolocation not supported');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      // Success callback
      (position) => {
        if (isMountedRef.current) {
          setIsTracking(true);
          setPermissionDenied(false);
        }
        postLocation(position);
      },
      // Error callback
      (error) => {
        if (!isMountedRef.current) return;

        if (error.code === error.PERMISSION_DENIED) {
          setPermissionDenied(true);
          setIsTracking(false);
          setLastError('Location permission denied');
          toast({
            title: 'Location Permission Required',
            description:
              'Location sharing is required for live tracking. Please enable location access in your browser settings.',
            status: 'warning',
            duration: 8000,
            isClosable: true,
            position: 'top',
          });
        } else {
          // GPS unavailable or timeout — silently skip, retry on next callback
          console.warn('Geolocation error:', error.message);
          setLastError(error.message || 'GPS unavailable');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 15000,
      }
    );

    watchIdRef.current = watchId;
  }, [postLocation, toast]);

  // Stop watching position
  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (isMountedRef.current) {
      setIsTracking(false);
    }
  }, []);

  // React to isRouteActive changes
  useEffect(() => {
    if (isRouteActive && driverId && laundryId) {
      startWatching();
    } else {
      stopWatching();
    }

    return () => {
      stopWatching();
    };
  }, [isRouteActive, driverId, laundryId, startWatching, stopWatching]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return { isTracking, lastError, permissionDenied };
}

export default useLocationBroadcaster;
