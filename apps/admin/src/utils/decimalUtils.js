import Decimal from 'decimal.js';

// Set global rounding mode to ROUND_HALF_UP
Decimal.set({
    precision: 20, // high enough to handle big numbers
    rounding: Decimal.ROUND_HALF_UP
});

/**
 * Round to 2 decimal places using ROUND_HALF_UP
 * Returns 0 if input is invalid or non-numeric.
 */
export function roundToTwo(value) {
    try {
        const parsed = new Decimal(value);
        return parsed.toDecimalPlaces(2).toNumber();
    } catch (error) {
        console.warn(`Invalid value passed to roundToTwo:`, value, error);
        return 0;
    }
}
