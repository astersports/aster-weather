/**
 * 7-day daily forecast — high/low, precipitation, sunrise/sunset.
 * Canonical from St. Patrick `server/weather/daily.ts`, parameterized by
 * coordinate, per-coord cached (60 min) with in-flight dedup, injected fetch.
 */
import { type Coords, type DailyForecast, type FetchOptions } from "./types.js";
export declare function getDailyForecast(coords: Coords, opts?: FetchOptions): Promise<DailyForecast[]>;
/** Clear the daily-forecast cache (test hook / sign-out hygiene). */
export declare function clearDailyCache(): void;
//# sourceMappingURL=daily.d.ts.map