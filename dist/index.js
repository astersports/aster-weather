/**
 * @aster/weather — framework-agnostic weather package.
 *
 * Two halves, both public:
 *
 * - The NWS and NOAA engine (v0.8.0): official US weather. `getWeather` returns
 *   every part for a point; `getNow`, `getHourly`, `getDaily`, `getAlerts`,
 *   `getRadarRain`, `getSun`, `getMoon` and `getEventWeather` return one part
 *   each. Every reading carries a `Stamp` (kind, time, fetch time, stale, source).
 *   The engine never throws. US coverage only; outside it the answer is `null`.
 *   Hosts are the two constants in `src/nws/http.ts`.
 *
 * - The Open-Meteo fetchers (`fetchForecast`, `getCurrentWeather`,
 *   `getDailyForecast`, `getNowcast`, `getWeatherForEvent`): deprecated, and
 *   removed in `v1.0.0` after the consumers move. Open-Meteo's free API is for
 *   non-commercial use only; see the README.
 *
 * Also here: the WMO code tables, pure helpers, and the coordinate helpers.
 * React SVG icons ship from the `@aster/weather/icons` subpath.
 */
export { FORECAST_DAYS, FETCH_TIMEOUT_MS, FETCH_RETRY_COUNT, FETCH_RETRY_BACKOFF_MS, MAX_FORECAST_HOUR_GAP_MS, HOURLY_MATCH_WINDOW_MS, DEFAULT_FORECAST_WINDOW_DAYS, SEVERE_WIND_MPH, SEVERE_GUST_MPH, } from "./types.js";
export { WMO_CODES, getWeatherInfo, weatherInfoOrNull, WMO_EMOJI, emojiForCode, WMO_LABELS, labelForCode, rainWord, } from "./wmo.js";
// Public helpers (coordKey + fetchJsonWithTimeout are internal — not exported)
export { parseOpenMeteoLocalTime, isValidCoord } from "./helpers.js";
// ---- NWS and NOAA engine (v0.8.0) -----------------------------------------
// The one-call report: every part for one point
export { getWeather } from "./weather.js";
// Current conditions: a station reading, else the forecast hour now
export { getNow, MAX_OBSERVATION_AGE_MS } from "./now.js";
// Hourly forecast, joined with the forecast grid
export { getHourly, GRID_RETRY_AFTER_MS, } from "./nws/hourly.js";
// Seven-day forecast, one reading per date
export { getDaily } from "./nws/daily.js";
// Official alerts for a point
export { getAlerts, ALERT_MAX_STALE_MS } from "./nws/alerts.js";
// Radar rain at a point (may only add rain)
export { getRadarRain, MAX_FRAME_AGE_MS, RADAR_TIMEOUT_MS, RADAR_RETRY_AFTER_MS, } from "./radar.js";
// Sun (today only) and moon (calculated)
export { getSun, getMoon, SUN_REFRESH_AFTER_MS, } from "./astro.js";
// The forecast hour nearest an event, with the two warning flags
export { getEventWeather } from "./event.js";
// Conditions and icon keywords
export { conditionFromNwsIcon, conditionLabel, isPrecipitation, NWS_ICON_CONDITION, } from "./condition.js";
// Provenance vocabulary and age bounds
export { MAX_AGE_MS, FRESH_MS, } from "./provenance.js";
// Retry hold after a failed point lookup
export { POINT_RETRY_AFTER_MS } from "./nws/point.js";
// Clear every engine cache and hold
export { clearWeatherCaches } from "./clearAll.js";
// ---- Open-Meteo fetchers (deprecated; removed in v1.0.0) ------------------
// Hourly forecast + event enrichment + matcher
export { fetchForecast, getWeatherForTime, getWeatherForEvent, clearForecastCache, } from "./forecast.js";
// 15-minute precipitation nowcast
export { getNowcast, clearNowcastCache } from "./nowcast.js";
// Current conditions
export { getCurrentWeather, clearCurrentCache } from "./current.js";
// Daily forecast
export { getDailyForecast, clearDailyCache } from "./daily.js";
export { weatherLocationFrom, coordsForEvent } from "./coordsForEvent.js";
// Pure predicates / parsers
export { isWithinForecastWindow } from "./forecastWindow.js";
export { parsePrecip } from "./parsePrecip.js";
//# sourceMappingURL=index.js.map