/**
 * Hourly forecast + per-event weather enrichment.
 *
 * Canonical shape from St. Patrick `server/weather/forecast.ts`, with the
 * aster-sports improvements merged (`&timeformat=unixtime` absolute epoch
 * matching + per-coordinate caching), and the v0.2.0 audit fixes:
 *   - nullable measurement fields (no fabricated `0` — WX-P1-1),
 *   - `wind_gusts_10m` in the request + severe-gust threshold (WX-P2-4),
 *   - `past_days=1` so recent-past events resolve (WX-P2-1),
 *   - a bounded, stale-on-error shared cache (WX-P2-7 / pattern ε),
 *   - an `isValidCoord` guard on the event path (WX-P3-7).
 */

import {
  FORECAST_DAYS,
  MAX_FORECAST_HOUR_GAP_MS,
  HOURLY_MATCH_WINDOW_MS,
  SEVERE_WIND_MPH,
  SEVERE_GUST_MPH,
  type Coords,
  type EventWeather,
  type FetchOptions,
  type HourlyForecast,
} from "./types.js";
import {
  coordKey,
  fetchWithTimeout,
  isValidCoord,
  numOrNull,
  roundOrNull,
} from "./helpers.js";
import { WeatherCache } from "./cache.js";
import { getWeatherInfo } from "./wmo.js";

const API_BASE = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 min

interface HourlyBundle {
  hours: HourlyForecast[];
  utcOffsetSeconds: number;
}

const EMPTY_BUNDLE: HourlyBundle = { hours: [], utcOffsetSeconds: 0 };
const cache = new WeatherCache<HourlyBundle>(CACHE_TTL_MS);

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
      "wind_gusts_10m",
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
    // WX-P2-1: one past day so a just-finished event still finds its hour.
    past_days: "1",
    forecast_days: FORECAST_DAYS.toString(),
  });
  return `${API_BASE}?${params.toString()}`;
}

interface OpenMeteoHourly {
  utc_offset_seconds?: number;
  hourly?: {
    time?: number[];
    temperature_2m?: (number | null)[];
    apparent_temperature?: (number | null)[];
    precipitation_probability?: (number | null)[];
    precipitation?: (number | null)[];
    weather_code?: number[];
    cloud_cover?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    is_day?: number[];
  };
}

async function loadHourly(
  coords: Coords,
  opts: FetchOptions = {},
): Promise<HourlyBundle> {
  const key = coordKey(coords.lat, coords.lon);
  return cache.get(
    key,
    async () => {
      const res = await fetchWithTimeout(buildUrl(coords.lat, coords.lon), opts);
      if (!res.ok) {
        console.error(`Open-Meteo hourly: HTTP ${res.status}`);
        throw new Error(`hourly HTTP ${res.status}`);
      }
      let data: OpenMeteoHourly;
      try {
        data = (await res.json()) as OpenMeteoHourly;
      } catch {
        console.error("Open-Meteo hourly: failed to parse JSON");
        throw new Error("hourly parse");
      }
      const h = data.hourly;
      if (!h || !Array.isArray(h.time)) {
        console.error("Open-Meteo hourly: unexpected response shape");
        throw new Error("hourly shape");
      }
      const hours: HourlyForecast[] = h.time.map((unixSec, i) => ({
        timestamp: unixSec * 1000,
        temperature: roundOrNull(h.temperature_2m?.[i]),
        apparentTemperature: roundOrNull(h.apparent_temperature?.[i]),
        precipitationProbability: numOrNull(h.precipitation_probability?.[i]),
        precipitation: numOrNull(h.precipitation?.[i]),
        weatherCode: h.weather_code?.[i] ?? 0,
        cloudCover: numOrNull(h.cloud_cover?.[i]),
        windSpeed: roundOrNull(h.wind_speed_10m?.[i]),
        windGusts: roundOrNull(h.wind_gusts_10m?.[i]),
        isDay: h.is_day?.[i] === 1,
      }));
      return { hours, utcOffsetSeconds: data.utc_offset_seconds ?? 0 };
    },
    EMPTY_BUNDLE,
  );
}

/**
 * Fetch the multi-day hourly forecast for a coordinate. Cached for 60 min per
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
 * Warning flags treat a `null` reading as "unknown" — they never fire off a
 * fabricated value (WX-P1-1).
 */
export async function getWeatherForEvent(
  coords: Coords,
  eventStartISO: string,
  opts: FetchOptions = {},
): Promise<EventWeather | null> {
  if (!isValidCoord(coords.lat, coords.lon)) return null;
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

  const rain = closest.precipitationProbability;
  const temp = closest.temperature;
  const wind = closest.windSpeed;
  const gust = closest.windGusts;

  return {
    temperature: temp,
    feelsLike: closest.apparentTemperature,
    precipProbability: rain,
    precipAmount: closest.precipitation,
    weatherCode: closest.weatherCode,
    description: info.description,
    icon: info.icon,
    windSpeed: wind,
    windGusts: gust,
    isDay: closest.isDay,
    isRainWarning: rain !== null && rain > 40,
    isSevereWarning:
      (rain !== null && rain > 70) ||
      (temp !== null && (temp < 20 || temp > 100)) ||
      (wind !== null && wind > SEVERE_WIND_MPH) ||
      (gust !== null && gust > SEVERE_GUST_MPH),
    forecastStrip,
  };
}

/** Clear the in-memory forecast cache (test hook / consumer sign-out hygiene). */
export function clearForecastCache(): void {
  cache.clear();
}
