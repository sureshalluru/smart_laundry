import type { CategoryComparison, CategoryTally } from '../types';

/** Read a category's count from a tally map, defaulting to 0 when absent. */
function countOf(tallies: ReadonlyMap<string, CategoryTally>, category: string): number {
  return tallies.get(category)?.count ?? 0;
}

/**
 * Build the Before/After comparison rows for discrepancy detection.
 *
 * Produces exactly one row per category present in either the Before Wash or
 * After Wash tallies. Each row's `difference` is `afterCount - beforeCount`.
 * A row is a discrepancy when its `difference` is nonzero. Rows start
 * unresolved (`isResolved = false`) unless overridden via `resolvedCategories`.
 *
 * @param resolvedCategories categories already resolved by the employee via
 *   /move_cloth/; used to preserve resolution state across recomputes.
 * @remarks Requirements 5.1, 5.4.
 */
export function buildComparisons(
  beforeTallies: ReadonlyMap<string, CategoryTally>,
  afterTallies: ReadonlyMap<string, CategoryTally>,
  resolvedCategories: ReadonlySet<string> = new Set(),
): CategoryComparison[] {
  const categories = new Set<string>([...beforeTallies.keys(), ...afterTallies.keys()]);

  const rows: CategoryComparison[] = [];
  for (const category of categories) {
    const beforeCount = countOf(beforeTallies, category);
    const afterCount = countOf(afterTallies, category);
    rows.push({
      category,
      beforeCount,
      afterCount,
      difference: afterCount - beforeCount,
      isResolved: resolvedCategories.has(category),
    });
  }
  return rows;
}

/** A comparison row is a discrepancy when its counts differ. */
export function isDiscrepancy(row: CategoryComparison): boolean {
  return row.difference !== 0;
}

/**
 * A row is an *overcount* when After exceeds Before (difference > 0). Overcounts
 * are meaningful at any time — including mid-session — because there is no
 * legitimate way to fold more of a category than was received. Undercounts
 * (difference < 0) are expected mid-session (items not folded yet) and only
 * signify a true gap once folding is finalized.
 */
export function isOvercount(row: CategoryComparison): boolean {
  return row.difference > 0;
}

/**
 * Whether to warn mid-session: true iff any category is over-counted. This
 * avoids false alarms from out-of-order folding, where undercounts are normal
 * until the session is finalized.
 */
export function hasMidSessionWarning(rows: readonly CategoryComparison[]): boolean {
  return rows.some(isOvercount);
}

/** The subset of rows that are discrepancies. */
export function discrepantRows(rows: readonly CategoryComparison[]): CategoryComparison[] {
  return rows.filter(isDiscrepancy);
}

/**
 * Whether the discrepancy alert should be triggered: true iff at least one row
 * is a discrepancy.
 *
 * @remarks Requirement 5.1.
 */
export function shouldAlert(rows: readonly CategoryComparison[]): boolean {
  return rows.some(isDiscrepancy);
}

/**
 * Whether the discrepancy alert should be dismissed: true iff every
 * discrepancy is marked resolved. An empty discrepancy set is trivially
 * dismissible.
 *
 * @remarks Requirement 5.7.
 */
export function allDiscrepanciesResolved(rows: readonly CategoryComparison[]): boolean {
  return rows.filter(isDiscrepancy).every((row) => row.isResolved);
}
