/**
 * Hourly forecast + per-event weather enrichment.
 *
 * Canonical shape from St. Patrick `server/weather/forecast.ts`, with two
 * genuine improvements merged from the aster-sports build:
 *   1. `&timeformat=unixtime` so hour matching is absolute epoch arithmetic
 *      (DL-13 fix) — the original engine matched against `new Date(localStr)`,
 *      which is parsed in the host timezone and was off by the host's UTC
 *      offset. We also keep the venue UTC offset from the response so the
 *      Morning/Afternoon/Evening strip labels stay venue-local.
 *   2. A per-coordinate cache key + per-key in-flight dedup, so two venues
 *      never share one global cache entry (aster-sports Beta B4 fix).
 */

import {
  FORECAST_DAYS,
  MAX_FORECAST_HOUR_GAP_MS,
  HOURLY_MATCH_WINDOW_MS,
  type Coords,
  type EventWeather,
  type FetchOptions,
  type HourlyForecast,
} from "./types.js";
import { coordKey, fetchWithTimeout, isValidCoord } from "./helpers.js";
import { getWeatherInfo } from "./wmo.js";

const API_BASE = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 min

interface HourlyBundle {
  hours: HourlyForecast[];
  utcOffsetSeconds: number;
}
interface CacheEntry {
  bundle: HourlyBundle;
  fetchedAt: number;
}

// Per-coordinate cache + in-flight dedup (Beta B4: never share one venue's
// forecast with another within the TTL).
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<HourlyBundle>>();

function buildUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "cloud_cover",
      "wind_speed_10m",
      "is_day",
    ].join(","),
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    // timezone=auto keeps daily boundaries / sunrise local for any org
    // (St. Patrick hardcoded America/New_York — wrong for a shared package).
    timezone: "auto",
    // DL-13: absolute epoch seconds, not TZ-naive local strings.
    timeformat: "unixtime",
    forecast_days: FORECAST_DAYS.toString(),
  });
  return `${API_BASE}?${params.toString()}`;
}

interface OpenMeteoHourly {
  utc_offset_seconds?: number;
  hourly?: {
    time?: number[];
    temperature_2m?: number[];
    apparent_temperature?: number[];
    precipitation_probability?: (number | null)[];
    precipitation?: (number | null)[];
    weather_code?: number[];
    cloud_cover?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    is_day?: number[];
  };
}

