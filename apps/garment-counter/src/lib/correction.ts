import type { CategoryTally, DetectionEvent } from '../types';

/** Deep-ish clone of a tally map so the transform stays pure. */
function cloneTallies(
  tallies: ReadonlyMap<string, CategoryTally>,
): Map<string, CategoryTally> {
  const next = new Map<string, CategoryTally>();
  for (const [category, tally] of tallies) {
    next.set(category, {
      category: tally.category,
      count: tally.count,
      items: [...tally.items],
    });
  }
  return next;
}

/**
 * Move the item identified by `clothId` from its current category tally to
 * `targetCategory`, returning a new tally map (inputs are not mutated).
 *
 * The moved item is marked `isModified = true`. If the target category does
 * not yet exist it is created. Empty categories are retained (so a seeded
 * category that drops to zero still renders). The total number of items across
 * all categories is unchanged.
 *
 * If no item with `clothId` is found, the original map is returned unchanged
 * (cloned). Moving an item to the category it already occupies is a no-op
 * except that it still marks the item modified.
 *
 * @remarks Requirements 3.3, 3.7.
 */
export function applyCorrection(
  tallies: ReadonlyMap<string, CategoryTally>,
  clothId: number,
  targetCategory: string,
): Map<string, CategoryTally> {
  const next = cloneTallies(tallies);

  // Locate the item and its source category.
  let sourceCategory: string | null = null;
  let movedItem: DetectionEvent | null = null;
  for (const [category, tally] of next) {
    const idx = tally.items.findIndex((i) => i.clothId === clothId);
    if (idx !== -1) {
      sourceCategory = category;
      movedItem = { ...tally.items[idx], isModified: true };
      // remove from source
      tally.items.splice(idx, 1);
      tally.count = tally.items.length;
      break;
    }
  }

  if (sourceCategory === null || movedItem === null) {
    return next; // nothing to move
  }

  // Reflect the corrected classification on the item itself.
  movedItem.clothType = targetCategory;

  let target = next.get(targetCategory);
  if (!target) {
    target = { category: targetCategory, count: 0, items: [] };
    next.set(targetCategory, target);
  }
  target.items.push(movedItem);
  target.count = target.items.length;

  return next;
}
