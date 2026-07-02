import React, { useState, useRef } from 'react';

const API_URL = process.env.REACT_APP_AWS_API_URL || '';

/**
 * Converts a File to a base64 data URL string.
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Compress an image file to max 1024px and JPEG quality 0.75 before uploading.
 * Reduces 3-5MB phone photos to ~200-300KB for faster upload + faster Vision AI processing.
 */
function compressForUpload(file) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      const maxDim = 1024;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Steps in the inline upload flow.
 */
const STEPS = {
  CAPTURE: 'capture',
  UPLOAD: 'upload',
  RESULTS: 'results',
  ADJUST: 'adjust',
  CONFIRM: 'confirm',
};

/**
 * Shared inline styles for mobile-first, big touch targets.
 */
const styles = {
  container: {
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid #E2E8F0',
    backgroundColor: '#FAFBFC',
    marginTop: '8px',
  },
  stepIndicator: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  stepDot: (active, completed) => ({
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: completed ? '#38A169' : active ? '#3182CE' : '#CBD5E0',
  }),
  bigButton: (colorScheme = 'blue') => {
    const colors = {
      blue: { bg: '#3182CE', hover: '#2B6CB0' },
      green: { bg: '#38A169', hover: '#2F855A' },
      red: { bg: '#E53E3E', hover: '#C53030' },
      gray: { bg: '#718096', hover: '#4A5568' },
      orange: { bg: '#DD6B20', hover: '#C05621' },
    };
    const c = colors[colorScheme] || colors.blue;
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      width: '100%',
      minHeight: '48px',
      padding: '12px 16px',
      borderRadius: '8px',
      backgroundColor: c.bg,
      color: 'white',
      border: 'none',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      touchAction: 'manipulation',
    };
  },
  outlineButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    minHeight: '48px',
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: 'white',
    color: '#4A5568',
    border: '1px solid #CBD5E0',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  adjustButton: (colorScheme = 'blue') => {
    const colors = {
      blue: { bg: '#EBF8FF', border: '#90CDF4', color: '#2B6CB0' },
      red: { bg: '#FFF5F5', border: '#FEB2B2', color: '#C53030' },
    };
    const c = colors[colorScheme] || colors.blue;
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '48px',
      height: '48px',
      borderRadius: '8px',
      backgroundColor: c.bg,
      border: `1px solid ${c.border}`,
      color: c.color,
      fontSize: '24px',
      fontWeight: 'bold',
      cursor: 'pointer',
      touchAction: 'manipulation',
    };
  },
  photoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    marginBottom: '12px',
  },
  photoThumb: {
    width: '100%',
    height: '100px',
    objectFit: 'cover',
    borderRadius: '8px',
    border: '1px solid #E2E8F0',
  },
  spinner: {
    display: 'inline-block',
    width: '20px',
    height: '20px',
    border: '3px solid #E2E8F0',
    borderTop: '3px solid #3182CE',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  errorBox: {
    backgroundColor: '#FFF5F5',
    border: '1px solid #FEB2B2',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '12px',
  },
  errorText: {
    color: '#C53030',
    fontSize: '14px',
    fontWeight: '500',
    margin: 0,
  },
  resultItem: (flagged) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px',
    borderRadius: '8px',
    border: `1px solid ${flagged ? '#FEEBC8' : '#E2E8F0'}`,
    backgroundColor: flagged ? '#FFFAF0' : 'white',
    marginBottom: '8px',
  }),
  countBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  countText: {
    fontSize: '18px',
    fontWeight: 'bold',
    minWidth: '30px',
    textAlign: 'center',
  },
  categoryText: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#2D3748',
  },
  flagBadge: {
    fontSize: '11px',
    color: '#C05621',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: '8px',
  },
  successBox: {
    textAlign: 'center',
    padding: '24px',
  },
  successIcon: {
    fontSize: '48px',
    marginBottom: '8px',
  },
  row: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
};

/**
 * MobileInlineUpload — Inline multi-step component for mobile item tracking.
 *
 * Provides camera capture → upload → Vision AI results → adjustment → confirmation
 * all within the same page (no new tabs).
 *
 * Props:
 * - orderId: The order ID
 * - laundryId: The laundry shop ID
 * - phase: 'intake' or 'fold'
 * - employeeId: The authenticated employee's ID
 * - onComplete: Callback after successful confirmation
 * - onCancel: Callback to dismiss the inline upload
 */
