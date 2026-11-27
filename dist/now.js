/**
 * Current conditions. The ladder, in order:
 *   1. Observed: the first two stations, nearest first; the first reading with
 *      a temperature and no more than 90 minutes old wins.
 *   2. Forecast: the official hourly forecast hour containing `now`.
 *   3. Otherwise no reading. The loader throws, so the cache serves stale or
 *      empty and reports one `onError`.
 * Only an observed reading is written to the last-good store. Never throws.
 */
import { WeatherCache } from "./cache.js";
import { RESILIENT_CACHE, bindOnError, roundOrNull } from "./helpers.js";
import { FRESH_MS, MAX_AGE_MS } from "./provenance.js";
import { readLastGood, writeLastGood } from "./store.js";
import { conditionFromNwsIcon } from "./condition.js";
import { cToF, kmhToMph, mmToIn, mToFt, mToMi, paToInHg } from "./units.js";
import { getHourly } from "./nws/hourly.js";
import { getPoint } from "./nws/point.js";
import { getLatestObservation, getStations, } from "./nws/observations.js";
/** The longest age an observation may have and still be the current reading. */
export const MAX_OBSERVATION_AGE_MS = 90 * 60_000;
const STORE_PREFIX = "aw:now:";
const nowCache = new WeatherCache(FRESH_MS.now, 200, RESILIENT_CACHE);
/** At most four decimals, trailing zeros dropped: the same key as hourly. */
const fmt = (v) => String(Number(v.toFixed(4)));
/** Round to two decimals, keeping `null`. */
const round2 = (v) => v === null ? null : Math.round(v * 100) / 100;
function fromObservation(obs, station) {
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
function fromHour(hour) {
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
function withStamp(b, fetchedAt, stale) {
    return { ...b, stamp: { ...b.stamp, fetchedAt, stale } };
}
/** Stations, with a failure read as "no stations": the caller falls through to the forecast. */
async function stationsOrNone(coords, opts) {
    try {
        return (await getStations(coords, opts)) ?? [];
    }
    catch {
        return [];
    }
}
/** One station's observation, with a failure read as "no reading from this station". */
async function observationOrNull(id, opts) {
    try {
        return await getLatestObservation(id, opts);
    }
    catch {
        return null;
    }
}
/** The loader: the ladder. Throws only when no rung gives a reading. */
async function load(coords, opts, now) {
    const stations = await stationsOrNone(coords, opts);
    for (const station of stations.slice(0, 2)) {
        const obs = await observationOrNull(station.id, opts);
        if (obs &&
            obs.temperatureC !== null &&
            now() - obs.at <= MAX_OBSERVATION_AGE_MS) {
            return fromObservation(obs, station);
        }
    }
    const hourly = await getHourly(coords, opts);
    const t = now();
    const hour = hourly?.hours.find((h) => h.timestamp <= t && t < h.timestamp + 3_600_000);
    if (hour)
        return fromHour(hour);
    throw new Error("getNow: no observation and no forecast hour");
}
/**
 * Current conditions for a coordinate: a measured station reading when one is
 * fresh enough, else the official forecast hour containing now. `null` when the
 * point is outside NWS coverage (no `onError`), or no reading is usable (fresh,
 * stale inside its bound, or last-good in the store). Never throws.
 */
export async function getNow(coords, opts = {}) {
    const point = await getPoint(coords, opts);
    if (!point)
        return null;
    const { lat, lon } = coords;
    const now = opts.now ?? Date.now;
    const key = `${fmt(lat)},${fmt(lon)}`;
    const storeKey = STORE_PREFIX + key;
    const meta = await nowCache.getWithMeta(key, async () => {
        const body = await load(coords, opts, now);
        if (body.stamp.kind === "observed") {
            writeLastGood(opts.store, storeKey, body, now());
        }
        return body;
    }, null, bindOnError(opts, "getNow", lat, lon), MAX_AGE_MS.now, now);
    if (meta.data)
        return withStamp(meta.data, meta.fetchedAt, meta.stale);
    const last = await readLastGood(opts.store, storeKey, MAX_AGE_MS.now, now());
    return last ? withStamp(last.data, last.fetchedAt, true) : null;
}
/** Test hook: clear every cached current reading. */
export function clearNowCache() {
    nowCache.clear();
}
//# sourceMappingURL=now.js.map