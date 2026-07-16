/**
 * @aster/weather — framework-agnostic weather core.
 *
 * Canonical engine shape extracted from St. Patrick (`server/weather/*`),
 * with genuine improvements merged from the aster-sports build. See
 * DERIVATION.md for the diff and merge rationale.
 *
 * React SVG icons ship from the `@aster/weather/icons` subpath.
 */
export type { Coords, HourlyForecast, NowcastPoint, EventWeather, CurrentWeather, DailyForecast, WeatherIconKey, FetchImpl, FetchOptions, WeatherCall, WeatherErrorContext, } from "./types.js";
export { FORECAST_DAYS, FETCH_TIMEOUT_MS, FETCH_RETRY_COUNT, FETCH_RETRY_BACKOFF_MS, MAX_FORECAST_HOUR_GAP_MS, HOURLY_MATCH_WINDOW_MS, DEFAULT_FORECAST_WINDOW_DAYS, SEVERE_WIND_MPH, SEVERE_GUST_MPH, } from "./types.js";
export type { CacheBehavior } from "./cache.js";
export type { WmoInfo } from "./wmo.js";
export { WMO_CODES, getWeatherInfo, WMO_EMOJI, emojiForCode, WMO_LABELS, labelForCode, rainWord, } from "./wmo.js";
export { parseOpenMeteoLocalTime, isValidCoord } from "./helpers.js";
export { fetchForecast, getWeatherForTime, getWeatherForEvent, clearForecastCache, } from "./forecast.js";
export { getNowcast, clearNowcastCache } from "./nowcast.js";
export { getCurrentWeather, clearCurrentCache } from "./current.js";
export { getDailyForecast, clearDailyCache } from "./daily.js";
export type { WeatherLocation, WeatherAnchor } from "./coordsForEvent.js";
export { weatherLocationFrom, coordsForEvent } from "./coordsForEvent.js";
export { isWithinForecastWindow } from "./forecastWindow.js";
export { parsePrecip, type ParsedPrecip } from "./parsePrecip.js";
//# sourceMappingURL=index.d.ts.map