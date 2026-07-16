/**
 * Current conditions (real-time) + today's sunrise/sunset.
 * Canonical from St. Patrick `server/weather/current.ts`, parameterized by
 * coordinate (no hardcoded Armonk), per-coord cached (15 min) with in-flight
 * dedup, accepting an injected fetch, and (v0.2.0) nullable readings +
 * `wind_gusts_10m` + an `observedAt` data-age timestamp (WX-P1-1/P2-4/P2-5).
 */
import { type Coords, type CurrentWeather, type FetchOptions } from "./types.js";
export declare function getCurrentWeather(coords: Coords, opts?: FetchOptions): Promise<CurrentWeather | null>;
/** Clear the current-weather cache (test hook / sign-out hygiene). */
export declare function clearCurrentCache(): void;
//# sourceMappingURL=current.d.ts.map