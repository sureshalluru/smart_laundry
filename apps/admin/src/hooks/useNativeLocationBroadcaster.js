// Integration in DriverHome.jsx:
// import { isNativePlatform, useNativeLocationBroadcaster } from '../hooks/useNativeLocationBroadcaster';
// If isNativePlatform(), use useNativeLocationBroadcaster instead of useLocationBroadcaster

import { useState, useEffect, useRef, useCallback } from 'react';
import { buildLocationPayload } from './buildLocationPayload';
import { ThrottledBroadcaster } from './ThrottledBroadcaster';
import axios from 'axios';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';
const MIN_INTERVAL_MS = 10000;

/**
 * Returns true if running inside a Capacitor native shell (Android/iOS).
 */
export function isNativePlatform() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
}

/**
 * Native location broadcaster hook for Capacitor Android app.
 * Uses @capacitor-community/background-geolocation for background GPS.
 * Falls back gracefully if not on native platform.
 *
 * @param {Object} options
 * @param {boolean} options.isRouteActive - Whether the driver has an active route
 * @param {number} options.currentStopPosition - Current stop index in the route
 * @param {string} options.laundryId - Laundry ID for the API call
 * @param {string} options.driverId - Driver/employee ID
 * @returns {{ isTracking: boolean, lastError: string|null, permissionDenied: boolean }}
 */
export function useNativeLocationBroadcaster({ isRouteActive, currentStopPosition, laundryId, driverId }) {
  const [isTracking, setIsTracking] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const throttleRef = useRef(new ThrottledBroadcaster(MIN_INTERVAL_MS));
  const watcherIdRef = useRef(null);

  const sendLocation = useCallback(async (coords) => {
    if (!throttleRef.current.tryAcquire()) return;

    const payload = buildLocationPayload(coords, currentStopPosition);
    const token = localStorage.getItem('idToken');
    if (!token) return;

    try {
      await axios.post(`${API_URL}/api/tracking/location`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        params: { laundryId, driverId },
        timeout: 5000,
      });
      setLastError(null);
    } catch (err) {
      setLastError(err.message || 'Network error');
      // Silent fail — will retry on next interval
    }
  }, [currentStopPosition, laundryId, driverId]);

  useEffect(() => {
    if (!isNativePlatform() || !isRouteActive) {
      setIsTracking(false);
      return;
    }

    let cancelled = false;

    async function startTracking() {
      try {
        // Access the plugin via Capacitor's global plugin registry (no static import needed)
        const { registerPlugin } = window.Capacitor;
        if (!registerPlugin) throw new Error('Capacitor not available');
        const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

        watcherIdRef.current = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: 'Tracking your delivery route',
            backgroundTitle: 'Smart Laundry Driver',
            requestPermissions: true,
            stale: false,
            distanceFilter: 10,
          },
          (location, error) => {
            if (cancelled) return;
            if (error) {
              if (error.code === 'NOT_AUTHORIZED') {
                setPermissionDenied(true);
              }
              setLastError(error.message || 'Location error');
              return;
            }
            if (location) {
              sendLocation({
                latitude: location.latitude,
                longitude: location.longitude,
                heading: location.bearing || 0,
                speed: location.speed || 0,
              });
            }
          }
        );

        if (!cancelled) {
          setIsTracking(true);
          setPermissionDenied(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLastError(err.message || 'Failed to start tracking');
          setIsTracking(false);
        }
      }
    }

    startTracking();

    return () => {
      cancelled = true;
      if (watcherIdRef.current != null) {
        try {
          const { registerPlugin } = window.Capacitor;
          const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
          BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
        } catch {}
        watcherIdRef.current = null;
      }
      setIsTracking(false);
    };
  }, [isRouteActive, sendLocation]);

  return { isTracking, lastError, permissionDenied };
}
