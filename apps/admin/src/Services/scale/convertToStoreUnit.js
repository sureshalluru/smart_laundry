/**
 * Convert a scale Reading's value into the store's configured unit.
 * (scale-integration-bag-tags spec)
 *
 * The store bills in one unit (lb by default). Scales may report kg/oz/g, so
 * we convert to the store unit and round to one decimal — matching the
 * existing toFixed(1) behavior in MobileWeightEntry.
 *
 * Pure function, no hardware/React dependency.
 */

// Factors to convert 1 <fromUnit> into pounds.
const TO_LB = {
  lb: 1,
  kg: 2.2046226218,
  oz: 0.0625,
  g: 0.0022046226218,
};

// Factors to convert 1 lb into <toUnit>.
const FROM_LB = {
  lb: 1,
  kg: 0.45359237,
  oz: 16,
  g: 453.59237,
};

/**
 * @param {{value: number|null, unit: string|null}} reading
 * @param {'lb'|'kg'|'oz'|'g'} [storeUnit='lb']
 * @returns {{value: number|null, unit: string, converted: boolean, lowConfidence: boolean}}
 *   - value: converted numeric value rounded to 1 decimal (or null)
 *   - unit: the store unit
 *   - converted: true if a unit conversion was applied
 *   - lowConfidence: true when the source unit was unknown and we assumed the
 *     store unit (caller should ask the employee to confirm rather than trust it)
 */
export function convertToStoreUnit(reading, storeUnit = 'lb') {
  const unit = (storeUnit || 'lb').toLowerCase();
  const target = FROM_LB[unit] != null ? unit : 'lb';

  if (!reading || reading.value == null || Number.isNaN(reading.value)) {
    return { value: null, unit: target, converted: false, lowConfidence: false };
  }

  const from = reading.unit ? reading.unit.toLowerCase() : null;

  // Unknown/missing source unit: assume it's already the store unit, but flag it.
  if (!from || TO_LB[from] == null) {
    return {
      value: round1(reading.value),
      unit: target,
      converted: false,
      lowConfidence: true,
    };
  }

  if (from === target) {
    return { value: round1(reading.value), unit: target, converted: false, lowConfidence: false };
  }

  const inLb = reading.value * TO_LB[from];
  const out = inLb * FROM_LB[target];
  return { value: round1(out), unit: target, converted: true, lowConfidence: false };
}

function round1(n) {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}
