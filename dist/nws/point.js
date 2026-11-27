/**
 * Point lookup: `/points/{lat},{lon}` → the forecast URLs, the time zone, the
 * place, the radar station and today's sun data. A point outside NWS coverage
 * answers 404: a normal answer, cached as "outside" without `onError`. A lookup
 * that fails (500, timeout) is reported once through `onError`, is not cached,
 * and holds that coordinate for `POINT_RETRY_AFTER_MS` (no request in the hold).
 */
import { WeatherCache } from "../cache.js";
import { RESILIENT_CACHE, bindOnError, isValidCoord, safeReport } from "../helpers.js";
import { FRESH_MS } from "../provenance.js";
import { NWS_API, nwsJson } from "./http.js";
/** The answer for a 404: outside NWS coverage. A failed lookup stores nothing. */
const OUTSIDE = "outside";
/** After a failed lookup, a coordinate is not asked again for this long. */
export const POINT_RETRY_AFTER_MS = 30_000;
/** Holds and last answers are bounded like the cache: 200 coordinates. */
const TRACKED_MAX = 200;
const pointCache = new WeatherCache(FRESH_MS.point, TRACKED_MAX, RESILIENT_CACHE);
/** Failed coordinates: key → epoch ms of the failure. Cleared by a success or `clearPointCache`. */
const holds = new Map();
/**
 * The last answer read for each coordinate. The cache keeps it only for its own
 * stale-on-error fallback, which a held lookup cannot reach without a request.
 */
const lastValue = new Map();
/** Insert or refresh `key`, dropping the oldest entries past the bound. */
function remember(map, key, value) {
    map.delete(key);
    map.set(key, value);
    while (map.size > TRACKED_MAX) {
        const oldest = map.keys().next().value;
        if (oldest === undefined)
            break;
        map.delete(oldest);
    }
}
function toLookup(value) {
    if (value === null)
        return { status: "failed" };
    if (value === OUTSIDE)
        return { status: "outside" };
    return { status: "ok", point: value };
}
/** At most four decimals, trailing zeros dropped: 41.03 not 41.0300. */
const fmt = (v) => String(Number(v.toFixed(4)));
const pointKey = (c) => `${fmt(c.lat)},${fmt(c.lon)}`;
function rec(v) {
    return typeof v === "object" && v !== null
        ? v
        : null;
}
function str(v) {
    return typeof v === "string" ? v : null;
}
/** An ISO time as epoch ms, or null when missing or unparsable. */
function isoMs(v) {
    if (typeof v !== "string")
        return null;
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
}
/** A required NWS URL: must be a string under the fixed NWS API host. */
function nwsUrl(props, key) {
    const v = props[key];
    if (typeof v !== "string" || !v.startsWith(`${NWS_API}/`)) {
        throw new Error(`NWS point: missing or foreign ${key}`);
    }
    return v;
}
function parsePoint(body) {
    const props = rec(rec(body)?.properties);
    if (!props)
        throw new Error("NWS point: no properties");
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
        sun: sunrise !== null && sunset !== null
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
 * The NWS point for a coordinate, with the reason it is missing told apart.
 * `outside`: invalid coordinates, or a 404 (no `onError`, cached as a normal
 * answer). `failed`: the lookup could not be read; `onError` fires once, the
 * coordinate is held for `POINT_RETRY_AFTER_MS` with no request, and a stored
 * point the cache still holds comes back as `ok`. Never throws.
 */
export async function lookupPoint(coords, opts = {}) {
    const { lat, lon } = coords;
    if (!isValidCoord(lat, lon))
        return { status: "outside" };
    const key = pointKey(coords);
    const now = opts.now ?? Date.now;
    const heldAt = holds.get(key);
    if (heldAt !== undefined && now() - heldAt < POINT_RETRY_AFTER_MS) {
        return toLookup(lastValue.get(key) ?? null);
    }
    const url = `${NWS_API}/points/${key}`;
    const report = bindOnError(opts, "getPoint", lat, lon);
    const value = await pointCache.get(key, async () => {
        const body = await nwsJson(url, opts);
        const found = body === null ? OUTSIDE : parsePoint(body);
        holds.delete(key);
        remember(lastValue, key, found);
        return found;
    }, null, (err) => {
        // The one report per ultimately-failed lookup: it also starts the hold.
        remember(holds, key, now());
        safeReport(report, err);
    });
    return toLookup(value);
}
/**
 * The NWS point for a coordinate, or `null` when the point is invalid, outside
 * NWS coverage (404), or the lookup failed. Never throws. Use `lookupPoint`
 * when the difference matters.
 */
export async function getPoint(coords, opts = {}) {
    const lookup = await lookupPoint(coords, opts);
    return lookup.status === "ok" ? lookup.point : null;
}
/** Drop one coordinate's cached point so the next call looks it up afresh. A hold stays. */
export function evictPoint(coords) {
    const key = pointKey(coords);
    pointCache.delete(key);
    lastValue.delete(key);
}
/** Test hook: clear every cached point and every hold. */
export function clearPointCache() {
    pointCache.clear();
    holds.clear();
    lastValue.clear();
}
//# sourceMappingURL=point.js.map