import type { EngineOptions } from "./provenance.js";
import type { Coords } from "./types.js";
export interface SunTimes {
    sunrise: number;
    sunset: number;
    firstLight: number | null;
    lastLight: number | null;
    dayLengthMs: number;
}
export interface MoonPhase {
    fraction: number;
    illumination: number;
    name: "New moon" | "Waxing crescent" | "First quarter" | "Waxing gibbous" | "Full moon" | "Waning gibbous" | "Last quarter" | "Waning crescent";
}
/** At most one point refresh per coordinate in this window (B-010). */
export declare const SUN_REFRESH_AFTER_MS: number;
/** Test hook: forget every remembered refresh time and every refresh in flight. */
export declare function clearSunRefreshes(): void;
/**
 * Today's sun times at the venue, or `null` when the point is outside coverage,
 * the lookup failed, or no sun data for today's local date is available. The
 * point is read first on every call, so cached data is always the answer. When
 * the cached point is from an earlier day, one refresh per coordinate runs at
 * most once per {@link SUN_REFRESH_AFTER_MS}, shared by simultaneous callers; a
 * call inside that window gets `null` with no request. A venue whose time zone
 * is unusable gets `null` with no refresh. Another day's times are never
 * returned. Never throws, and reports nothing itself: the point lookup reports
 * its own failures.
 */
export declare function getSun(coords: Coords, opts?: EngineOptions): Promise<SunTimes | null>;
/**
 * The moon at `at` (epoch ms), from the mean synodic month counted from the new
 * moon of 2000-01-06 18:14 UTC. `null` for a non-finite time. Never throws.
 */
export declare function getMoon(at: number): MoonPhase | null;
//# sourceMappingURL=astro.d.ts.map