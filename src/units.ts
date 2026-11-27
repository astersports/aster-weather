/**
 * Pure, null-preserving unit conversions for the v0.8.0 engine.
 *
 * Every function takes a measurement that may be missing and returns `null`
 * for a missing one (`null`, `undefined`, `NaN` or infinite). A missing value
 * is never turned into `0`. No rounding: callers round for display.
 */

type Maybe = number | null | undefined;

function convert(v: Maybe, f: (n: number) => number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return f(v);
}

/** Celsius to Fahrenheit. */
export const cToF = (v: Maybe): number | null => convert(v, (c) => (c * 9) / 5 + 32);

/** Kilometres per hour to miles per hour. */
export const kmhToMph = (v: Maybe): number | null => convert(v, (k) => k * 0.621371192237334);

/** Millimetres to inches. */
export const mmToIn = (v: Maybe): number | null => convert(v, (mm) => mm / 25.4);

/** Metres to miles. */
export const mToMi = (v: Maybe): number | null => convert(v, (m) => m / 1609.344);

/** Metres to feet. */
export const mToFt = (v: Maybe): number | null => convert(v, (m) => m / 0.3048);

/** Pascals to inches of mercury. */
export const paToInHg = (v: Maybe): number | null => convert(v, (pa) => pa / 3386.389);
