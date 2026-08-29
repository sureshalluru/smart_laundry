/**
 * Pure parser for digital-scale serial output (scale-integration-bag-tags spec).
 *
 * Common bench/counter scales stream ASCII lines over serial/USB. Formats vary
 * by vendor, but most look like one of:
 *   "ST,GS,+  12.50 lb"     (stable, gross, +12.50 lb)   — Toledo/CAS style
 *   "US,NT,   3.2 kg"       (unstable, net)
 *   "+0012.50LB"            (fixed-width, no separators)
 *   "12.5 lb"               (bare)
 *   "  0.00 kg ST"          (status suffix)
 *
 * parseWeight() extracts a normalized Reading without any hardware dependency,
 * so it is fully unit-testable. All the fragile vendor-format handling lives
 * here and nowhere else.
 */

import { EMPTY_READING } from './scaleTypes';

const UNIT_MAP = {
  lb: 'lb', lbs: 'lb', 'lb.': 'lb',
  kg: 'kg', kgs: 'kg',
  oz: 'oz',
  g: 'g', gr: 'g',
};

/**
 * Determine stability from status tokens if present.
 * "ST" / "S" => stable; "US" / "U" => unstable. Absent => assume stable
 * (many simple scales only emit a value when settled).
 *
 * @param {string} raw
 * @returns {boolean}
 */
function detectStable(raw) {
  const upper = raw.toUpperCase();
  // Unstable markers win if both somehow appear
  if (/\bUS\b/.test(upper) || /\bUNSTABLE\b/.test(upper)) return false;
  if (/(^|[,\s])U([,\s]|$)/.test(upper)) return false;
  if (/\bST\b/.test(upper) || /\bSTABLE\b/.test(upper)) return true;
  if (/(^|[,\s])S([,\s]|$)/.test(upper)) return true;
  return true;
}

/**
 * Parse a single raw scale line into a normalized Reading.
 *
 * @param {string} raw
 * @returns {import('./scaleTypes').Reading}
 */
export function parseWeight(raw) {
  if (raw == null || typeof raw !== 'string') return { ...EMPTY_READING };

  const trimmed = raw.trim();
  if (!trimmed) return { ...EMPTY_READING };

  const stable = detectStable(trimmed);

  // Find a signed decimal number. Allow a sign directly attached (e.g. "+0012.50").
  const numMatch = trimmed.match(/[-+]?\d+(?:\.\d+)?/);
  if (!numMatch) return { value: null, unit: null, stable };

  const value = parseFloat(numMatch[0]);
  if (Number.isNaN(value)) return { value: null, unit: null, stable };

  // Find a unit token anywhere in the line (case-insensitive), preferring one
  // that appears after the number.
  let unit = null;
  const afterNumber = trimmed.slice(numMatch.index + numMatch[0].length);
  const unitRegex = /([a-zA-Z]{1,3}\.?)/g;
  const searchSpaces = [afterNumber, trimmed];
  for (const space of searchSpaces) {
    let m;
    unitRegex.lastIndex = 0;
    while ((m = unitRegex.exec(space)) !== null) {
      const token = m[1].toLowerCase();
      if (UNIT_MAP[token]) {
        unit = UNIT_MAP[token];
        break;
      }
    }
    if (unit) break;
  }

  return { value, unit, stable };
}
