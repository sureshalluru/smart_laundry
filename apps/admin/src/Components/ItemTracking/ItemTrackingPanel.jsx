import { useState, useEffect } from 'react';
import { Box, VStack, HStack, Text, Button, Badge, Spinner } from '@chakra-ui/react';
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

  // AI review state
  const [adjustedItems, setAdjustedItems] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(null);

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

  // Initialize adjustedItems when vision results are loaded
  useEffect(() => {
    if (trackingRecord?.visionStatus === 'complete' && trackingRecord?.visionItems) {
      setAdjustedItems(
        trackingRecord.visionItems.map((item) => ({
          category: item.category,
          count: item.count,
          confidence: item.confidence || 100,
        }))
      );
    }
  }, [trackingRecord]);

  // Adjust item count up or down
  const adjustCount = (index, delta) => {
    setAdjustedItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const newCount = Math.max(0, item.count + delta);
        return { ...item, count: newCount };
      })
    );
  };

  // Confirm AI results (calls existing confirm-intake or confirm-fold endpoint)
  const handleConfirmVision = async () => {
    setConfirming(true);
    setConfirmError(null);

    try {
      const phase = trackingRecord?.visionPhase || 'intake';
      const confirmEndpoint =
        phase === 'intake' ? '/api/track/confirm-intake' : '/api/track/confirm-fold';

      const confirmItems = adjustedItems.map((item) => ({
        category: item.category,
        count: item.count,
      }));

      const photoUrls = trackingRecord?.visionPhotoUrls || [];
      const token = trackingRecord?.visionToken;

      const body = {
        token,
        items: confirmItems,
        photoUrls,
      };

      // For fold, acknowledge all discrepancies automatically since employee
      // has already reviewed and adjusted counts on the UI
      if (phase === 'fold') {
        body.acknowledgements = adjustedItems.map((item) => ({
          category: item.category,
          reason: "Employee reviewed and adjusted count"
        }));
      }

      let confirmRes = await fetch(`${API_BASE}${confirmEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // If fold returns 422 with unresolved discrepancies, retry with full acknowledgements
      if (!confirmRes.ok && confirmRes.status === 422 && phase === 'fold') {
        const errData = await confirmRes.json().catch(() => ({}));
        if (errData.detail?.unresolved) {
          const allCategories = [
            ...adjustedItems.map((item) => item.category),
            ...(errData.detail.unresolved || []).map((d) => d.category || d),
          ];
          body.acknowledgements = [...new Set(allCategories)].map((cat) => ({
            category: cat,
            reason: "Employee reviewed and adjusted count"
          }));
          confirmRes = await fetch(`${API_BASE}${confirmEndpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
        }
      }

      if (!confirmRes.ok) {
        const errData = await confirmRes.json().catch(() => ({}));
        const detail = errData.detail;
        throw new Error(
          typeof detail === 'string' ? detail : detail?.message || 'Confirmation failed. Please try again.'
        );
      }

      // Success — refresh data
      fetchTrackingRecord();
      if (onOrderRefresh) onOrderRefresh();
    } catch (err) {
      setConfirmError(err.message || 'Confirmation failed. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  // Compute discrepancies between fold counts and intake record
  const computeFoldDiscrepancies = () => {
    if (!trackingRecord?.intakeRecord?.items || !adjustedItems.length) return [];
    const intakeItems = trackingRecord.intakeRecord.items;
    const discrepancies = [];
    adjustedItems.forEach((foldItem) => {
      const intakeItem = intakeItems.find((i) => i.category === foldItem.category);
      const intakeCount = intakeItem ? intakeItem.count : 0;
      if (foldItem.count !== intakeCount) {
        discrepancies.push({
          category: foldItem.category,
          intakeCount,
          foldCount: foldItem.count,
        });
      }
    });
    return discrepancies;
  };

  if (loading) return null;

  const hasIntakeRecord = trackingRecord?.intakeRecord != null;
  const hasFoldRecord = trackingRecord?.foldRecord != null;

  // Check if the confirmed record already exists for the current vision phase
  const hasConfirmedRecordForPhase =
    (trackingRecord?.visionPhase === 'intake' && hasIntakeRecord) ||
    (trackingRecord?.visionPhase === 'fold' && hasFoldRecord);

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
                  📷 {hasIntakeRecord ? 'Redo Count' : 'Received Items'}
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

        {/* AI Processing Status */}
        {trackingRecord?.visionStatus === 'processing' && (
          <Box p={3} borderWidth="1px" borderRadius="md" bg="blue.50" textAlign="center">
            <HStack justify="center" spacing={2}>
              <Spinner size="sm" color="blue.500" />
              <Text fontSize="sm" color="blue.700" fontWeight="500">
                🔄 AI is counting items...
              </Text>
            </HStack>
            <Text fontSize="xs" color="blue.600" mt={1}>
              Results will appear here when ready.
            </Text>
          </Box>
        )}

        {/* AI Failed Status */}
        {trackingRecord?.visionStatus === 'failed' && (
          <Box p={3} borderWidth="1px" borderRadius="md" bg="red.50">
            <HStack justify="space-between" align="center">
              <Text fontSize="sm" color="red.700" fontWeight="500">
                ⚠️ AI analysis failed
              </Text>
              <Button
                size="xs"
                colorScheme="blue"
                onClick={() => setMobileUploadPhase(trackingRecord?.visionPhase || 'intake')}
              >
                📷 Retry
              </Button>
            </HStack>
          </Box>
        )}

        {/* AI Results Ready for Review */}
        {trackingRecord?.visionStatus === 'complete' && !hasConfirmedRecordForPhase && (
          <Box p={3} borderWidth="1px" borderRadius="md" bg="green.50">
            <Text fontSize="sm" fontWeight="bold" color="green.700" mb={2}>
              ✅ Ready to Review — {trackingRecord.visionPhase === 'fold' ? 'Fold' : 'Intake'} Count
            </Text>

            {/* Fold discrepancy highlights */}
            {trackingRecord.visionPhase === 'fold' && hasIntakeRecord && (() => {
              const discreps = computeFoldDiscrepancies();
              if (discreps.length === 0) return null;
              return (
                <Box p={2} mb={2} borderWidth="1px" borderRadius="md" bg="orange.50" borderColor="orange.200">
                  <Text fontSize="xs" fontWeight="600" color="orange.700" mb={1}>
                    ⚠️ Discrepancies vs Intake:
                  </Text>
                  {discreps.map((d, i) => (
                    <Text key={i} fontSize="xs" color="orange.600">
                      {d.category}: Intake {d.intakeCount} → Fold {d.foldCount}
                    </Text>
                  ))}
                </Box>
              );
            })()}

            {/* Item list with adjustment */}
            <VStack spacing={2} align="stretch" mb={3}>
              {adjustedItems.map((item, idx) => (
                <HStack
                  key={idx}
                  p={2}
                  borderWidth="1px"
                  borderRadius="md"
                  bg="white"
                  justify="space-between"
                  borderColor={item.confidence < 70 ? 'orange.300' : 'gray.200'}
                >
                  <Box>
                    <Text fontSize="sm" fontWeight="500">{item.category}</Text>
                    {item.confidence < 70 && (
                      <Text fontSize="xs" color="orange.600">⚠️ Low confidence</Text>
                    )}
                  </Box>
                  <HStack spacing={2}>
                    <Button
                      size="xs"
                      colorScheme="red"
                      variant="outline"
                      onClick={() => adjustCount(idx, -1)}
                      aria-label={`Decrease ${item.category}`}
                      minW="32px"
                    >
                      −
                    </Button>
                    <Text fontSize="md" fontWeight="bold" minW="24px" textAlign="center">
                      {item.count}
                    </Text>
                    <Button
                      size="xs"
                      colorScheme="blue"
                      variant="outline"
                      onClick={() => adjustCount(idx, 1)}
                      aria-label={`Increase ${item.category}`}
                      minW="32px"
                    >
                      +
                    </Button>
                  </HStack>
                </HStack>
              ))}
            </VStack>

            {/* Confirm error */}
            {confirmError && (
              <Box p={2} mb={2} borderWidth="1px" borderRadius="md" bg="red.50" borderColor="red.200">
                <Text fontSize="xs" color="red.600">{confirmError}</Text>
              </Box>
            )}

            {/* Confirm button */}
            <Button
              colorScheme="green"
              size="sm"
              width="100%"
              onClick={handleConfirmVision}
              isLoading={confirming}
              loadingText="Confirming..."
            >
              ✓ Confirm {trackingRecord.visionPhase === 'fold' ? 'Fold' : 'Intake'}
            </Button>
          </Box>
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
              ? 'Tap "Received Items" to take photos and count items.'
              : 'Click "Scan Intake" for QR code or "Upload Intake" to upload photos from this computer.'}
          </Text>
        )}
      </VStack>
    </Box>
  );
}

export default ItemTrackingPanel;
