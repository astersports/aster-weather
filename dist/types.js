/**
 * @aster/weather — shared types & constants
 *
 * Framework-agnostic. No React, no app constants. Shapes follow the
 * St. Patrick `server/weather` engine (the canonical source), with the
 * time representation changed to absolute epoch-ms per the aster-sports
 * `useWeather` DL-13 fix (see DERIVATION.md §"Hourly time").
 *
 * v0.2.0: measurement fields are `number | null` — a missing Open-Meteo
 * reading is `null` ("unknown"), never a fabricated `0` (WX-P1-1 / AP #27,
 * #36). `weatherCode` stays a number (it drives icon dispatch; absent → 0
 * "clear", the documented neutral).
 */
/**
 * Open-Meteo hourly coverage supports up to 16 days; we request 14 to comfortably
 * cover the `DEFAULT_FORECAST_WINDOW_DAYS` surface window (was 7, which left a dead
 * 7–10 day gap — WX-P2-2).
 */
export const FORECAST_DAYS = 14;
/** Default fetch timeout for Open-Meteo calls (ms). */
export const FETCH_TIMEOUT_MS = 5000;
/**
 * Loader resilience (v0.5.0, M5). One retry with a fixed backoff before a fetch
 * falls through to stale-or-empty — absorbs a single transient blip instead of
 * serving stale for the whole TTL window. Each attempt keeps its own
 * {@link FETCH_TIMEOUT_MS} budget; a retry-then-fail emits exactly one
 * `onError` signal (paired with M1), never one per attempt.
 */
export const FETCH_RETRY_COUNT = 1;
export const FETCH_RETRY_BACKOFF_MS = 500;
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
 * override per call; the hourly indicator still self-limits to its
 * Open-Meteo coverage (`FORECAST_DAYS`) regardless.
 */
export const DEFAULT_FORECAST_WINDOW_DAYS = 10;
/**
 * Sustained-wind and gust thresholds (mph) for the severe-weather flag.
 * Gusts (typically 1.5–2× sustained) are what actually cancel outdoor
 * events, so they carry their own threshold (WX-P2-4).
 */
export const SEVERE_WIND_MPH = 40;
export const SEVERE_GUST_MPH = 45;
//# sourceMappingURL=types.js.map