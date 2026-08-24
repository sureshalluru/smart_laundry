import type { CategoryTally, DetectionEvent } from '../types';

/** Confidence at or above this threshold is considered high-confidence. */
export const LOW_CONFIDENCE_THRESHOLD = 70;

/**
 * Whether a detection should be visually flagged as low-confidence.
 *
 * Flagged if and only if the event has a numeric confidence strictly below
 * {@link LOW_CONFIDENCE_THRESHOLD}. Events without a confidence score are
 * treated as high-confidence (not flagged) so a missing score never blocks
 * display.
 *
 * @remarks Requirement 1.5.
 */
export function isLowConfidence(event: DetectionEvent): boolean {
  return typeof event.confidence === 'number' && event.confidence < LOW_CONFIDENCE_THRESHOLD;
}

/**
 * Aggregate a stream of detections into per-`cloth_type` tallies.
 *
 * The returned map keys are category names (`cloth_type`). For each category
 * the `count` equals the number of events with that `cloth_type`, and `items`
 * holds those events in input order. The sum of all counts equals the total
 * number of aggregated events.
 *
 * @param events detections to aggregate
 * @param seedCategories categories that must appear (with count 0 if unseen),
 *   e.g. the persisted known-category list so tallies render before the first
 *   detection arrives (Req 12.4).
 * @remarks Requirements 1.2, 1.3, 5.2.
 */
export function aggregateTallies(
  events: readonly DetectionEvent[],
  seedCategories: readonly string[] = [],
): Map<string, CategoryTally> {
  const tallies = new Map<string, CategoryTally>();

  for (const category of seedCategories) {
    if (!tallies.has(category)) {
      tallies.set(category, { category, count: 0, items: [] });
    }
  }

  for (const event of events) {
    let tally = tallies.get(event.clothType);
    if (!tally) {
      tally = { category: event.clothType, count: 0, items: [] };
      tallies.set(event.clothType, tally);
    }
    tally.count += 1;
    tally.items.push(event);
  }

  return tallies;
}

/**
 * Derive the active category set: the union of the persisted known categories
 * and the distinct `cloth_type` values observed in the detection stream.
 *
 * @remarks Requirements 12.1, 12.2.
 */
export function deriveCategories(
  knownCategories: readonly string[],
  events: readonly DetectionEvent[],
): string[] {
  const set = new Set<string>(knownCategories);
  for (const event of events) {
    set.add(event.clothType);
  }
  return [...set];
}