async function loadHourly(
  coords: Coords,
  opts: FetchOptions = {},
): Promise<HourlyBundle> {
  const key = coordKey(coords.lat, coords.lon);

  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.bundle;
  }
  const existing = inflight.get(key);
  if (existing) return existing;

  const job = (async (): Promise<HourlyBundle> => {
    try {
      const res = await fetchWithTimeout(buildUrl(coords.lat, coords.lon), opts);
      if (!res.ok) {
        console.error(`Open-Meteo hourly: HTTP ${res.status}`);
        return cached?.bundle ?? { hours: [], utcOffsetSeconds: 0 };
      }
      let data: OpenMeteoHourly;
      try {
        data = (await res.json()) as OpenMeteoHourly;
      } catch {
        console.error("Open-Meteo hourly: failed to parse JSON");
        return cached?.bundle ?? { hours: [], utcOffsetSeconds: 0 };
      }
      const h = data.hourly;
      if (!h || !Array.isArray(h.time)) {
        console.error("Open-Meteo hourly: unexpected response shape");
        return cached?.bundle ?? { hours: [], utcOffsetSeconds: 0 };
      }
      const hours: HourlyForecast[] = h.time.map((unixSec, i) => ({
        timestamp: unixSec * 1000,
        temperature: Math.round(h.temperature_2m?.[i] ?? 0),
        apparentTemperature: Math.round(h.apparent_temperature?.[i] ?? 0),
        precipitationProbability: h.precipitation_probability?.[i] ?? 0,
        precipitation: h.precipitation?.[i] ?? 0,
        weatherCode: h.weather_code?.[i] ?? 0,
        cloudCover: h.cloud_cover?.[i] ?? 0,
        windSpeed: Math.round(h.wind_speed_10m?.[i] ?? 0),
        isDay: h.is_day?.[i] === 1,
      }));
      const bundle: HourlyBundle = {
        hours,
        utcOffsetSeconds: data.utc_offset_seconds ?? 0,
      };
      cache.set(key, { bundle, fetchedAt: Date.now() });
      return bundle;
    } catch (error) {
      console.error("Weather fetch error:", error);
      return cached?.bundle ?? { hours: [], utcOffsetSeconds: 0 };
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, job);
  return job;
}

/**
 * Fetch the 7-day hourly forecast for a coordinate. Cached for 60 min per
 * rounded coordinate, with in-flight dedup. Returns `[]` on failure (never
 * throws, never fabricates) — falls back to stale cache when available.
 */
export async function fetchForecast(
  coords: Coords,
  opts: FetchOptions = {},
): Promise<HourlyForecast[]> {
  if (!isValidCoord(coords.lat, coords.lon)) return [];
  return (await loadHourly(coords, opts)).hours;
}

/**
 * Find the forecast hour nearest an absolute time. Pure (no IO). Merged from
 * aster-sports `getWeatherForTime` — returns null when the nearest hour is
 * outside `windowMs` (default 2h) or input is invalid.
 */
export function getWeatherForTime(
  hours: HourlyForecast[] | null | undefined,
  isoTime: string | number | Date,
  windowMs: number = HOURLY_MATCH_WINDOW_MS,
): HourlyForecast | null {
  if (!hours || !hours.length || isoTime == null) return null;
  const target = new Date(isoTime).getTime();
  if (Number.isNaN(target)) return null;
  let best: HourlyForecast | null = null;
  let bestDiff = Infinity;
  for (const h of hours) {
    if (typeof h.timestamp !== "number") continue;
    const diff = Math.abs(h.timestamp - target);
    if (diff < bestDiff) {
      best = h;
      bestDiff = diff;
    }
  }
  return best && bestDiff <= windowMs ? best : null;
}

function stripLabel(timestamp: number, utcOffsetSeconds: number): string {
  // Local hour at the venue = absolute time shifted by the venue UTC offset,
  // read in UTC. Keeps the label venue-correct without re-introducing the
  // host-timezone bug.
  const localHour = new Date(timestamp + utcOffsetSeconds * 1000).getUTCHours();
  if (localHour >= 5 && localHour < 12) return "Morning";
  if (localHour >= 12 && localHour < 17) return "Afternoon";
  if (localHour >= 17 && localHour < 21) return "Evening";
  return "Night";
}

/**
 * Enrich a single event start time into an {@link EventWeather}. Returns null
 * when the event is outside the forecast horizon (>7 days out, or >1 day past)
 * or the nearest hour is >6h away. From St. Patrick `getWeatherForEvent`.
 */
export async function getWeatherForEvent(
  coords: Coords,
  eventStartISO: string,
  opts: FetchOptions = {},
): Promise<EventWeather | null> {
  const eventTime = new Date(eventStartISO).getTime();
  if (Number.isNaN(eventTime)) return null;
  const daysAway = (eventTime - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysAway > 7 || daysAway < -1) return null;

  const { hours, utcOffsetSeconds } = await loadHourly(coords, opts);
  if (!hours.length) return null;

  const closest = getWeatherForTime(hours, eventTime, MAX_FORECAST_HOUR_GAP_MS);
  if (!closest) return null;

  const info = getWeatherInfo(closest.weatherCode);

  const stripForecasts = hours
    .filter(
      (f) =>
        f.timestamp >= eventTime - 2 * 60 * 60 * 1000 &&
        f.timestamp <= eventTime + 4 * 60 * 60 * 1000,
    )
    .slice(0, 4);

  const forecastStrip = stripForecasts.map((f) => ({
    timestamp: f.timestamp,
    label: stripLabel(f.timestamp, utcOffsetSeconds),
    temperature: f.temperature,
    precipProbability: f.precipitationProbability,
    weatherCode: f.weatherCode,
    icon: getWeatherInfo(f.weatherCode).icon,
  }));

  return {
    temperature: closest.temperature,
    feelsLike: closest.apparentTemperature,
    precipProbability: closest.precipitationProbability,
    precipAmount: closest.precipitation,
    weatherCode: closest.weatherCode,
    description: info.description,
    icon: info.icon,
    windSpeed: closest.windSpeed,
    isDay: closest.isDay,
    isRainWarning: closest.precipitationProbability > 40,
    isSevereWarning:
      closest.precipitationProbability > 70 ||
      closest.temperature < 20 ||
      closest.temperature > 100 ||
      closest.windSpeed > 40,
    forecastStrip,
  };
}

/** Clear the in-memory forecast cache (test hook / consumer sign-out hygiene). */
export function clearForecastCache(): void {
  cache.clear();
  inflight.clear();
}
