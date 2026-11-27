/**
 * Current conditions. The ladder, in order:
 *   1. Observed: the first two stations, in the order NWS gives; the first reading with
 *      a temperature and no more than 90 minutes old wins.
 *   2. Forecast: the official hourly forecast hour containing `now`.
 *   3. Otherwise no reading. The loader throws, so the cache serves stale or
 *      empty and reports one `onError`.
 * Only an observed reading is written to the last-good store. Never throws.
 */
import { WeatherCache } from "./cache.js";
import { RESILIENT_CACHE, bindOnError, roundOrNull, safeReport } from "./helpers.js";
import { FRESH_MS, MAX_AGE_MS, type EngineOptions, type Stamp } from "./provenance.js";
import { readLastGood, writeLastGood } from "./store.js";
import { conditionFromNwsIcon, type Condition } from "./condition.js";
import { cToF, kmhToMph, mmToIn, mToFt, mToMi, paToInHg } from "./units.js";
import type { Coords } from "./types.js";
import { getHourly, type HourReading } from "./nws/hourly.js";
import { lookupPoint } from "./nws/point.js";
import { applyRadarToNow, startRadarRain } from "./radar.js";
import {
  getLatestObservation,
  getStations,
  type Observation,
  type Station,
} from "./nws/observations.js";

/** The longest age an observation may have and still be the current reading. */
export const MAX_OBSERVATION_AGE_MS = 90 * 60_000;

export interface NowReading {
  stamp: Stamp;
  station: { id: string; name: string } | null;
  temperature: number | null;
  feelsLike: number | null;
  dewPoint: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGust: number | null;
  pressure: number | null;
  visibility: number | null;
  cloudBase: number | null;
  precipLastHour: number | null;
  condition: Condition | null;
  windy: boolean;
  isDay: boolean | null;
  rainSource?: "radar";
  radarAt?: number | null;
}

/** The cached body: the stamp's `fetchedAt` and `stale` come from the cache meta. */
type Body = Omit<NowReading, "stamp"> & {
  stamp: Pick<Stamp, "kind" | "at" | "source">;
};

const STORE_PREFIX = "aw:now:";

// No retry here: the ladder's own fetches retry through their caches, so a
// second pass of the whole ladder would report each inner failure twice (B-007).
const nowCache = new WeatherCache<Body | null>(FRESH_MS.now, 200, {
  ...RESILIENT_CACHE,
  retries: 0,
});

/** At most four decimals, trailing zeros dropped: the same key as hourly. */
const fmt = (v: number): string => String(Number(v.toFixed(4)));

/** Round to two decimals, keeping `null`. */
const round2 = (v: number | null): number | null =>
  v === null ? null : Math.round(v * 100) / 100;

function fromObservation(obs: Observation, station: Station): Body {
  const icon = conditionFromNwsIcon(obs.icon);
  const cloudFt = mToFt(obs.cloudBaseM);
  return {
    stamp: { kind: "observed", at: obs.at, source: "nws-station" },
    station: { id: station.id, name: station.name },
    temperature: roundOrNull(cToF(obs.temperatureC)),
    feelsLike: roundOrNull(cToF(obs.heatIndexC ?? obs.windChillC ?? obs.temperatureC)),
    dewPoint: roundOrNull(cToF(obs.dewpointC)),
    humidity: roundOrNull(obs.humidity),
    windSpeed: roundOrNull(kmhToMph(obs.windKmh)),
    windDirection: roundOrNull(obs.windDeg),
    windGust: roundOrNull(kmhToMph(obs.gustKmh)),
    pressure: round2(paToInHg(obs.pressurePa)),
    visibility: roundOrNull(mToMi(obs.visibilityM)),
    cloudBase: cloudFt === null ? null : Math.round(cloudFt / 100) * 100,
    precipLastHour: round2(mmToIn(obs.precipLastHourMm)),
    condition: icon.condition,
    windy: icon.windy,
    isDay: icon.isDay,
  };
}

function fromHour(hour: HourReading): Body {
  return {
    stamp: { kind: "forecast", at: hour.timestamp, source: "nws-forecast" },
    station: null,
    temperature: hour.temperature,
    feelsLike: hour.feelsLike,
    dewPoint: hour.dewPoint,
    humidity: hour.humidity,
    windSpeed: hour.windSpeed,
    windDirection: null,
    windGust: hour.windGust,
    pressure: null,
    visibility: hour.visibility,
    cloudBase: null,
    precipLastHour: null,
    condition: hour.condition,
    windy: hour.windy,
    isDay: hour.isDay,
  };
}

function withStamp(b: Body, fetchedAt: number, stale: boolean): NowReading {
  return { ...b, stamp: { ...b.stamp, fetchedAt, stale } };
}

/** Stations, with a failure read as "no stations": the caller falls through to the forecast. */
async function stationsOrNone(coords: Coords, opts: EngineOptions): Promise<Station[]> {
  try {
    return (await getStations(coords, opts)) ?? [];
  } catch {
    return [];
  }
}

