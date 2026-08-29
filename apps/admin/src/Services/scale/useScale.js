/**
 * useScale() — React hook wrapping the Web Serial scale transport
 * (scale-integration-bag-tags spec).
 *
 * Exposes:
 *   isSupported   — whether Web Serial is available (feature-detect)
 *   isConnected   — whether a scale is currently connected
 *   lastReading   — the most recent Reading {value, unit, stable}
 *   connect()     — MUST be called from a user gesture; opens the port
 *   disconnect()  — closes the port
 *
 * Degrades gracefully: on an unsupported browser isSupported is false and the
 * UI simply hides the "Read Scale" action, leaving manual/photo entry intact.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { WebSerialScale, isWebSerialSupported } from './webSerialScale';
import { EMPTY_READING } from './scaleTypes';

export function useScale() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastReading, setLastReading] = useState(EMPTY_READING);
  const scaleRef = useRef(null);

  const isSupported = isWebSerialSupported();

  const connect = useCallback(async () => {
    if (!isSupported) return false;
    if (!scaleRef.current) {
      scaleRef.current = new WebSerialScale();
    }
    try {
      await scaleRef.current.connect((reading) => setLastReading(reading));
      setIsConnected(true);
      return true;
    } catch (err) {
      setIsConnected(false);
      return false;
    }
  }, [isSupported]);

  const disconnect = useCallback(async () => {
    if (scaleRef.current) {
      await scaleRef.current.disconnect();
    }
    setIsConnected(false);
    setLastReading(EMPTY_READING);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (scaleRef.current) {
        scaleRef.current.disconnect().catch(() => {});
      }
    };
  }, []);

  return {
    isSupported,
    isConnected,
    lastReading,
    stable: !!lastReading.stable,
    connect,
    disconnect,
  };
}
