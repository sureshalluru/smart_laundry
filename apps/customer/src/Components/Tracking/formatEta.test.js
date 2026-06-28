import { formatEta } from './formatEta';

describe('formatEta', () => {
  describe('edge cases', () => {
    it('returns "Arriving soon" for 0 seconds', () => {
      expect(formatEta(0)).toBe('Arriving soon');
    });

    it('returns "Arriving soon" for negative values', () => {
      expect(formatEta(-10)).toBe('Arriving soon');
    });

    it('returns "Arriving soon" for null/undefined', () => {
      expect(formatEta(null)).toBe('Arriving soon');
      expect(formatEta(undefined)).toBe('Arriving soon');
    });
  });

  describe('durations under 60 minutes', () => {
    it('returns "Arriving in ~1 min" for 1 second (rounds up)', () => {
      expect(formatEta(1)).toBe('Arriving in ~1 min');
    });

    it('returns "Arriving in ~1 min" for 59 seconds', () => {
      expect(formatEta(59)).toBe('Arriving in ~1 min');
    });

    it('returns "Arriving in ~1 min" for exactly 60 seconds', () => {
      expect(formatEta(60)).toBe('Arriving in ~1 min');
    });

    it('returns "Arriving in ~5 min" for 300 seconds', () => {
      expect(formatEta(300)).toBe('Arriving in ~5 min');
    });

    it('returns "Arriving in ~59 min" for 3540 seconds', () => {
      expect(formatEta(3540)).toBe('Arriving in ~59 min');
    });

    it('rounds up partial minutes', () => {
      expect(formatEta(61)).toBe('Arriving in ~2 min');
      expect(formatEta(121)).toBe('Arriving in ~3 min');
    });
  });

  describe('durations 60 minutes or more', () => {
    it('returns "Arriving in ~1 hr" for exactly 3600 seconds', () => {
      expect(formatEta(3600)).toBe('Arriving in ~1 hr');
    });

    it('returns "Arriving in ~1 hr 1 min" for 3601 seconds', () => {
      expect(formatEta(3601)).toBe('Arriving in ~1 hr 1 min');
    });

    it('returns "Arriving in ~1 hr 30 min" for 5400 seconds', () => {
      expect(formatEta(5400)).toBe('Arriving in ~1 hr 30 min');
    });

    it('returns "Arriving in ~2 hr" for 7200 seconds', () => {
      expect(formatEta(7200)).toBe('Arriving in ~2 hr');
    });

    it('handles very large values (24 hours)', () => {
      expect(formatEta(86400)).toBe('Arriving in ~24 hr');
    });

    it('handles very large values with remaining minutes', () => {
      expect(formatEta(86401)).toBe('Arriving in ~24 hr 1 min');
    });
  });
});
