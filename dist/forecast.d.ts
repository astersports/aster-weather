/**
 * Hourly forecast + per-event weather enrichment.
 *
 * Canonical shape from St. Patrick `server/weather/forecast.ts`, with the
 * aster-sports improvements merged (`&timeformat=unixtime` absolute epoch
 * matching + per-coordinate caching), and the v0.2.0 audit fixes:
 *   - nullable measurement fields (no fabricated `0` — WX-P1-1),
 *   - `wind_gusts_10m` in the request + severe-gust threshold (WX-P2-4),
 *   - `past_days=1` so recent-past events resolve (WX-P2-1),
 *   - a bounded, stale-on-error shared cache (WX-P2-7 / pattern ε),
 *   - an `isValidCoord` guard on the event path (WX-P3-7).
 */
import { type Coords, type EventWeather, type FetchOptions, type HourlyForecast } from "./types.js";
/**
 * Fetch the multi-day hourly forecast for a coordinate. Cached for 60 min per
 * rounded coordinate, with in-flight dedup. Returns `[]` on failure (never
 * throws, never fabricates) — falls back to stale cache when available.
 */
export declare function fetchForecast(coords: Coords, opts?: FetchOptions): Promise<HourlyForecast[]>;
/**
 * Find the forecast hour nearest an absolute time. Pure (no IO). Merged from
 * aster-sports `getWeatherForTime` — returns null when the nearest hour is
 * outside `windowMs` (default 2h) or input is invalid.
 */
export declare function getWeatherForTime(hours: HourlyForecast[] | null | undefined, isoTime: string | number | Date, windowMs?: number): HourlyForecast | null;
/**
 * Enrich a single event start time into an {@link EventWeather}. Returns null
 * when the event is outside the forecast horizon (>7 days out, or >1 day past)
 * or the nearest hour is >6h away. From St. Patrick `getWeatherForEvent`.
 * Warning flags treat a `null` reading as "unknown" — they never fire off a
 * fabricated value (WX-P1-1).
 */
export declare function getWeatherForEvent(coords: Coords, eventStartISO: string, opts?: FetchOptions): Promise<EventWeather | null>;
/** Clear the in-memory forecast cache (test hook / consumer sign-out hygiene). */
export declare function clearForecastCache(): void;
//# sourceMappingURL=forecast.d.ts.map