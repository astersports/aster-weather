/**
 * Pure, null-preserving unit conversions for the v0.8.0 engine.
 *
 * Every function takes a measurement that may be missing and returns `null`
 * for a missing one (`null`, `undefined`, `NaN` or infinite). A missing value
 * is never turned into `0`. No rounding: callers round for display.
 */
function convert(v, f) {
    if (typeof v !== "number" || !Number.isFinite(v))
        return null;
    return f(v);
}
/** Celsius to Fahrenheit. */
export const cToF = (v) => convert(v, (c) => (c * 9) / 5 + 32);
/** Kilometres per hour to miles per hour. */
export const kmhToMph = (v) => convert(v, (k) => k * 0.621371192237334);
/** Millimetres to inches. */
export const mmToIn = (v) => convert(v, (mm) => mm / 25.4);
/** Metres to miles. */
export const mToMi = (v) => convert(v, (m) => m / 1609.344);
/** Metres to feet. */
export const mToFt = (v) => convert(v, (m) => m / 0.3048);
/** Pascals to inches of mercury. */
export const paToInHg = (v) => convert(v, (pa) => pa / 3386.389);
//# sourceMappingURL=units.js.map