/**
 * Shared types/constants for scale integration (scale-integration-bag-tags spec).
 *
 * A Reading is the normalized result of parsing one line/frame emitted by a
 * digital scale:
 *   {
 *     value: number | null,   // numeric weight in `unit`, null if unparseable
 *     unit: 'lb'|'kg'|'oz'|'g'|null,
 *     stable: boolean         // true when the scale reports a settled reading
 *   }
 *
 * This module has no hardware or React dependency so it can be unit-tested.
 */

export const SCALE_UNITS = ['lb', 'kg', 'oz', 'g'];

/**
 * @typedef {Object} Reading
 * @property {number|null} value
 * @property {'lb'|'kg'|'oz'|'g'|null} unit
 * @property {boolean} stable
 */

/** An empty/failed reading. */
export const EMPTY_READING = { value: null, unit: null, stable: false };
