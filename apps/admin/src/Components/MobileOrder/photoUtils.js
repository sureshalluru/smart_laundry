/**
 * photoUtils.js — Shared utilities and configuration for the Unified Photo Panel.
 *
 * Exports:
 * - compressForUpload(file)     — Canvas resize to 1024px max dimension, JPEG 0.75 quality
 * - compressWithFallback(file)  — Wraps compressForUpload with FileReader fallback on canvas failure
 * - validateFile(file)          — Checks image MIME type and 10MB size limit
 * - MODE_CONFIG                 — Configuration map for all 5 photo panel modes
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Compress an image file to max 1024px and JPEG quality 0.75 before uploading.
 * Reduces 3-5MB phone photos to ~200-300KB for faster upload + faster Vision AI processing.
 *
 * @param {File} file - The image file to compress
 * @returns {Promise<string>} - Resolves with a base64 data URL (JPEG)
 */
export function compressForUpload(file) {
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
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        resolve(dataUrl);
      } catch (e) {
        reject(e); // Canvas tainted or other failure
      }
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Compress an image file with automatic fallback to FileReader on canvas failure.
 * This handles scenarios where canvas toDataURL fails (e.g., tainted canvas, CORS issues).
 *
 * @param {File} file - The image file to compress
 * @returns {Promise<string>} - Resolves with a base64 data URL
 */
export async function compressWithFallback(file) {
  try {
    return await compressForUpload(file);
  } catch {
    // Fallback: read original file as base64 without compression
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

/**
 * Validate that a file is an image type and within the 10MB size limit.
 *
 * @param {File} file - The file to validate
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateFile(file) {
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'Please select an image file (JPEG, PNG, HEIC, or WebP).' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'Photo must be less than 10MB. Please retake at lower resolution.' };
  }
  return { valid: true, error: null };
}

/**
 * MODE_CONFIG — Configuration for all 5 photo panel modes.
 *
 * Each entry defines:
 * - label: Button text
 * - emoji: Emoji icon for the button (used when icon is null)
 * - colorScheme: Chakra UI color scheme for styling
 * - flow: Which sub-component handles this mode ('weight' | 'persist' | 'vision')
 * - imageType/phase: API parameter for the specific mode
 * - maxPhotos: Maximum number of photos allowed
 * - slots: Named photo slots (vision flows only)
 * - requiredSlots: Indices of required slots (vision flows only)
 */
export const MODE_CONFIG = {
  weight: {
    label: 'Scale/Weight',
    emoji: '⚖️',
    colorScheme: 'purple',
    flow: 'weight',
    imageType: 'weight',
    maxPhotos: 10,
  },
  received: {
    label: 'Received',
    emoji: '📦',
    colorScheme: 'cyan',
    flow: 'vision',
    phase: 'intake',
    maxPhotos: 4,
    slots: ['Front View', 'Top View', 'Left Side', 'Right Side'],
    requiredSlots: [0, 1],
  },
  washing: {
    label: 'Washing',
    emoji: '🧺',
    colorScheme: 'yellow',
    flow: 'persist',
    imageType: 'washing',
    maxPhotos: 10,
  },
  drying: {
    label: 'Drying',
    emoji: '🔥',
    colorScheme: 'orange',
    flow: 'persist',
    imageType: 'drying',
    maxPhotos: 10,
  },
  fold: {
    label: 'Folded',
    emoji: '👕',
    colorScheme: 'green',
    flow: 'vision',
    phase: 'fold',
    maxPhotos: 4,
    slots: ['Front View', 'Top View', 'Left Side', 'Right Side'],
    requiredSlots: [0, 1],
  },
};
