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
/**
 * Today's sun times at the venue, or `null` when the point is outside coverage,
 * the lookup failed, or no sun data for today's local date is available. A cached
 * point from an earlier day is evicted and looked up once more; another day's
 * times are never returned. Never throws.
 */
export declare function getSun(coords: Coords, opts?: EngineOptions): Promise<SunTimes | null>;
/**
 * The moon at `at` (epoch ms), from the mean synodic month counted from the new
 * moon of 2000-01-06 18:14 UTC. `null` for a non-finite time. Never throws.
 */
export declare function getMoon(at: number): MoonPhase | null;
//# sourceMappingURL=astro.d.ts.map