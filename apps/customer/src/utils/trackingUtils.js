/**
 * Tracking utility functions for the customer live tracking map.
 * Extracted for testability and reuse.
 */

/**
 * Calculate the distance between two GPS points using the Haversine formula.
 * @param {{ lat: number, lng: number }} pos1
 * @param {{ lat: number, lng: number }} pos2
 * @returns {number} Distance in meters
 */
export function haversineDistance(pos1, pos2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((pos2.lat - pos1.lat) * Math.PI) / 180;
  const dLng = ((pos2.lng - pos1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((pos1.lat * Math.PI) / 180) *
      Math.cos((pos2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Linear interpolation between two map positions.
 * @param {{ lat: number, lng: number }} start
 * @param {{ lat: number, lng: number }} end
 * @param {number} t - Interpolation factor [0, 1]
 * @returns {{ lat: number, lng: number }}
 */
export function lerp(start, end, t) {
  const clampedT = Math.max(0, Math.min(1, t));
  return {
    lat: start.lat + (end.lat - start.lat) * clampedT,
    lng: start.lng + (end.lng - start.lng) * clampedT,
  };
}

/**
 * Check if the driver is within arrival distance of the destination.
 * @param {{ lat: number, lng: number }} driverPos
 * @param {{ lat: number, lng: number }} destinationPos
 * @param {number} [threshold=200] - Distance in meters
 * @returns {boolean}
 */
export function isArriving(driverPos, destinationPos, threshold = 200) {
  if (!driverPos || !destinationPos) return false;
  return haversineDistance(driverPos, destinationPos) <= threshold;
}

/**
 * Easing function (ease-in-out) for smoother animation.
 * @param {number} t - Time factor [0, 1]
 * @returns {number}
 */
export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Calculate heading angle from one position to another.
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @returns {number} Heading in degrees [0, 360)
 */
export function calculateHeading(from, to) {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const fromLat = (from.lat * Math.PI) / 180;
  const toLat = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLng);
  const heading = (Math.atan2(y, x) * 180) / Math.PI;
  return (heading + 360) % 360;
}
