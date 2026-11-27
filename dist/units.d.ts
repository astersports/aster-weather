/**
 * Pure, null-preserving unit conversions for the v0.8.0 engine.
 *
 * Every function takes a measurement that may be missing and returns `null`
 * for a missing one (`null`, `undefined`, `NaN` or infinite). A missing value
 * is never turned into `0`. No rounding: callers round for display.
 */
type Maybe = number | null | undefined;
/** Celsius to Fahrenheit. */
export declare const cToF: (v: Maybe) => number | null;
/** Kilometres per hour to miles per hour. */
export declare const kmhToMph: (v: Maybe) => number | null;
/** Millimetres to inches. */
export declare const mmToIn: (v: Maybe) => number | null;
/** Metres to miles. */
export declare const mToMi: (v: Maybe) => number | null;
/** Metres to feet. */
export declare const mToFt: (v: Maybe) => number | null;
/** Pascals to inches of mercury. */
export declare const paToInHg: (v: Maybe) => number | null;
export {};
//# sourceMappingURL=units.d.ts.map