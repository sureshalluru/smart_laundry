import type { DetectionEvent } from '../types';

/**
 * Tracks the highest `cloth_id` seen so far and decides whether an incoming
 * detection is "new". A detection is new if and only if its `cloth_id` is
 * strictly greater than the highest seen. The highest-seen value is
 * monotonically non-decreasing, so duplicates and out-of-order/older ids are
 * never re-processed, and every id greater than the last-seen value is
 * processed exactly once — including gaps caused by an EC2 offline period,
 * which are caught up on the next successful poll.
 *
 * @remarks Requirements 1.1, 2.2, 9.3.
 */
export class DetectionDeduper {
  private highestSeen: number;

  /**
   * @param initialHighest starting highest-seen id. Use -Infinity (default)
   * to treat the very first detection as new regardless of its id.
   */
  constructor(initialHighest: number = Number.NEGATIVE_INFINITY) {
    this.highestSeen = initialHighest;
  }

  /** The highest `cloth_id` processed so far. */
  get highest(): number {
    return this.highestSeen;
  }

  /** Whether the given id would be considered new without mutating state. */
  isNew(clothId: number): boolean {
    return clothId > this.highestSeen;
  }

  /**
   * Register a detection. If it is new, advance the highest-seen watermark and
   * return `true`. Otherwise leave state unchanged and return `false`.
   */
  accept(clothId: number): boolean {
    if (clothId > this.highestSeen) {
      this.highestSeen = clothId;
      return true;
    }
    return false;
  }
}

/**
 * Filter a batch of detections down to only the new ones (strictly greater
 * than `highestSeen`), returning them sorted ascending by `cloth_id` along
 * with the updated watermark. Pure — does not mutate its inputs.
 *
 * Handles duplicate ids within the batch (kept once), out-of-order input, and
 * gaps. Useful for offline catch-up where a single poll may surface many
 * missed detections.
 *
 * @remarks Requirements 1.1, 2.2, 9.3.
 */
export function selectNewDetections(
  detections: readonly DetectionEvent[],
  highestSeen: number,
): { newDetections: DetectionEvent[]; highestSeen: number } {
  const seenIds = new Set<number>();
  const newDetections: DetectionEvent[] = [];
  let watermark = highestSeen;

  const sorted = [...detections].sort((a, b) => a.clothId - b.clothId);
  for (const d of sorted) {
    if (d.clothId > highestSeen && !seenIds.has(d.clothId)) {
      seenIds.add(d.clothId);
      newDetections.push(d);
      if (d.clothId > watermark) watermark = d.clothId;
    }
  }

  return { newDetections, highestSeen: watermark };
}
