import { convertToStoreUnit } from './convertToStoreUnit';

describe('convertToStoreUnit', () => {
  it('passes through when unit already matches store unit', () => {
    const r = convertToStoreUnit({ value: 12.5, unit: 'lb' }, 'lb');
    expect(r.value).toBe(12.5);
    expect(r.unit).toBe('lb');
    expect(r.converted).toBe(false);
    expect(r.lowConfidence).toBe(false);
  });

  it('converts kg -> lb rounded to 1 decimal', () => {
    const r = convertToStoreUnit({ value: 1, unit: 'kg' }, 'lb');
    expect(r.value).toBe(2.2); // 2.2046 -> 2.2
    expect(r.unit).toBe('lb');
    expect(r.converted).toBe(true);
  });

  it('converts oz -> lb', () => {
    const r = convertToStoreUnit({ value: 16, unit: 'oz' }, 'lb');
    expect(r.value).toBe(1.0);
    expect(r.converted).toBe(true);
  });

  it('converts g -> lb', () => {
    const r = convertToStoreUnit({ value: 1000, unit: 'g' }, 'lb');
    expect(r.value).toBe(2.2); // 2.2046 -> 2.2
  });

  it('converts lb -> kg when store unit is kg', () => {
    const r = convertToStoreUnit({ value: 10, unit: 'lb' }, 'kg');
    expect(r.value).toBe(4.5); // 4.5359 -> 4.5
    expect(r.unit).toBe('kg');
    expect(r.converted).toBe(true);
  });

  it('flags low confidence when source unit is unknown', () => {
    const r = convertToStoreUnit({ value: 9.99, unit: null }, 'lb');
    expect(r.value).toBe(10.0); // rounded, assumed already in store unit
    expect(r.lowConfidence).toBe(true);
    expect(r.converted).toBe(false);
  });

  it('returns null value for null reading value', () => {
    const r = convertToStoreUnit({ value: null, unit: 'lb' }, 'lb');
    expect(r.value).toBeNull();
  });

  it('defaults store unit to lb when omitted or invalid', () => {
    expect(convertToStoreUnit({ value: 1, unit: 'kg' }).unit).toBe('lb');
    expect(convertToStoreUnit({ value: 1, unit: 'kg' }, 'furlong').unit).toBe('lb');
  });
});
