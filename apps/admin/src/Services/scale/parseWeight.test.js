import { parseWeight } from './parseWeight';

describe('parseWeight', () => {
  it('parses a stable Toledo/CAS-style line', () => {
    const r = parseWeight('ST,GS,+  12.50 lb');
    expect(r.value).toBe(12.5);
    expect(r.unit).toBe('lb');
    expect(r.stable).toBe(true);
  });

  it('marks unstable lines as not stable', () => {
    const r = parseWeight('US,NT,   3.2 kg');
    expect(r.value).toBe(3.2);
    expect(r.unit).toBe('kg');
    expect(r.stable).toBe(false);
  });

  it('parses fixed-width sign-attached values', () => {
    const r = parseWeight('+0012.50LB');
    expect(r.value).toBe(12.5);
    expect(r.unit).toBe('lb');
  });

  it('parses a bare "12.5 lb"', () => {
    const r = parseWeight('12.5 lb');
    expect(r.value).toBe(12.5);
    expect(r.unit).toBe('lb');
    expect(r.stable).toBe(true); // no status token => assume stable
  });

  it('handles a trailing status token', () => {
    const r = parseWeight('  0.00 kg ST');
    expect(r.value).toBe(0);
    expect(r.unit).toBe('kg');
    expect(r.stable).toBe(true);
  });

  it('parses negative (tare) values', () => {
    const r = parseWeight('ST,GS,-2.30 lb');
    expect(r.value).toBe(-2.3);
    expect(r.unit).toBe('lb');
  });

  it('recognizes oz and g units', () => {
    expect(parseWeight('8.0 oz').unit).toBe('oz');
    expect(parseWeight('500 g').unit).toBe('g');
    expect(parseWeight('1.2 kgs').unit).toBe('kg');
    expect(parseWeight('3 lbs').unit).toBe('lb');
  });

  it('returns null value for lines with no number', () => {
    const r = parseWeight('ERROR');
    expect(r.value).toBeNull();
  });

  it('returns empty reading for null/empty input', () => {
    expect(parseWeight(null).value).toBeNull();
    expect(parseWeight('').value).toBeNull();
    expect(parseWeight('   ').value).toBeNull();
    expect(parseWeight(42).value).toBeNull();
  });

  it('returns a value with null unit when unit is absent', () => {
    const r = parseWeight('ST 15.0');
    expect(r.value).toBe(15.0);
    expect(r.unit).toBeNull();
  });
});
