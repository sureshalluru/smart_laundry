import React from 'react';
import { Alert, AlertIcon, AlertTitle, AlertDescription, Button } from '@chakra-ui/react';

/**
 * Shows when the driver denies location permission.
 * Provides instructions and a link to open device settings.
 */
export default function LocationPermissionAlert({ permissionDenied }) {
  if (!permissionDenied) return null;

  const openSettings = async () => {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      try {
        const { App } = await import('@capacitor/app');
        await App.openUrl({ url: 'app-settings:' });
      } catch {
        // Fallback — just show message
      }
    }
  };

  return (
    <Alert status="warning" borderRadius="md" flexDirection="column" alignItems="center" textAlign="center" py={4} mb={4}>
      <AlertIcon boxSize="30px" mr={0} mb={2} />
      <AlertTitle fontSize="md" mb={1}>Location Permission Required</AlertTitle>
      <AlertDescription fontSize="sm" mb={3}>
        Location access is needed so customers can track your delivery in real time.
        Please enable "Allow all the time" in your device settings.
      </AlertDescription>
      <Button size="sm" colorScheme="orange" onClick={openSettings}>
        Open Settings
      </Button>
    </Alert>
  );
}
