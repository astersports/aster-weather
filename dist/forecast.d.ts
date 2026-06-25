/**
 * Hourly forecast + per-event weather enrichment.
 *
 * Canonical shape from St. Patrick `server/weather/forecast.ts`, with two
 * genuine improvements merged from the aster-sports build:
 *   1. `&timeformat=unixtime` so hour matching is absolute epoch arithmetic
 *      (DL-13 fix) — the original engine matched against `new Date(localStr)`,
 *      which is parsed in the host timezone and was off by the host's UTC
 *      offset. We also keep the venue UTC offset from the response so the
 *      Morning/Afternoon/Evening strip labels stay venue-local.
 *   2. A per-coordinate cache key + per-key in-flight dedup, so two venues
 *      never share one global cache entry (aster-sports Beta B4 fix).
 */
import { type Coords, type EventWeather, type FetchOptions, type HourlyForecast } from "./types.js";
/**
 * Fetch the 7-day hourly forecast for a coordinate. Cached for 60 min per
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
 */
export declare function getWeatherForEvent(coords: Coords, eventStartISO: string, opts?: FetchOptions): Promise<EventWeather | null>;
/** Clear the in-memory forecast cache (test hook / consumer sign-out hygiene). */
export declare function clearForecastCache(): void;
//# sourceMappingURL=forecast.d.ts.map