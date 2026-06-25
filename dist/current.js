/**
 * Current conditions (real-time) + today's sunrise/sunset.
 * Canonical from St. Patrick `server/weather/current.ts`, parameterized by
 * coordinate (no hardcoded Armonk), per-coord cached (15 min) with in-flight
 * dedup, and accepting an injected fetch.
 */
import { coordKey, fetchWithTimeout, isValidCoord, parseOpenMeteoLocalTime } from "./helpers.js";
import { getWeatherInfo } from "./wmo.js";
const API_BASE = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min
const cache = new Map();
const inflight = new Map();
function buildUrl(lat, lon) {
    const params = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lon.toString(),
        current: [
            "temperature_2m",
            "apparent_temperature",
            "weather_code",
            "wind_speed_10m",
            "is_day",
            "relative_humidity_2m",
        ].join(","),
        daily: "sunrise,sunset",
        temperature_unit: "fahrenheit",
        wind_speed_unit: "mph",
        timezone: "auto",
        forecast_days: "1",
    });
    return `${API_BASE}?${params.toString()}`;
}
export async function getCurrentWeather(coords, opts = {}) {
    if (!isValidCoord(coords.lat, coords.lon))
        return null;
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
                console.error(`Open-Meteo current: HTTP ${res.status}`);
                return cached?.data ?? null;
            }
            let data;
            try {
                data = (await res.json());
            }
            catch {
                console.error("Open-Meteo current: failed to parse JSON");
                return cached?.data ?? null;
            }
            if (data?.current?.temperature_2m === undefined || !data?.daily?.sunrise) {
                console.error("Open-Meteo current: unexpected response shape");
                return cached?.data ?? null;
            }
            const c = data.current;
            const info = getWeatherInfo(c.weather_code ?? 0);
            const result = {
                temperature: Math.round(c.temperature_2m ?? 0),
                feelsLike: Math.round(c.apparent_temperature ?? 0),
                weatherCode: c.weather_code ?? 0,
                description: info.description,
                icon: info.icon,
                windSpeed: Math.round(c.wind_speed_10m ?? 0),
                isDay: c.is_day === 1,
                humidity: c.relative_humidity_2m ?? 0,
                sunrise: data.daily?.sunrise?.[0] ? parseOpenMeteoLocalTime(data.daily.sunrise[0]) : "",
                sunset: data.daily?.sunset?.[0] ? parseOpenMeteoLocalTime(data.daily.sunset[0]) : "",
            };
            cache.set(key, { data: result, fetchedAt: Date.now() });
            return result;
        }
        catch (error) {
            console.error("Current weather fetch error:", error);
            return cached?.data ?? null;
        }
        finally {
            inflight.delete(key);
        }
    })();
    inflight.set(key, job);
    return job;
}
/** Clear the current-weather cache (test hook / sign-out hygiene). */
export function clearCurrentCache() {
    cache.clear();
    inflight.clear();
}
//# sourceMappingURL=current.js.map