/**
 * Observation stations and the latest station observation. The station list
 * is cached per point (nearest first); an observation is not cached here, the
 * caller (`getNow`) decides how old a reading may be. A 404 is `null`; other
 * failures throw, and the caller catches.
 */
import { WeatherCache } from "../cache.js";
import { RESILIENT_CACHE, bindOnError, numOrNull } from "../helpers.js";
import { FRESH_MS } from "../provenance.js";
import { NWS_API, nwsJson } from "./http.js";
import { getPoint } from "./point.js";
const stationsCache = new WeatherCache(FRESH_MS.point, 200, RESILIENT_CACHE);
/** At most four decimals, trailing zeros dropped: the same key as the point cache. */
const fmt = (v) => String(Number(v.toFixed(4)));
function rec(v) {
    return typeof v === "object" && v !== null ? v : null;
}
function str(v) {
    return typeof v === "string" ? v : null;
}
/** A `{ value }` measurement as a finite number, else `null` (absent, null or non-number). */
function measure(props, name) {
    return numOrNull(rec(props[name])?.value);
}
/** The station list from a `/gridpoints/.../stations` body. Throws when there is no feature list. */
function parseStations(body) {
    const features = rec(body)?.features;
    if (!Array.isArray(features))
        throw new Error("NWS stations: no features");
    const out = [];
    for (const f of features) {
        const props = rec(rec(f)?.properties);
        const id = str(props?.stationIdentifier);
        if (id === null)
            continue;
        const name = str(props?.name);
        out.push({ id, name: name && name.length > 0 ? name : id });
    }
    return out;
}
/**
 * The observation stations for a coordinate, nearest first, or `null` when the
 * point is outside coverage or the list could not be read. Never throws. A list
 * that ultimately fails (after the cache's retry) is reported once through
 * `onError` as `getStations`.
 */
export async function getStations(coords, opts = {}) {
    const point = await getPoint(coords, opts);
    if (!point)
        return null;
    const key = `${fmt(coords.lat)},${fmt(coords.lon)}`;
    return stationsCache.get(key, async () => {
        const body = await nwsJson(point.observationStations, opts);
        if (body === null)
            throw new Error("NWS stations: 404");
        return parseStations(body);
    }, null, bindOnError(opts, "getStations", coords.lat, coords.lon));
}
/** Test hook: clear every cached station list. */
export function clearStationsCache() {
    stationsCache.clear();
}
/** The lowest finite cloud base among the layers, in metres; `null` when none. */
function lowestBase(props) {
    const layers = props.cloudLayers;
    if (!Array.isArray(layers))
        return null;
    let lowest = null;
    for (const layer of layers) {
        const v = numOrNull(rec(rec(layer)?.base)?.value);
        if (v !== null && (lowest === null || v < lowest))
            lowest = v;
    }
    return lowest;
}
/**
 * The latest observation from one station, or `null` when the station answers
 * 404 or the body has no readable timestamp. Throws on any other failure.
 * Not cached.
 */
export async function getLatestObservation(stationId, opts = {}) {
    const url = `${NWS_API}/stations/${encodeURIComponent(stationId)}/observations/latest`;
    const body = await nwsJson(url, opts);
    if (body === null)
        return null;
    const props = rec(rec(body)?.properties);
    if (!props)
        return null;
    const ts = str(props.timestamp);
    const at = ts === null ? NaN : Date.parse(ts);
    if (Number.isNaN(at))
        return null;
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
//# sourceMappingURL=observations.js.map