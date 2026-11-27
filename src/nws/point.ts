/**
 * Point lookup: `/points/{lat},{lon}` → the forecast URLs, the time zone, the
 * place, the radar station and today's sun data. A point outside NWS coverage
 * answers 404, which is cached as `null` without `onError`.
 */
import { WeatherCache } from "../cache.js";
import { RESILIENT_CACHE, bindOnError, isValidCoord } from "../helpers.js";
import { FRESH_MS, type EngineOptions } from "../provenance.js";
import type { Coords } from "../types.js";
import { NWS_API, nwsJson } from "./http.js";

export interface NwsPoint {
  forecast: string;
  forecastHourly: string;
  forecastGridData: string;
  observationStations: string;
  timeZone: string | null;
  city: string | null;
  state: string | null;
  radarStation: string | null;
  sun: {
    sunrise: number;
    sunset: number;
    firstLight: number | null;
    lastLight: number | null;
  } | null;
}

const pointCache = new WeatherCache<NwsPoint | null>(
  FRESH_MS.point,
  200,
  RESILIENT_CACHE,
);

/** At most four decimals, trailing zeros dropped: 41.03 not 41.0300. */
const fmt = (v: number): string => String(Number(v.toFixed(4)));
const pointKey = (c: Coords): string => `${fmt(c.lat)},${fmt(c.lon)}`;

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** An ISO time as epoch ms, or null when missing or unparsable. */
function isoMs(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}

/** A required NWS URL: must be a string under the fixed NWS API host. */
function nwsUrl(props: Record<string, unknown>, key: string): string {
  const v = props[key];
  if (typeof v !== "string" || !v.startsWith(`${NWS_API}/`)) {
    throw new Error(`NWS point: missing or foreign ${key}`);
  }
  return v;
}

function parsePoint(body: unknown): NwsPoint {
  const props = rec(rec(body)?.properties);
  if (!props) throw new Error("NWS point: no properties");
  const loc = rec(rec(props.relativeLocation)?.properties);
  const ad = rec(props.astronomicalData);
  const sunrise = isoMs(ad?.sunrise);
  const sunset = isoMs(ad?.sunset);
  return {
    forecast: nwsUrl(props, "forecast"),
    forecastHourly: nwsUrl(props, "forecastHourly"),
    forecastGridData: nwsUrl(props, "forecastGridData"),
    observationStations: nwsUrl(props, "observationStations"),
    timeZone: str(props.timeZone),
    city: str(loc?.city),
    state: str(loc?.state),
    radarStation: str(props.radarStation),
    sun:
      sunrise !== null && sunset !== null
        ? {
            sunrise,
            sunset,
            firstLight: isoMs(ad?.civilTwilightBegin),
            lastLight: isoMs(ad?.civilTwilightEnd),
          }
        : null,
  };
}

/**
 * The NWS point for a coordinate, or `null` when the point is invalid, outside
 * NWS coverage (404), or the lookup failed. Never throws.
 */
export async function getPoint(
  coords: Coords,
  opts: EngineOptions = {},
): Promise<NwsPoint | null> {
  const { lat, lon } = coords;
  if (!isValidCoord(lat, lon)) return null;
  const key = pointKey(coords);
  const url = `${NWS_API}/points/${key}`;
  return pointCache.get(
    key,
    async () => {
      const body = await nwsJson(url, opts);
      if (body === null) return null; // 404: outside coverage, a normal answer
      return parsePoint(body);
    },
    null,
    bindOnError(opts, "getPoint", lat, lon),
  );
}

/** Drop one coordinate's cached point so the next call looks it up afresh. */
export function evictPoint(coords: Coords): void {
  pointCache.delete(pointKey(coords));
}

/** Test hook: clear every cached point. */
export function clearPointCache(): void {
  pointCache.clear();
}
