import { useState, useEffect } from 'react';
import { Box, VStack, HStack, Text, Button, Badge } from '@chakra-ui/react';
import ItemTrackingQR from './ItemTrackingQR';
import ItemTrackingResults from './ItemTrackingResults';
import DiscrepancyAlert from './DiscrepancyAlert';
import MobileInlineUpload from '../MobileOrder/MobileInlineUpload';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * ItemTrackingPanel — Inline panel that manages the full item tracking
 * workflow for a single order. Renders within the order detail view.
 *
 * On desktop: shows QR code for employee to scan with phone.
 * On mobile: shows "Upload Photos" button that opens the upload page directly.
 */
function ItemTrackingPanel({ orderId, laundryId, orderStatus, employeeId, onSkip, onOrderRefresh, onCaptureActiveChange }) {
  const [trackingRecord, setTrackingRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(null); // null, 'intake', or 'fold'
  const [mobileUploadPhase, setMobileUploadPhase] = useState(null); // null, 'intake', or 'fold'

  // Detect mobile device
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Notify parent when capture is active/inactive
  useEffect(() => {
    if (onCaptureActiveChange) {
      onCaptureActiveChange(mobileUploadPhase !== null);
    }
  }, [mobileUploadPhase, onCaptureActiveChange]);

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
    if (onOrderRefresh) onOrderRefresh();
  };

  // Open upload page directly (for mobile admin)
  const openUploadDirect = async (phase) => {
    try {
      const params = new URLSearchParams({
        orderId,
        laundryId,
        phase,
        employeeId: employeeId || 'EMP',
        baseUrl: window.location.origin,
      });
      const res = await fetch(`${API_BASE}/api/admin/item-tracking/qr-code?${params}`);
      if (res.ok) {
        const data = await res.json();
        // Open the upload page in same browser
        window.open(data.qrUrl, '_blank');
      }
    } catch (e) {
      console.error('Failed to generate upload link:', e);
    }
  };

  if (loading) return null;

  const hasIntakeRecord = trackingRecord?.intakeRecord != null;
  const hasFoldRecord = trackingRecord?.foldRecord != null;

  return (
    <Box mt={3} mb={3} p={3} borderWidth="1px" borderRadius="md" bg="gray.50">
      <VStack spacing={3} align="stretch">
        {/* Header with action buttons */}
        <HStack justify="space-between" align="center" flexWrap="wrap" gap={2}>
          <HStack>
            <Text fontSize="sm" fontWeight="bold">📷 Item Tracking</Text>
            {hasIntakeRecord && <Badge colorScheme="blue" fontSize="xs">Intake ✓</Badge>}
            {hasFoldRecord && <Badge colorScheme="green" fontSize="xs">Fold ✓</Badge>}
          </HStack>
          <HStack spacing={2} flexWrap="wrap">
            {isMobile ? (
              <>
                {/* Mobile: inline upload buttons */}
                <Button
                  size="xs"
                  colorScheme="blue"
                  onClick={() => setMobileUploadPhase('intake')}
                >
                  📷 {hasIntakeRecord ? 'Redo Count' : 'Count Items'}
                </Button>
                <Button
                  size="xs"
                  colorScheme="green"
                  onClick={() => setMobileUploadPhase('fold')}
                >
                  👕 {hasFoldRecord ? 'Redo Fold' : 'Fold Complete'}
                </Button>
              </>
            ) : (
              <>
                {/* Desktop: QR code buttons + direct upload */}
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
                  colorScheme="blue"
                  variant="ghost"
                  onClick={() => openUploadDirect('intake')}
                >
                  📁 Upload Intake
                </Button>
                <Button
                  size="xs"
                  colorScheme="green"
                  variant={showQR === 'fold' ? 'solid' : 'outline'}
                  onClick={() => setShowQR(showQR === 'fold' ? null : 'fold')}
                >
                  {hasFoldRecord ? 'Re-scan Fold' : 'Scan Fold'}
                </Button>
                <Button
                  size="xs"
                  colorScheme="green"
                  variant="ghost"
                  onClick={() => openUploadDirect('fold')}
                >
                  📁 Upload Fold
                </Button>
              </>
            )}
          </HStack>
        </HStack>

        {/* QR Code (shown when button clicked — desktop only) */}
        {showQR && !isMobile && (
          <ItemTrackingQR
            orderId={orderId}
            laundryId={laundryId}
            phase={showQR}
            employeeId={employeeId}
            onResultsReceived={handleResultsReceived}
          />
        )}

        {/* Mobile Inline Upload (shown when mobile upload phase is set) */}
        {isMobile && mobileUploadPhase && (
          <MobileInlineUpload
            key={mobileUploadPhase}
            orderId={orderId}
            laundryId={laundryId}
            phase={mobileUploadPhase}
            employeeId={employeeId}
            onComplete={() => {
              setMobileUploadPhase(null);
              handleResultsReceived();
            }}
            onCancel={() => setMobileUploadPhase(null)}
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
            {isMobile
              ? 'Tap "Upload Intake" to take photos and count items.'
              : 'Click "Scan Intake" for QR code or "Upload Intake" to upload photos from this computer.'}
          </Text>
        )}
      </VStack>
    </Box>
  );
}

export default ItemTrackingPanel;
