import fc from 'fast-check';
import { formatEta } from './formatEta';

/**
 * Feature: live-driver-tracking, Property 6: ETA formatting
 * Validates: Requirements 7.3
 *
 * For any positive duration in seconds (1 to 86400), the ETA formatting function
 * SHALL produce a human-readable string matching the pattern "Arriving in ~X min"
 * (for durations under 60 minutes) or "Arriving in ~X hr Y min" (for durations
 * 60 minutes or more), where X and Y are positive integers.
 */

const durationArb = fc.integer({ min: 1, max: 86400 });

describe('Property 6: ETA formatting', () => {
  it('output always starts with "Arriving in ~" for any duration in [1, 86400]', () => {
    fc.assert(
      fc.property(durationArb, (seconds) => {
        const result = formatEta(seconds);
        expect(result.startsWith('Arriving in ~')).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('for durations where ceil(seconds/60) < 60, output matches "Arriving in ~X min" where X is a positive integer', () => {
    // Math.ceil(seconds/60) < 60 means seconds <= 3540 (since ceil(3540/60)=59)
    const underOneHourOutput = fc.integer({ min: 1, max: 3540 });
    fc.assert(
      fc.property(underOneHourOutput, (seconds) => {
        const result = formatEta(seconds);
        const match = result.match(/^Arriving in ~(\d+) min$/);
        expect(match).not.toBeNull();
        const minutes = parseInt(match[1], 10);
        expect(minutes).toBeGreaterThan(0);
        expect(Number.isInteger(minutes)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('for durations where ceil(seconds/60) >= 60, output matches "Arriving in ~X hr" or "Arriving in ~X hr Y min"', () => {
    // Math.ceil(seconds/60) >= 60 means seconds >= 3541 (since ceil(3541/60)=60)
    const oneHourOrMore = fc.integer({ min: 3541, max: 86400 });
    fc.assert(
      fc.property(oneHourOrMore, (seconds) => {
        const result = formatEta(seconds);
        const matchWithMinutes = result.match(/^Arriving in ~(\d+) hr (\d+) min$/);
        const matchHoursOnly = result.match(/^Arriving in ~(\d+) hr$/);
        const matched = matchWithMinutes !== null || matchHoursOnly !== null;
        expect(matched).toBe(true);

        if (matchWithMinutes) {
          const hours = parseInt(matchWithMinutes[1], 10);
          const mins = parseInt(matchWithMinutes[2], 10);
          expect(hours).toBeGreaterThan(0);
          expect(mins).toBeGreaterThan(0);
          expect(Number.isInteger(hours)).toBe(true);
          expect(Number.isInteger(mins)).toBe(true);
        }

        if (matchHoursOnly) {
          const hours = parseInt(matchHoursOnly[1], 10);
          expect(hours).toBeGreaterThan(0);
          expect(Number.isInteger(hours)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('X and Y values are always positive integers', () => {
    fc.assert(
      fc.property(durationArb, (seconds) => {
        const result = formatEta(seconds);
        // Extract all numeric values from the output
        const numbers = result.match(/\d+/g);
        expect(numbers).not.toBeNull();
        numbers.forEach((numStr) => {
          const num = parseInt(numStr, 10);
          expect(num).toBeGreaterThan(0);
          expect(Number.isInteger(num)).toBe(true);
        });
      }),
      { numRuns: 100 }
    );
  });
});
