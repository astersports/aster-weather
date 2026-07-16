/**
 * Current conditions (real-time) + today's sunrise/sunset.
 * Canonical from St. Patrick `server/weather/current.ts`, parameterized by
 * coordinate (no hardcoded Armonk), per-coord cached (15 min) with in-flight
 * dedup, accepting an injected fetch, and (v0.2.0) nullable readings +
 * `wind_gusts_10m` + an `observedAt` data-age timestamp (WX-P1-1/P2-4/P2-5).
 */

import { type Coords, type CurrentWeather, type FetchOptions } from "./types.js";
import {
  coordKey,
  fetchWithTimeout,
  isValidCoord,
  localIsoToEpoch,
  numOrNull,
  parseOpenMeteoLocalTime,
  roundOrNull,
} from "./helpers.js";
import { WeatherCache } from "./cache.js";
import { getWeatherInfo } from "./wmo.js";

const API_BASE = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

const cache = new WeatherCache<CurrentWeather | null>(CACHE_TTL_MS);

function buildUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    current: [
      "temperature_2m",
      "apparent_temperature",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
      "precipitation",
      "is_day",
      "relative_humidity_2m",
    ].join(","),
    daily: "sunrise,sunset",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "auto",
    forecast_days: "1",
  });
  return `${API_BASE}?${params.toString()}`;
}

interface OpenMeteoCurrent {
  utc_offset_seconds?: number;
  current?: {
    time?: string;
    temperature_2m?: number | null;
    apparent_temperature?: number | null;
    weather_code?: number;
    wind_speed_10m?: number | null;
    wind_gusts_10m?: number | null;
    wind_direction_10m?: number | null;
    precipitation?: number | null;
    is_day?: number;
    relative_humidity_2m?: number | null;
  };
  daily?: { sunrise?: string[]; sunset?: string[] };
}

export async function getCurrentWeather(
  coords: Coords,
  opts: FetchOptions = {},
): Promise<CurrentWeather | null> {
  if (!isValidCoord(coords.lat, coords.lon)) return null;
  const key = coordKey(coords.lat, coords.lon);
  return cache.get(
    key,
    async () => {
      const res = await fetchWithTimeout(buildUrl(coords.lat, coords.lon), opts);
      if (!res.ok) {
        console.error(`Open-Meteo current: HTTP ${res.status}`);
        throw new Error(`current HTTP ${res.status}`);
      }
      let data: OpenMeteoCurrent;
      try {
        data = (await res.json()) as OpenMeteoCurrent;
      } catch {
        console.error("Open-Meteo current: failed to parse JSON");
        throw new Error("current parse");
      }
      if (data?.current?.temperature_2m === undefined || !data?.daily?.sunrise) {
        console.error("Open-Meteo current: unexpected response shape");
        throw new Error("current shape");
      }
      const c = data.current;
      const info = getWeatherInfo(c.weather_code ?? 0);
      const result: CurrentWeather = {
        temperature: roundOrNull(c.temperature_2m),
        feelsLike: roundOrNull(c.apparent_temperature),
        weatherCode: c.weather_code ?? 0,
        description: info.description,
        icon: info.icon,
        windSpeed: roundOrNull(c.wind_speed_10m),
        windGusts: roundOrNull(c.wind_gusts_10m),
        windDirection: roundOrNull(c.wind_direction_10m),
        precipitation: numOrNull(c.precipitation),
        isDay: c.is_day === 1,
        humidity: numOrNull(c.relative_humidity_2m),
        observedAt: localIsoToEpoch(c.time, data.utc_offset_seconds ?? 0),
        sunrise: data.daily?.sunrise?.[0]
          ? parseOpenMeteoLocalTime(data.daily.sunrise[0])
          : "",
        sunset: data.daily?.sunset?.[0]
          ? parseOpenMeteoLocalTime(data.daily.sunset[0])
          : "",
      };
      return result;
    },
    null,
  );
}

/** Clear the current-weather cache (test hook / sign-out hygiene). */
export function clearCurrentCache(): void {
  cache.clear();
}
