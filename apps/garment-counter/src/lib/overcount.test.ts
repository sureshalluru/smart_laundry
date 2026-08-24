import { hasMidSessionWarning, isOvercount } from './discrepancy';
import type { CategoryComparison } from '../types';

function row(difference: number): CategoryComparison {
  return {
    category: 'shirts',
    beforeCount: 5,
    afterCount: 5 + difference,
    difference,
    isResolved: false,
  };
}

describe('mid-session overcount detection', () => {
  it('flags only over-counts (after > before), not under-counts', () => {
    expect(isOvercount(row(2))).toBe(true); // more than intake -> always suspicious
    expect(isOvercount(row(0))).toBe(false); // matched
    expect(isOvercount(row(-3))).toBe(false); // fewer folded so far -> expected mid-session
  });

  it('hasMidSessionWarning is true iff some category is over-counted', () => {
    expect(hasMidSessionWarning([row(-2), row(0)])).toBe(false);
    expect(hasMidSessionWarning([row(-2), row(1)])).toBe(true);
    expect(hasMidSessionWarning([])).toBe(false);
  });
});
