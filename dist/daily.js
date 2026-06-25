/**
 * 7-day daily forecast — high/low, precipitation, sunrise/sunset.
 * Canonical from St. Patrick `server/weather/daily.ts`, parameterized by
 * coordinate, per-coord cached (60 min) with in-flight dedup, injected fetch.
 */
import { FORECAST_DAYS, } from "./types.js";
import { coordKey, fetchWithTimeout, isValidCoord, parseOpenMeteoLocalTime } from "./helpers.js";
import { getWeatherInfo } from "./wmo.js";
const API_BASE = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 min
const cache = new Map();
const inflight = new Map();
function buildUrl(lat, lon) {
    const params = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lon.toString(),
        daily: [
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_probability_max",
            "weather_code",
            "sunrise",
            "sunset",
        ].join(","),
        temperature_unit: "fahrenheit",
        timezone: "auto",
        forecast_days: FORECAST_DAYS.toString(),
    });
    return `${API_BASE}?${params.toString()}`;
}
export async function getDailyForecast(coords, opts = {}) {
    if (!isValidCoord(coords.lat, coords.lon))
        return [];
    const key = coordKey(coords.lat, coords.lon);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.data;
    }
    const existing = inflight.get(key);
    if (existing)
        return existing;
    const job = (async () => {
        try {
            const res = await fetchWithTimeout(buildUrl(coords.lat, coords.lon), opts);
            if (!res.ok) {
                console.error(`Open-Meteo daily: HTTP ${res.status}`);
                return cached?.data ?? [];
            }
            let data;
            try {
                data = (await res.json());
            }
            catch {
                console.error("Open-Meteo daily: failed to parse JSON");
                return cached?.data ?? [];
            }
            const d = data.daily;
            if (!d || !Array.isArray(d.time)) {
                console.error("Open-Meteo daily: unexpected response shape");
                return cached?.data ?? [];
            }
            const forecasts = d.time.map((date, i) => {
                const weatherCode = d.weather_code?.[i] ?? 0;
                const info = getWeatherInfo(weatherCode);
                return {
                    date,
                    high: Math.round(d.temperature_2m_max?.[i] ?? 0),
                    low: Math.round(d.temperature_2m_min?.[i] ?? 0),
                    precipProbabilityMax: d.precipitation_probability_max?.[i] ?? 0,
                    weatherCode,
                    icon: info.icon,
                    description: info.description,
                    sunrise: d.sunrise?.[i] ? parseOpenMeteoLocalTime(d.sunrise[i]) : "",
                    sunset: d.sunset?.[i] ? parseOpenMeteoLocalTime(d.sunset[i]) : "",
                };
            });
            cache.set(key, { data: forecasts, fetchedAt: Date.now() });
            return forecasts;
        }
        catch (error) {
            console.error("Daily forecast fetch error:", error);
            return cached?.data ?? [];
        }
        finally {
            inflight.delete(key);
        }
    })();
    inflight.set(key, job);
    return job;
}
/** Clear the daily-forecast cache (test hook / sign-out hygiene). */
export function clearDailyCache() {
    cache.clear();
    inflight.clear();
}
//# sourceMappingURL=daily.js.map