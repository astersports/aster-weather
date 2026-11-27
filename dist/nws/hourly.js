/**
 * The hourly forecast: `forecastHourly` periods joined with the forecast grid
 * (feels-like, gusts, sky, humidity, dew point, thunder, visibility, heat
 * stress) and the grid's rain, snow and ice amounts. Grid failure keeps the
 * hours. A point that has moved (404) is looked up again once.
 */
import { WeatherCache } from "../cache.js";
import { RESILIENT_CACHE, bindOnError, roundOrNull } from "../helpers.js";
import { FRESH_MS, MAX_AGE_MS } from "../provenance.js";
import { readLastGood, writeLastGood } from "../store.js";
import { conditionFromNwsIcon } from "../condition.js";
import { cToF, kmhToMph, mmToIn, mToMi } from "../units.js";
import { getGrid, gridValueAt } from "./grid.js";
import { getPoint } from "./point.js";
import { fetchPeriods } from "./periods.js";
const STORE_PREFIX = "aw:hourly:";
/** How long an hourly load without its grid is kept before the grid is asked again (B-003). */
export const GRID_RETRY_AFTER_MS = 5 * 60_000;
const hourlyCache = new WeatherCache(FRESH_MS.hourly, 200, RESILIENT_CACHE);
/** At most four decimals, trailing zeros dropped: the same key as the point cache. */
const fmt = (v) => String(Number(v.toFixed(4)));
function rec(v) {
    return typeof v === "object" && v !== null ? v : null;
}
function str(v) {
    return typeof v === "string" ? v : null;
}
function num(v) {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}
/** An ISO time as epoch ms, or null when missing or unparsable. */
function isoMs(v) {
    if (typeof v !== "string")
        return null;
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
}
/**
 * NWS wind as mph: a number is rounded; a string gives its largest integer, so
 * "5 to 12 mph" is 12. Anything else is null.
 */
function windMph(v) {
    if (typeof v === "number")
        return roundOrNull(v);
    if (typeof v !== "string")
        return null;
    const found = v.match(/\d+/g);
    return found ? Math.max(...found.map(Number)) : null;
}
function hourFrom(p, timestamp, layers) {
    const at = (name) => gridValueAt(layers?.[name] ?? [], timestamp);
    const icon = conditionFromNwsIcon(p.icon);
    const temp = num(p.temperature);
    return {
        timestamp,
        isDay: typeof p.isDaytime === "boolean" ? p.isDaytime : (icon.isDay ?? true),
        temperature: roundOrNull(p.temperatureUnit === "C" ? cToF(temp) : temp),
        feelsLike: roundOrNull(cToF(at("apparentTemperature"))),
        precipProbability: roundOrNull(num(rec(p.probabilityOfPrecipitation)?.value)),
        windSpeed: windMph(p.windSpeed),
        windDirection: str(p.windDirection),
        windGust: roundOrNull(kmhToMph(at("windGust"))),
        cloudCover: roundOrNull(at("skyCover")),
        humidity: roundOrNull(at("relativeHumidity")),
        dewPoint: roundOrNull(cToF(at("dewpoint"))),
        thunderProbability: roundOrNull(at("probabilityOfThunder")),
        visibility: roundOrNull(mToMi(at("visibility"))),
        heatStress: roundOrNull(cToF(at("wetBulbGlobeTemperature"))),
        condition: icon.condition,
        windy: icon.windy,
    };
}
/** A grid layer's non-null blocks as inches, each rounded to two decimals. */
function amounts(layers, name) {
    const out = [];
    for (const b of layers?.[name] ?? []) {
        const inches = b.value === null ? null : mmToIn(b.value);
        if (inches === null)
            continue;
        out.push({ start: b.start, end: b.end, inches: Math.round(inches * 100) / 100 });
    }
    return out;
}
/**
 * Fetch the hourly periods, with one fresh point lookup on a 404, then the
 * grid. Throws when the forecast cannot be read, so the cache serves stale or
 * empty and reports one `onError`.
 */
async function fetchHourly(coords, first, opts, now) {
    const { point: current, props, periods } = await fetchPeriods(coords, first, opts, (p) => p.forecastHourly, "NWS hourly");
    const layers = await getGrid(coords, opts);
    const hours = [];
    for (const raw of periods) {
        const p = rec(raw);
        if (!p)
            continue;
        const timestamp = isoMs(p.startTime);
        if (timestamp === null)
            continue;
        hours.push(hourFrom(p, timestamp, layers));
    }
    return {
        at: isoMs(props.updateTime) ?? now(),
        timeZone: current.timeZone,
        hours,
        rain: amounts(layers, "quantitativePrecipitation"),
        snow: amounts(layers, "snowfallAmount"),
        ice: amounts(layers, "iceAccumulation"),
        gridAvailable: layers !== null,
    };
}
function withStamp(b, fetchedAt, stale) {
    return {
        stamp: { kind: "forecast", at: b.at, fetchedAt, stale, source: "nws-forecast" },
        timeZone: b.timeZone,
        hours: b.hours,
        rain: b.rain,
        snow: b.snow,
        ice: b.ice,
        // A body stored before this field existed reads as no grid: its grid may be missing.
        gridAvailable: b.gridAvailable === true,
    };
}
/**
 * The hourly forecast for a coordinate, joined with the grid, or `null` when
 * the point is outside coverage or no reading is usable (fresh, stale inside
 * its bound, or last-good in the store). Never throws.
 */
export async function getHourly(coords, opts = {}) {
    const { lat, lon } = coords;
    const point = await getPoint(coords, opts);
    if (!point)
        return null;
    const now = opts.now ?? Date.now;
    const key = `${fmt(lat)},${fmt(lon)}`;
    const storeKey = STORE_PREFIX + key;
    const meta = await hourlyCache.getWithMeta(key, async () => {
        const body = await fetchHourly(coords, point, opts, now);
        writeLastGood(opts.store, storeKey, body, now());
        return body;
    }, null, bindOnError(opts, "getHourly", lat, lon), MAX_AGE_MS.hourly, now, (body) => (body && !body.gridAvailable ? GRID_RETRY_AFTER_MS : FRESH_MS.hourly));
    if (meta.data)
        return withStamp(meta.data, meta.fetchedAt, meta.stale);
    const last = await readLastGood(opts.store, storeKey, MAX_AGE_MS.hourly, now());
    return last ? withStamp(last.data, last.fetchedAt, true) : null;
}
/** Test hook: clear every cached hourly forecast. */
export function clearHourlyCache() {
    hourlyCache.clear();
}
//# sourceMappingURL=hourly.js.map