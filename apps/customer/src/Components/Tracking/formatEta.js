/**
 * Formats a duration in seconds into a human-readable ETA string.
 *
 * @param {number} durationSeconds - Duration in seconds
 * @returns {string} Formatted ETA string
 *
 * Examples:
 *   formatEta(300)   → "Arriving in ~5 min"
 *   formatEta(3661)  → "Arriving in ~1 hr 2 min"
 *   formatEta(7200)  → "Arriving in ~2 hr"
 *   formatEta(0)     → "Arriving soon"
 *   formatEta(-5)    → "Arriving soon"
 */
export function formatEta(durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) {
    return 'Arriving soon';
  }

  const totalMinutes = Math.ceil(durationSeconds / 60);

  if (totalMinutes < 60) {
    return `Arriving in ~${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (remainingMinutes === 0) {
    return `Arriving in ~${hours} hr`;
  }

  return `Arriving in ~${hours} hr ${remainingMinutes} min`;
}
