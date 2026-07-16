/**
 * Multi-day daily forecast — high/low, precipitation, sunrise/sunset.
 * Canonical from St. Patrick `server/weather/daily.ts`, parameterized by
 * coordinate, per-coord cached (60 min) with in-flight dedup, injected fetch,
 * and (v0.2.0) nullable readings via the shared cache (WX-P1-1 / WX-P2-7).
 */

import {
  FORECAST_DAYS,
  type Coords,
  type DailyForecast,
  type FetchOptions,
} from "./types.js";
import {
  coordKey,
  fetchWithTimeout,
  isValidCoord,
  numOrNull,
  parseOpenMeteoLocalTime,
  roundOrNull,
} from "./helpers.js";
import { WeatherCache } from "./cache.js";
import { getWeatherInfo } from "./wmo.js";

const API_BASE = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 min

const cache = new WeatherCache<DailyForecast[]>(CACHE_TTL_MS);

function buildUrl(lat: number, lon: number): string {
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

interface OpenMeteoDaily {
  daily?: {
    time?: string[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    weather_code?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
}

export async function getDailyForecast(
  coords: Coords,
  opts: FetchOptions = {},
): Promise<DailyForecast[]> {
  if (!isValidCoord(coords.lat, coords.lon)) return [];
  const key = coordKey(coords.lat, coords.lon);
  return cache.get(
    key,
    async () => {
      const res = await fetchWithTimeout(buildUrl(coords.lat, coords.lon), opts);
      if (!res.ok) {
        console.error(`Open-Meteo daily: HTTP ${res.status}`);
        throw new Error(`daily HTTP ${res.status}`);
      }
      let data: OpenMeteoDaily;
      try {
        data = (await res.json()) as OpenMeteoDaily;
      } catch {
        console.error("Open-Meteo daily: failed to parse JSON");
        throw new Error("daily parse");
      }
      const d = data.daily;
      if (!d || !Array.isArray(d.time)) {
        console.error("Open-Meteo daily: unexpected response shape");
        throw new Error("daily shape");
      }
      const forecasts: DailyForecast[] = d.time.map((date, i) => {
        const weatherCode = d.weather_code?.[i] ?? 0;
        const info = getWeatherInfo(weatherCode);
        return {
          date,
          high: roundOrNull(d.temperature_2m_max?.[i]),
          low: roundOrNull(d.temperature_2m_min?.[i]),
          precipProbabilityMax: numOrNull(d.precipitation_probability_max?.[i]),
          weatherCode,
          icon: info.icon,
          description: info.description,
          sunrise: d.sunrise?.[i] ? parseOpenMeteoLocalTime(d.sunrise[i]) : "",
          sunset: d.sunset?.[i] ? parseOpenMeteoLocalTime(d.sunset[i]) : "",
        };
      });
      return forecasts;
    },
    [],
  );
}

/** Clear the daily-forecast cache (test hook / sign-out hygiene). */
export function clearDailyCache(): void {
  cache.clear();
}
