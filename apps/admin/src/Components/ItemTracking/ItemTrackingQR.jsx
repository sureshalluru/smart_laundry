import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Spinner,
  Badge,
  useToast,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import QRCode from 'qrcode.react';

const API_BASE = process.env.REACT_APP_API_URL || '';
const POLL_INTERVAL = 3000; // 3 seconds

/**
 * ItemTrackingQR — Displays a QR code for the employee to scan with their phone.
 * Polls for results and shows them when the mobile flow is complete.
 *
 * Renders inline within the order detail drawer on the POS.
 */
function ItemTrackingQR({ orderId, laundryId, phase, employeeId, onResultsReceived }) {
  const toast = useToast();
  const pollRef = useRef(null);

  const [qrUrl, setQrUrl] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | generating | waiting | confirmed | expired | error
  const [result, setResult] = useState(null);

  // Generate QR code
  const generateQR = useCallback(async () => {
    setSyncStatus('generating');
    try {
      const params = new URLSearchParams({
        orderId,
        laundryId,
        phase,
        employeeId,
        baseUrl: window.location.origin,
      });
      const res = await fetch(`${API_BASE}/api/admin/item-tracking/qr-code?${params}`);
      if (!res.ok) throw new Error('Failed to generate QR code');

      const data = await res.json();
      setQrUrl(data.qrUrl);
      setExpiresAt(data.expiresAt);
      setSyncStatus('waiting');
      startPolling();
    } catch (e) {
      setSyncStatus('error');
      toast({
        title: 'QR code error',
        description: 'Could not generate QR code. Please try again.',
        status: 'error',
        duration: 5000,
      });
    }
  }, [orderId, laundryId, phase, employeeId]);

  // Start polling for results
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const params = new URLSearchParams({ orderId, laundryId, phase });
        const res = await fetch(`${API_BASE}/api/admin/item-tracking/status?${params}`);
        if (!res.ok) return;

        const data = await res.json();

        if (data.status === 'confirmed') {
          setSyncStatus('confirmed');
          setResult(data.record);
          stopPolling();

          if (onResultsReceived) {
            onResultsReceived(data.record);
          }

          toast({
            title: `${phase === 'intake' ? 'Intake' : 'Fold'} complete`,
            description: 'Item count confirmed from phone.',
            status: 'success',
            duration: 5000,
          });
        } else if (data.status === 'expired') {
          setSyncStatus('expired');
          stopPolling();
        }
      } catch (e) {
        // Silently retry on network errors
      }
    }, POLL_INTERVAL);
  }, [orderId, laundryId, phase, onResultsReceived]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // Auto-generate QR on mount
  useEffect(() => {
    generateQR();
    return () => stopPolling();
  }, [generateQR]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (syncStatus === 'generating') {
    return (
      <Box p={4} textAlign="center">
        <Spinner size="md" />
        <Text mt={2} fontSize="sm" color="gray.500">Generating QR code...</Text>
      </Box>
    );
  }

  if (syncStatus === 'error') {
    return (
      <Box p={4}>
        <Alert status="error" borderRadius="md" size="sm">
          <AlertIcon />
          <Text fontSize="sm">Could not generate QR code.</Text>
        </Alert>
        <Button size="sm" mt={2} onClick={generateQR}>Retry</Button>
      </Box>
    );
  }

  if (syncStatus === 'expired') {
    return (
      <Box p={4}>
        <Alert status="warning" borderRadius="md" size="sm">
          <AlertIcon />
          <Text fontSize="sm">QR code expired. Generate a new one.</Text>
        </Alert>
        <Button size="sm" mt={2} colorScheme="blue" onClick={generateQR}>
          Generate New QR
        </Button>
      </Box>
    );
  }

  if (syncStatus === 'confirmed' && result) {
    return null; // Results will be shown by ItemTrackingResults
  }

  // Waiting state — show QR code
  return (
    <Box p={4} borderWidth="1px" borderRadius="md" bg="white">
      <VStack spacing={3}>
        <HStack>
          <Badge colorScheme={phase === 'intake' ? 'blue' : 'green'}>
            {phase === 'intake' ? 'INTAKE' : 'FOLD'}
          </Badge>
          <Text fontSize="sm" fontWeight="bold">Scan to Count Items</Text>
        </HStack>

        {qrUrl && (
          <Box p={2} bg="white" borderRadius="md">
            <QRCode value={qrUrl} size={180} level="M" />
          </Box>
        )}

        <HStack spacing={2}>
          <Spinner size="xs" color="blue.400" />
          <Text fontSize="xs" color="gray.500">
            Waiting for photos from phone...
          </Text>
        </HStack>
      </VStack>
    </Box>
  );
}

export default ItemTrackingQR;
