/**
 * 15-minute precipitation nowcast (WX-P2-3) — "will it rain during the next
 * couple hours of the game?". Sourced from Open-Meteo `minutely_15` on the
 * same `/v1/forecast` endpoint (no separate endpoint), so it costs one extra
 * request. `precipitation_probability` is NOT valid at 15-min resolution, so
 * this carries precipitation AMOUNT + gusts, not a probability.
 *
 * Per-coord cached for 10 min (shorter than hourly — nowcast is the freshest
 * signal), with in-flight dedup + stale-on-error, via the shared cache.
 */

import {
  type Coords,
  type FetchOptions,
  type NowcastPoint,
} from "./types.js";
import {
  bindOnError,
  coordKey,
  fetchWithTimeout,
  isValidCoord,
  numOrNull,
  RESILIENT_CACHE,
} from "./helpers.js";
import { WeatherCache } from "./cache.js";

const API_BASE = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

const cache = new WeatherCache<NowcastPoint[]>(
  CACHE_TTL_MS,
  undefined,
  RESILIENT_CACHE,
);

function buildUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    minutely_15: ["precipitation", "wind_gusts_10m"].join(","),
    precipitation_unit: "inch",
    wind_speed_unit: "mph",
    timezone: "auto",
    timeformat: "unixtime",
    // ~2h of 15-min steps is enough to answer "during the game"; keep it tight.
    forecast_minutely_15: "8",
  });
  return `${API_BASE}?${params.toString()}`;
}

interface OpenMeteoMinutely {
  minutely_15?: {
    time?: number[];
    precipitation?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
  };
}

/**
 * Fetch the next ~2 hours of 15-minute precipitation/gust nowcast for a
 * coordinate. Returns `[]` on invalid coords or failure (never throws, never
 * fabricates); falls back to stale cache when available.
 */
export async function getNowcast(
  coords: Coords,
  opts: FetchOptions = {},
): Promise<NowcastPoint[]> {
  if (!isValidCoord(coords.lat, coords.lon)) return [];
  const key = coordKey(coords.lat, coords.lon);
  return cache.get(
    key,
    async () => {
      const res = await fetchWithTimeout(buildUrl(coords.lat, coords.lon), opts);
      if (!res.ok) {
        console.error(`Open-Meteo nowcast: HTTP ${res.status}`);
        throw new Error(`nowcast HTTP ${res.status}`);
      }
      let data: OpenMeteoMinutely;
      try {
        data = (await res.json()) as OpenMeteoMinutely;
      } catch {
        console.error("Open-Meteo nowcast: failed to parse JSON");
        throw new Error("nowcast parse");
      }
      const m = data.minutely_15;
      if (!m || !Array.isArray(m.time)) {
        console.error("Open-Meteo nowcast: unexpected response shape");
        throw new Error("nowcast shape");
      }
      return m.time.map((unixSec, i) => ({
        timestamp: unixSec * 1000,
        precipitation: numOrNull(m.precipitation?.[i]),
        windGusts: numOrNull(m.wind_gusts_10m?.[i]),
      }));
    },
    [],
    bindOnError(opts, "getNowcast", coords.lat, coords.lon),
  );
}

/** Clear the nowcast cache (test hook / sign-out hygiene). */
export function clearNowcastCache(): void {
  cache.clear();
}
