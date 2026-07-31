/**
 * Build a location payload for the tracking API.
 * Ensures all 5 required fields are present with valid defaults.
 */
export function buildLocationPayload(coords, currentStopPosition) {
  return {
    latitude: coords?.latitude ?? 0,
    longitude: coords?.longitude ?? 0,
    heading: coords?.heading ?? 0,
    speed: Math.max(0, coords?.speed ?? 0),
    currentStopPosition: Math.max(1, currentStopPosition ?? 1),
  };
}
