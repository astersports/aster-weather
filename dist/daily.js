/**
 * Multi-day daily forecast — high/low, precipitation, sunrise/sunset.
 * Canonical from St. Patrick `server/weather/daily.ts`, parameterized by
 * coordinate, per-coord cached (60 min) with in-flight dedup, injected fetch,
 * and (v0.2.0) nullable readings via the shared cache (WX-P1-1 / WX-P2-7).
 */
import { FORECAST_DAYS, } from "./types.js";
import { bindOnError, coordKey, fetchJsonWithTimeout, isValidCoord, numOrNull, parseOpenMeteoLocalTime, RESILIENT_CACHE, roundOrNull, } from "./helpers.js";
import { WeatherCache } from "./cache.js";
import { getWeatherInfo } from "./wmo.js";
const API_BASE = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 min
const cache = new WeatherCache(CACHE_TTL_MS, undefined, RESILIENT_CACHE);
function buildUrl(lat, lon) {
    const params = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lon.toString(),
        daily: [
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_probability_max",
            "wind_speed_10m_max",
            "uv_index_max",
            "weather_code",
            "sunrise",
            "sunset",
        ].join(","),
        temperature_unit: "fahrenheit",
        wind_speed_unit: "mph",
        timezone: "auto",
        forecast_days: FORECAST_DAYS.toString(),
    });
    return `${API_BASE}?${params.toString()}`;
}
export async function getDailyForecast(coords, opts = {}) {
    if (!isValidCoord(coords.lat, coords.lon))
        return [];
    const key = coordKey(coords.lat, coords.lon);
    return cache.get(key, async () => {
        const data = (await fetchJsonWithTimeout(buildUrl(coords.lat, coords.lon), opts));
        const d = data.daily;
        if (!d || !Array.isArray(d.time)) {
            throw new Error("daily shape");
        }
        const forecasts = d.time.map((date, i) => {
            const weatherCode = d.weather_code?.[i] ?? 0;
            const info = getWeatherInfo(weatherCode);
            return {
                date,
                high: roundOrNull(d.temperature_2m_max?.[i]),
                low: roundOrNull(d.temperature_2m_min?.[i]),
                precipProbabilityMax: numOrNull(d.precipitation_probability_max?.[i]),
                windSpeedMax: roundOrNull(d.wind_speed_10m_max?.[i]),
                uvIndexMax: numOrNull(d.uv_index_max?.[i]),
                weatherCode,
                icon: info.icon,
                description: info.description,
                sunrise: d.sunrise?.[i] ? parseOpenMeteoLocalTime(d.sunrise[i]) : "",
                sunset: d.sunset?.[i] ? parseOpenMeteoLocalTime(d.sunset[i]) : "",
            };
        });
        return forecasts;
    }, [], bindOnError(opts, "getDailyForecast", coords.lat, coords.lon));
}
/** Clear the daily-forecast cache (test hook / sign-out hygiene). */
export function clearDailyCache() {
    cache.clear();
}
//# sourceMappingURL=daily.js.map