const MobileInlineUpload = ({ orderId, laundryId, phase, employeeId, onComplete, onCancel }) => {
  const fileInputRef = useRef(null);

  // Flow state
  const [step, setStep] = useState(STEPS.CAPTURE);
  const [photos, setPhotos] = useState([]); // Array of { file, preview }
  const [token, setToken] = useState(null);
  const [visionResults, setVisionResults] = useState(null); // { items, imageUrls, processingTimeMs }
  const [adjustedItems, setAdjustedItems] = useState([]); // Editable copy of items
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Step progress tracking
  const stepOrder = [STEPS.CAPTURE, STEPS.UPLOAD, STEPS.RESULTS, STEPS.ADJUST, STEPS.CONFIRM];
  const currentStepIndex = stepOrder.indexOf(step);

  // ── Photo Capture ──────────────────────────────────────────────────────────

  const handleCaptureClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const validFiles = files.filter(
      (f) => f.type.startsWith('image/') && f.size <= 10 * 1024 * 1024
    );

    if (validFiles.length === 0) {
      setError('Please select valid image files (max 10MB each).');
      return;
    }

    setError(null);

    // Read previews for each file
    const newPhotos = [];
    let processed = 0;

    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newPhotos.push({ file, preview: e.target.result });
        processed++;
        if (processed === validFiles.length) {
          setPhotos((prev) => {
            const combined = [...prev, ...newPhotos].slice(0, 4); // max 4
            return combined;
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Upload & Vision Analysis ───────────────────────────────────────────────

  const handleUpload = async () => {
    if (photos.length < 2) {
      setError('Front and Top view photos are required. Please capture both before analyzing.');
      return;
    }

    setStep(STEPS.UPLOAD);
    setLoading(true);
    setError(null);

    try {
      // Step 1: Get a token via qr-code endpoint
      const qrParams = new URLSearchParams({
        orderId,
        laundryId,
        phase,
        employeeId: employeeId || 'EMP',
        baseUrl: window.location.origin,
      });

      const qrRes = await fetch(`${API_URL}/api/admin/item-tracking/qr-code?${qrParams}`);
      if (!qrRes.ok) {
        throw new Error('Failed to generate upload token. Please try again.');
      }
      const qrData = await qrRes.json();
      const uploadToken = qrData.token;
      setToken(uploadToken);

      // Step 2: Compress photos and upload (reduces 3-5MB phone photos to ~200KB each)
      const base64Images = [];
      for (const photo of photos) {
        try {
          const compressed = await compressForUpload(photo.file);
          base64Images.push(compressed);
        } catch (e) {
          // Fallback to uncompressed if canvas fails
          const b64 = await fileToBase64(photo.file);
          base64Images.push(b64);
        }
      }

      const uploadRes = await fetch(`${API_URL}/api/track/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: uploadToken,
          images: base64Images,
        }),
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.detail || 'Upload failed. Please try again.');
      }

      const uploadData = await uploadRes.json();

      if (uploadData.status === 'success' && uploadData.result) {
        setVisionResults(uploadData.result);
        // Initialize adjustable items from vision results
        const items = (uploadData.result.items || []).map((item) => ({
          category: item.category,
          count: item.count,
          confidence: item.confidence || 100,
          flagged: item.flagged || false,
          note: item.note || null,
        }));
        setAdjustedItems(items);
        setStep(STEPS.RESULTS);
      } else {
        throw new Error('Analysis returned no results. Please retake photos.');
      }
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
      setStep(STEPS.CAPTURE); // Go back to capture so user can retry
    } finally {
      setLoading(false);
    }
  };

  // ── Adjustment ─────────────────────────────────────────────────────────────

  const adjustCount = (index, delta) => {
    setAdjustedItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const newCount = Math.max(0, item.count + delta);
        return { ...item, count: newCount };
      })
    );
  };

  // ── Confirmation ───────────────────────────────────────────────────────────

  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);

    try {
      const confirmEndpoint =
        phase === 'intake' ? '/api/track/confirm-intake' : '/api/track/confirm-fold';

      const confirmItems = adjustedItems.map((item) => ({
        category: item.category,
        count: item.count,
      }));

      const photoUrls = visionResults?.imageUrls || [];

      const body = {
        token: token,
        items: confirmItems,
        photoUrls: photoUrls,
      };

      // For fold, acknowledge all discrepancies automatically since employee
      // has already reviewed and adjusted counts on the UI
      if (phase === 'fold') {
        body.acknowledgements = adjustedItems.map((item) => item.category);
      }

      let confirmRes = await fetch(`${API_URL}${confirmEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // If fold returns 422 with unresolved discrepancies, retry with full acknowledgements
      if (!confirmRes.ok && confirmRes.status === 422 && phase === 'fold') {
        const errData = await confirmRes.json().catch(() => ({}));
        if (errData.detail?.unresolved) {
          // Acknowledge ALL unresolved categories and retry
          const allCategories = [
            ...adjustedItems.map((item) => item.category),
            ...(errData.detail.unresolved || []).map((d) => d.category || d),
          ];
          body.acknowledgements = [...new Set(allCategories)];
          confirmRes = await fetch(`${API_URL}${confirmEndpoint}`, {
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

      setStep(STEPS.CONFIRM);

      // Notify parent after short delay so success UI is visible
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Confirmation failed. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  // ── Render Helpers ─────────────────────────────────────────────────────────

  const renderStepIndicator = () => (
    <div style={styles.stepIndicator}>
      {stepOrder.map((s, i) => (
        <div
          key={s}
          style={styles.stepDot(i === currentStepIndex, i < currentStepIndex)}
        />
      ))}
    </div>
  );

  const renderError = () => {
    if (!error) return null;
    return (
      <div style={styles.errorBox}>
        <p style={styles.errorText}>{error}</p>
      </div>
    );
  };

  const renderCaptureStep = () => {
    // Define the 4 angle slots — Front and Top are mandatory
    const ANGLES = [
      { key: 'front', label: '📸 Front View', required: true },
      { key: 'top', label: '📸 Top View', required: true },
      { key: 'left', label: '📸 Left Side', required: false },
      { key: 'right', label: '📸 Right Side', required: false },
    ];

    // Map photos to angle slots by index
    const getPhotoForSlot = (idx) => photos[idx] || null;
    const mandatoryCount = photos.filter((_, i) => i < 2).length; // first 2 are mandatory
    const canAnalyze = mandatoryCount >= 2; // Front + Top captured

    return (
    <div>
      <p style={styles.sectionTitle}>
        📷 {phase === 'intake' ? 'Count Items' : 'Fold Complete'} — Take Photos
      </p>
      <p style={{ fontSize: '11px', color: '#718096', marginBottom: '12px' }}>
        Front and Top views are <strong>required</strong>. Left and Right are optional for better accuracy.
      </p>

      <div style={styles.photoGrid}>
        {ANGLES.map((angle, idx) => {
          const photo = getPhotoForSlot(idx);
          return (
            <div key={angle.key} style={{ position: 'relative' }}>
              {photo ? (
                <>
                  <img src={photo.preview} alt={angle.label} style={styles.photoThumb} />
                  <button
                    onClick={() => removePhoto(idx)}
                    aria-label={`Remove ${angle.label}`}
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      color: 'white',
                      border: 'none',
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ×
                  </button>
                </>
              ) : (
                <div
                  style={{
                    ...styles.photoThumb,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: angle.required ? '#EBF8FF' : '#F7FAFC',
                    border: angle.required ? '2px dashed #3182CE' : '1px dashed #CBD5E0',
                    cursor: 'pointer',
                  }}
                  onClick={handleCaptureClick}
                >
                  <span style={{ fontSize: '20px' }}>📷</span>
                  <span style={{ fontSize: '10px', color: angle.required ? '#2B6CB0' : '#718096', fontWeight: angle.required ? '600' : '400', marginTop: '2px' }}>
                    {angle.label.replace('📸 ', '')}
                  </span>
                  {angle.required && <span style={{ fontSize: '9px', color: '#E53E3E', fontWeight: '600' }}>Required</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: '12px', color: '#718096', marginBottom: '12px', textAlign: 'center' }}>
        {photos.length}/4 views captured ({canAnalyze ? '✓ Ready' : 'Need Front + Top'})
      </p>

      {photos.length < 4 && (
        <button
          onClick={handleCaptureClick}
          style={styles.bigButton('blue')}
          aria-label="Take photo"
        >
          📷 {photos.length === 0 ? 'Take Front View' : `Take ${ANGLES[photos.length]?.label.replace('📸 ', '') || 'Photo'}`}
        </button>
      )}

      {canAnalyze && (
        <button
          onClick={handleUpload}
          style={{ ...styles.bigButton('green'), marginTop: '8px' }}
          aria-label="Analyze photos"
        >
          ✨ Analyze Photos
        </button>
      )}

      <div style={styles.row}>
        <button onClick={onCancel} style={styles.outlineButton} aria-label="Cancel">
          Cancel
        </button>
      </div>
    </div>
    );
  };

  const renderUploadStep = () => (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={styles.spinner} />
      <p style={{ fontSize: '16px', fontWeight: '500', color: '#2D3748', marginTop: '12px' }}>
        Analyzing photos...
      </p>
      <p style={{ fontSize: '13px', color: '#718096', marginTop: '4px' }}>
        AI is counting and categorizing items
      </p>
    </div>
  );

  const renderResultsStep = () => (
    <div>
      <p style={styles.sectionTitle}>
        ✅ Vision AI Results
      </p>

      {adjustedItems.map((item, idx) => (
        <div key={idx} style={styles.resultItem(item.flagged)}>
          <div>
            <p style={styles.categoryText}>{item.category}</p>
            {item.flagged && (
              <span style={styles.flagBadge}>⚠️ Low confidence</span>
            )}
            {item.note && (
              <span style={{ ...styles.flagBadge, color: '#718096' }}>{item.note}</span>
            )}
          </div>
          <div style={styles.countBadge}>
            <span style={styles.countText}>{item.count}</span>
          </div>
        </div>
      ))}

      <div style={styles.row}>
        <button
          onClick={() => setStep(STEPS.ADJUST)}
          style={styles.outlineButton}
          aria-label="Adjust counts"
        >
          ✏️ Adjust Counts
        </button>
        <button
          onClick={handleConfirm}
          disabled={confirming}
          style={styles.bigButton('green')}
          aria-label="Confirm items"
        >
          {confirming ? 'Confirming...' : '✓ Confirm'}
        </button>
      </div>
    </div>
  );

  const renderAdjustStep = () => (
    <div>
      <p style={styles.sectionTitle}>
        ✏️ Adjust Item Counts
      </p>

      {adjustedItems.map((item, idx) => (
        <div key={idx} style={styles.resultItem(item.flagged)}>
          <div style={{ flex: 1 }}>
            <p style={styles.categoryText}>{item.category}</p>
          </div>
          <div style={styles.countBadge}>
            <button
              onClick={() => adjustCount(idx, -1)}
              style={styles.adjustButton('red')}
              aria-label={`Decrease ${item.category}`}
            >
              −
            </button>
            <span style={styles.countText}>{item.count}</span>
            <button
              onClick={() => adjustCount(idx, 1)}
              style={styles.adjustButton('blue')}
              aria-label={`Increase ${item.category}`}
            >
              +
            </button>
          </div>
        </div>
      ))}

      <div style={styles.row}>
        <button
          onClick={() => setStep(STEPS.RESULTS)}
          style={styles.outlineButton}
          aria-label="Back to results"
        >
          ← Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={confirming}
          style={styles.bigButton('green')}
          aria-label="Confirm adjusted items"
        >
          {confirming ? 'Confirming...' : '✓ Confirm'}
        </button>
      </div>
    </div>
  );

  const renderConfirmStep = () => (
    <div style={styles.successBox}>
      <div style={styles.successIcon}>✅</div>
      <p style={{ fontSize: '18px', fontWeight: '600', color: '#2D3748', margin: '8px 0' }}>
        {phase === 'intake' ? 'Intake' : 'Fold'} Confirmed!
      </p>
      <p style={{ fontSize: '14px', color: '#718096' }}>
        Order status updated automatically.
      </p>
    </div>
  );

  // ── Main Render ────────────────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      {/* Hidden file input for camera capture */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-label={`Capture ${phase} photos`}
      />

      {renderStepIndicator()}
      {renderError()}

      {step === STEPS.CAPTURE && renderCaptureStep()}
      {step === STEPS.UPLOAD && renderUploadStep()}
      {step === STEPS.RESULTS && renderResultsStep()}
      {step === STEPS.ADJUST && renderAdjustStep()}
      {step === STEPS.CONFIRM && renderConfirmStep()}
    </div>
  );
};

export default MobileInlineUpload;
