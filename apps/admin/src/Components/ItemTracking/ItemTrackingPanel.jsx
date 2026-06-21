import { useState, useEffect } from 'react';
import { Box, VStack, HStack, Text, Button, Badge } from '@chakra-ui/react';
import ItemTrackingQR from './ItemTrackingQR';
import ItemTrackingResults from './ItemTrackingResults';
import DiscrepancyAlert from './DiscrepancyAlert';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * ItemTrackingPanel — Inline panel that manages the full item tracking
 * workflow for a single order. Renders within the order detail view.
 *
 * Always shows an "Upload Photos" button so admin can scan QR at any time.
 * Also shows existing results if tracking data exists.
 */
function ItemTrackingPanel({ orderId, laundryId, orderStatus, employeeId, onSkip }) {
  const [trackingRecord, setTrackingRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(null); // null, 'intake', or 'fold'

  // Fetch existing tracking record on mount
  useEffect(() => {
    fetchTrackingRecord();
  }, [orderId, laundryId]);

  const fetchTrackingRecord = async () => {
    try {
      const params = new URLSearchParams({ orderId, laundryId });
      const res = await fetch(`${API_BASE}/api/admin/item-tracking/record?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTrackingRecord(data);
      }
    } catch (e) {
      console.error('Failed to fetch tracking record:', e);
    }
    setLoading(false);
  };

  const handleResultsReceived = () => {
    setShowQR(null);
    fetchTrackingRecord();
  };

  if (loading) return null;

  const hasIntakeRecord = trackingRecord?.intakeRecord != null;
  const hasFoldRecord = trackingRecord?.foldRecord != null;

  return (
    <Box mt={3} mb={3} p={3} borderWidth="1px" borderRadius="md" bg="gray.50">
      <VStack spacing={3} align="stretch">
        {/* Header with Upload Photos buttons */}
        <HStack justify="space-between" align="center">
          <HStack>
            <Text fontSize="sm" fontWeight="bold">📷 Item Tracking</Text>
            {hasIntakeRecord && <Badge colorScheme="blue" fontSize="xs">Intake ✓</Badge>}
            {hasFoldRecord && <Badge colorScheme="green" fontSize="xs">Fold ✓</Badge>}
          </HStack>
          <HStack spacing={2}>
            <Button
              size="xs"
              colorScheme="blue"
              variant={showQR === 'intake' ? 'solid' : 'outline'}
              onClick={() => setShowQR(showQR === 'intake' ? null : 'intake')}
            >
              {hasIntakeRecord ? 'Re-scan Intake' : 'Scan Intake'}
            </Button>
            <Button
              size="xs"
              colorScheme="green"
              variant={showQR === 'fold' ? 'solid' : 'outline'}
              onClick={() => setShowQR(showQR === 'fold' ? null : 'fold')}
            >
              {hasFoldRecord ? 'Re-scan Fold' : 'Scan Fold'}
            </Button>
          </HStack>
        </HStack>

        {/* QR Code (shown when button clicked) */}
        {showQR && (
          <ItemTrackingQR
            orderId={orderId}
            laundryId={laundryId}
            phase={showQR}
            employeeId={employeeId}
            onResultsReceived={handleResultsReceived}
          />
        )}

        {/* Existing intake results */}
        {hasIntakeRecord && (
          <ItemTrackingResults
            record={trackingRecord.intakeRecord}
            phase="intake"
            orderId={orderId}
            laundryId={laundryId}
          />
        )}

        {/* Existing fold results */}
        {hasFoldRecord && (
          <>
            <ItemTrackingResults
              record={trackingRecord.foldRecord}
              phase="fold"
              orderId={orderId}
              laundryId={laundryId}
            />
            {trackingRecord.discrepancies?.length > 0 && (
              <DiscrepancyAlert discrepancies={trackingRecord.discrepancies} />
            )}
          </>
        )}

        {/* No data yet message */}
        {!hasIntakeRecord && !hasFoldRecord && !showQR && (
          <Text fontSize="xs" color="gray.500" textAlign="center">
            Click "Scan Intake" to start counting items for this order.
          </Text>
        )}
      </VStack>
    </Box>
  );
}

export default ItemTrackingPanel;