/**
 * One station's observation. A failure is reported once through `onError` as
 * `getLatestObservation` and read as "no reading from this station". A 404 is
 * not a failure: `getLatestObservation` answers `null` and nothing is reported.
 */
async function observationOrNull(
  id: string,
  coords: Coords,
  opts: EngineOptions,
): Promise<Observation | null> {
  try {
    return await getLatestObservation(id, opts);
  } catch (err) {
    safeReport(bindOnError(opts, "getLatestObservation", coords.lat, coords.lon), err);
    return null;
  }
}

/** The loader: the ladder. Throws only when no rung gives a reading. */
async function load(coords: Coords, opts: EngineOptions, now: () => number): Promise<Body> {
  const stations = await stationsOrNone(coords, opts);
  for (const station of stations.slice(0, 2)) {
    const obs = await observationOrNull(station.id, coords, opts);
    if (
      obs &&
      obs.temperatureC !== null &&
      now() - obs.at <= MAX_OBSERVATION_AGE_MS
    ) {
      return fromObservation(obs, station);
    }
  }
  const hourly = await getHourly(coords, opts);
  const t = now();
  const hour = hourly?.hours.find((h) => h.timestamp <= t && t < h.timestamp + 3_600_000);
  if (hour) return fromHour(hour);
  throw new Error("getNow: no observation and no forecast hour");
}

/**
 * Current conditions for a coordinate: a measured station reading when one is
 * fresh enough, else the official forecast hour containing now. `null` when the
 * point is outside NWS coverage (no `onError`), or no reading is usable (fresh,
 * stale inside its bound, or last-good in the store). When the point lookup
 * failed, the reading already in memory is returned under the same bound (B-015),
 * else the stored last-good observed reading: no request, and no radar claim.
 * Never throws.
 */
export async function getNow(
  coords: Coords,
  opts: EngineOptions = {},
): Promise<NowReading | null> {
  const lookup = await lookupPoint(coords, opts);
  if (lookup.status === "outside") return null;
  const now = opts.now ?? Date.now;
  if (lookup.status === "failed") return heldNow(coords, opts, now);
  // The radar, when asked, runs alongside the reading: started once the point is
  // known (so a point outside coverage asks nothing), before the reading loads.
  const radar = opts.radar === true ? startRadarRain(coords, opts) : null;
  const reading = await readNow(coords, opts);
  if (!reading) return null;
  // The clock is read when the claim is made, so a frame that has aged out by then cannot claim (B-013).
  return radar ? applyRadarToNow(reading, await radar, now()) : reading;
}

/**
 * The failed-lookup path of `getNow`: the in-memory reading first (B-015), read with
 * no request, no radar and no `onError` under the normal age bound, then the store.
 */
async function heldNow(
  coords: Coords,
  opts: EngineOptions,
  now: () => number,
): Promise<NowReading | null> {
  const key = `${fmt(coords.lat)},${fmt(coords.lon)}`;
  const held = nowCache.peek(key, MAX_AGE_MS.now, now);
  if (held?.data) return withStamp(held.data, held.fetchedAt, held.stale);
  return readStoredNow(coords, opts, now);
}

/** The last-good reading from the store, marked stale, or `null` when none is usable. */
async function readStoredNow(
  coords: Coords,
  opts: EngineOptions,
  now: () => number,
): Promise<NowReading | null> {
  const storeKey = STORE_PREFIX + `${fmt(coords.lat)},${fmt(coords.lon)}`;
  const last = await readLastGood<Body>(opts.store, storeKey, MAX_AGE_MS.now, now());
  return last ? withStamp(last.data, last.fetchedAt, true) : null;
}

/**
 * The reading from the cache, else from the last-good store. Neither copy
 * carries a radar claim: the claim is added by `getNow`, after this returns.
 */
async function readNow(coords: Coords, opts: EngineOptions): Promise<NowReading | null> {
  const { lat, lon } = coords;
  const now = opts.now ?? Date.now;
  const key = `${fmt(lat)},${fmt(lon)}`;
  const storeKey = STORE_PREFIX + key;

  const meta = await nowCache.getWithMeta(
    key,
    async () => {
      const body = await load(coords, opts, now);
      if (body.stamp.kind === "observed") {
        writeLastGood(opts.store, storeKey, body, now());
      }
      return body;
    },
    null,
    bindOnError(opts, "getNow", lat, lon),
    MAX_AGE_MS.now,
    now,
  );
  if (meta.data) return withStamp(meta.data, meta.fetchedAt, meta.stale);

  const last = await readLastGood<Body>(opts.store, storeKey, MAX_AGE_MS.now, now());
  return last ? withStamp(last.data, last.fetchedAt, true) : null;
}

/** Test hook: clear every cached current reading. */
export function clearNowCache(): void {
  nowCache.clear();
}
