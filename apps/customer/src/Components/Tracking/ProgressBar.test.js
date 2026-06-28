import { getActiveStageIndex } from './ProgressBar';

describe('ProgressBar - getActiveStageIndex', () => {
  it('maps OrderSubmitted to index 0 (Order Placed)', () => {
    expect(getActiveStageIndex('OrderSubmitted')).toBe(0);
  });

  it('maps ReadyForIntake to index 1 (In Progress)', () => {
    expect(getActiveStageIndex('ReadyForIntake')).toBe(1);
  });

  it('maps InProgress to index 1 (In Progress)', () => {
    expect(getActiveStageIndex('InProgress')).toBe(1);
  });

  it('maps EnRouteToDelivery to index 2 (On Its Way)', () => {
    expect(getActiveStageIndex('EnRouteToDelivery')).toBe(2);
  });

  it('maps Delivered to index 3 (Delivered)', () => {
    expect(getActiveStageIndex('Delivered')).toBe(3);
  });

  it('returns -1 for unknown status', () => {
    expect(getActiveStageIndex('UnknownStatus')).toBe(-1);
  });

  it('returns -1 for empty string', () => {
    expect(getActiveStageIndex('')).toBe(-1);
  });

  it('returns -1 for undefined', () => {
    expect(getActiveStageIndex(undefined)).toBe(-1);
  });
});
