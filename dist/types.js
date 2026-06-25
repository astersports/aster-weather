/**
 * @aster/weather — shared types & constants
 *
 * Framework-agnostic. No React, no app constants. Shapes follow the
 * St. Patrick `server/weather` engine (the canonical source), with the
 * time representation changed to absolute epoch-ms per the aster-sports
 * `useWeather` DL-13 fix (see DERIVATION.md §"Hourly time").
 */
/** Open-Meteo 7-day coverage is the practical ceiling for the hourly endpoint. */
export const FORECAST_DAYS = 7;
/** Default fetch timeout for Open-Meteo calls (ms). */
export const FETCH_TIMEOUT_MS = 5000;
/** Skip an event match when the nearest forecast hour is further than this. */
export const MAX_FORECAST_HOUR_GAP_MS = 6 * 60 * 60 * 1000;
/**
 * Tightest hour match used by {@link getWeatherForTime}. Merged from
 * aster-sports `getWeatherForTime` (2h window) — distinct from the looser
 * 6h gap used by the daily-schedule event enrichment.
 */
export const HOURLY_MATCH_WINDOW_MS = 2 * 60 * 60 * 1000;
/**
 * Default "surface weather UX for an upcoming event" window in days.
 * Merged from aster-sports `WEATHER_FORECAST_WINDOW_DAYS`. Consumers may
 * override per call; the hourly indicator still self-limits to its ~7-day
 * Open-Meteo coverage regardless.
 */
export const DEFAULT_FORECAST_WINDOW_DAYS = 10;
//# sourceMappingURL=types.js.map