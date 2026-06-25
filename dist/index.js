/**
 * @aster/weather — framework-agnostic weather core.
 *
 * Canonical engine shape extracted from St. Patrick (`server/weather/*`),
 * with genuine improvements merged from the aster-sports build. See
 * DERIVATION.md for the diff and merge rationale.
 *
 * React SVG icons ship from the `@aster/weather/icons` subpath.
 */
export { FORECAST_DAYS, FETCH_TIMEOUT_MS, MAX_FORECAST_HOUR_GAP_MS, HOURLY_MATCH_WINDOW_MS, DEFAULT_FORECAST_WINDOW_DAYS, } from "./types.js";
export { WMO_CODES, getWeatherInfo, WMO_EMOJI, emojiForCode, WMO_LABELS, labelForCode, rainWord, } from "./wmo.js";
// Helpers
export { parseOpenMeteoLocalTime, coordKey, isValidCoord, fetchWithTimeout, } from "./helpers.js";
// Hourly forecast + event enrichment + matcher
export { fetchForecast, getWeatherForTime, getWeatherForEvent, clearForecastCache, } from "./forecast.js";
// Current conditions
export { getCurrentWeather, clearCurrentCache } from "./current.js";
// Daily forecast
export { getDailyForecast, clearDailyCache } from "./daily.js";
export { weatherLocationFrom, coordsForEvent } from "./coordsForEvent.js";
// Pure predicates / parsers
export { isWithinForecastWindow } from "./forecastWindow.js";
export { parsePrecip } from "./parsePrecip.js";
//# sourceMappingURL=index.js.map