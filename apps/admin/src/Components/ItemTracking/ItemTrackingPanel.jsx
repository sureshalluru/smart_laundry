import { useState, useEffect } from 'react';
import { Box, VStack, Text, Button } from '@chakra-ui/react';
import ItemTrackingQR from './ItemTrackingQR';
import ItemTrackingResults from './ItemTrackingResults';
import DiscrepancyAlert from './DiscrepancyAlert';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * ItemTrackingPanel — Inline panel that manages the full item tracking
 * workflow for a single order. Renders within the order detail view.
 *
 * Shows:
 * - QR code for intake/fold (when appropriate status)
 * - Results after confirmation
 * - Discrepancy alerts
 * - Skip option for rush orders
 *
 * Props:
 * - orderId: string
 * - laundryId: string
 * - orderStatus: string (e.g., "ReceivedAtFacility", "ProcessingCompleted")
 * - employeeId: string
 * - onSkip: () => void (called when employee skips tracking)
 */
function ItemTrackingPanel({ orderId, laundryId, orderStatus, employeeId, onSkip }) {
  const [trackingRecord, setTrackingRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [skipped, setSkipped] = useState(false);

  // Determine which phase to show based on order status
  const phase = getPhaseForStatus(orderStatus);

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

  const handleResultsReceived = (record) => {
    // Refresh the tracking record
    fetchTrackingRecord();
  };

  const handleSkip = () => {
    setSkipped(true);
    if (onSkip) onSkip();
  };

  if (loading) return null;
  if (skipped) return null;

  const hasIntakeRecord = trackingRecord?.intakeRecord != null;
  const hasFoldRecord = trackingRecord?.foldRecord != null;

  return (
    <Box mt={3} mb={3}>
      <VStack spacing={3} align="stretch">
        {/* Show intake results if already recorded */}
        {hasIntakeRecord && (
          <ItemTrackingResults record={trackingRecord.intakeRecord} phase="intake" />
        )}

        {/* Show QR for intake if not yet recorded */}
        {phase === 'intake' && !hasIntakeRecord && (
          <>
            <ItemTrackingQR
              orderId={orderId}
              laundryId={laundryId}
              phase="intake"
              employeeId={employeeId}
              onResultsReceived={handleResultsReceived}
            />
            <Button
              size="xs"
              variant="ghost"
              color="gray.400"
              onClick={handleSkip}
            >
              Skip Item Tracking
            </Button>
          </>
        )}

        {/* Show fold results if already recorded */}
        {hasFoldRecord && (
          <>
            <ItemTrackingResults record={trackingRecord.foldRecord} phase="fold" />
            {trackingRecord.discrepancies?.length > 0 && (
              <DiscrepancyAlert discrepancies={trackingRecord.discrepancies} />
            )}
          </>
        )}

        {/* Show QR for fold if intake exists but fold not yet recorded */}
        {phase === 'fold' && hasIntakeRecord && !hasFoldRecord && (
          <ItemTrackingQR
            orderId={orderId}
            laundryId={laundryId}
            phase="fold"
            employeeId={employeeId}
            onResultsReceived={handleResultsReceived}
          />
        )}

        {/* Show QR for fold without reconciliation if no intake */}
        {phase === 'fold' && !hasIntakeRecord && !hasFoldRecord && (
          <>
            <Text fontSize="xs" color="gray.500" fontStyle="italic">
              Intake not recorded — fold count only (no reconciliation)
            </Text>
            <ItemTrackingQR
              orderId={orderId}
              laundryId={laundryId}
              phase="fold"
              employeeId={employeeId}
              onResultsReceived={handleResultsReceived}
            />
          </>
        )}
      </VStack>
    </Box>
  );
}

function getPhaseForStatus(status) {
  if (!status) return 'intake'; // Default to intake for any order
  const s = status.toLowerCase();
  // Show fold QR when processing is completed
  if (s.includes('processingcompleted') || s === 'processingcompleted') return 'fold';
  if (s.includes('enroute') || s.includes('delivered') || s.includes('pickedup')) return 'fold';
  // All other statuses show intake (or results if already recorded)
  return 'intake';
}

export default ItemTrackingPanel;
