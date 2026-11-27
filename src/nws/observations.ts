/**
 * Observation stations and the latest station observation. The station list
 * is cached per point (nearest first); an observation is not cached here, the
 * caller (`getNow`) decides how old a reading may be. A 404 is `null`; other
 * failures throw, and the caller catches.
 */
import { WeatherCache } from "../cache.js";
import { RESILIENT_CACHE, numOrNull } from "../helpers.js";
import { FRESH_MS, type EngineOptions } from "../provenance.js";
import type { Coords } from "../types.js";
import { NWS_API, nwsJson } from "./http.js";
import { getPoint } from "./point.js";

export interface Station {
  id: string;
  name: string;
}

/** A station observation. Every measurement is `null` when the station gave none. */
export interface Observation {
  at: number;
  temperatureC: number | null;
  dewpointC: number | null;
  windKmh: number | null;
  windDeg: number | null;
  gustKmh: number | null;
  humidity: number | null;
  pressurePa: number | null;
  visibilityM: number | null;
  precipLastHourMm: number | null;
  windChillC: number | null;
  heatIndexC: number | null;
  cloudBaseM: number | null;
  icon: string | null;
}

const stationsCache = new WeatherCache<Station[] | null>(
  FRESH_MS.point,
  200,
  RESILIENT_CACHE,
);

/** At most four decimals, trailing zeros dropped: the same key as the point cache. */
const fmt = (v: number): string => String(Number(v.toFixed(4)));

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** A `{ value }` measurement as a finite number, else `null` (absent, null or non-number). */
function measure(props: Record<string, unknown>, name: string): number | null {
  return numOrNull(rec(props[name])?.value as number | null | undefined);
}

/** The station list from a `/gridpoints/.../stations` body. Throws when there is no feature list. */
function parseStations(body: unknown): Station[] {
  const features = rec(body)?.features;
  if (!Array.isArray(features)) throw new Error("NWS stations: no features");
  const out: Station[] = [];
  for (const f of features) {
    const props = rec(rec(f)?.properties);
    const id = str(props?.stationIdentifier);
    if (id === null) continue;
    const name = str(props?.name);
    out.push({ id, name: name && name.length > 0 ? name : id });
  }
  return out;
}

/**
 * The observation stations for a coordinate, nearest first, or `null` when the
 * point is outside coverage or the list could not be read. Never throws. No
 * `onError`: the caller reports.
 */
export async function getStations(
  coords: Coords,
  opts: EngineOptions = {},
): Promise<Station[] | null> {
  const point = await getPoint(coords, opts);
  if (!point) return null;
  const key = `${fmt(coords.lat)},${fmt(coords.lon)}`;
  return stationsCache.get(
    key,
    async () => {
      const body = await nwsJson(point.observationStations, opts);
      if (body === null) throw new Error("NWS stations: 404");
      return parseStations(body);
    },
    null,
  );
}

/** Test hook: clear every cached station list. */
export function clearStationsCache(): void {
  stationsCache.clear();
}

/** The lowest finite cloud base among the layers, in metres; `null` when none. */
function lowestBase(props: Record<string, unknown>): number | null {
  const layers = props.cloudLayers;
  if (!Array.isArray(layers)) return null;
  let lowest: number | null = null;
  for (const layer of layers) {
    const v = numOrNull(rec(rec(layer)?.base)?.value as number | null | undefined);
    if (v !== null && (lowest === null || v < lowest)) lowest = v;
  }
  return lowest;
}

/**
 * The latest observation from one station, or `null` when the station answers
 * 404 or the body has no readable timestamp. Throws on any other failure.
 * Not cached.
 */
export async function getLatestObservation(
  stationId: string,
  opts: EngineOptions = {},
): Promise<Observation | null> {
  const url = `${NWS_API}/stations/${encodeURIComponent(stationId)}/observations/latest`;
  const body = await nwsJson(url, opts);
  if (body === null) return null;
  const props = rec(rec(body)?.properties);
  if (!props) return null;
  const ts = str(props.timestamp);
  const at = ts === null ? NaN : Date.parse(ts);
  if (Number.isNaN(at)) return null;
  return {
    at,
    temperatureC: measure(props, "temperature"),
    dewpointC: measure(props, "dewpoint"),
    windKmh: measure(props, "windSpeed"),
    windDeg: measure(props, "windDirection"),
    gustKmh: measure(props, "windGust"),
    humidity: measure(props, "relativeHumidity"),
    pressurePa: measure(props, "barometricPressure"),
    visibilityM: measure(props, "visibility"),
    precipLastHourMm: measure(props, "precipitationLastHour"),
    windChillC: measure(props, "windChill"),
    heatIndexC: measure(props, "heatIndex"),
    cloudBaseM: lowestBase(props),
    icon: typeof props.icon === "string" ? props.icon : null,
  };
}
