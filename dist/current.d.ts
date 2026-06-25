/**
 * Current conditions (real-time) + today's sunrise/sunset.
 * Canonical from St. Patrick `server/weather/current.ts`, parameterized by
 * coordinate (no hardcoded Armonk), per-coord cached (15 min) with in-flight
 * dedup, and accepting an injected fetch.
 */
import { type Coords, type CurrentWeather, type FetchOptions } from "./types.js";
export declare function getCurrentWeather(coords: Coords, opts?: FetchOptions): Promise<CurrentWeather | null>;
/** Clear the current-weather cache (test hook / sign-out hygiene). */
export declare function clearCurrentCache(): void;
//# sourceMappingURL=current.d.ts.map