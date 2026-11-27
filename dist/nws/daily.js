/**
 * The seven-day forecast: `forecast` periods folded into one reading per date
 * (the venue's own date). A day has its day period's high and its evening
 * night period's low. A point that has moved (404) is looked up again once.
 */
import { WeatherCache } from "../cache.js";
import { RESILIENT_CACHE, bindOnError } from "../helpers.js";
import { FRESH_MS, MAX_AGE_MS } from "../provenance.js";
import { readLastGood, writeLastGood } from "../store.js";
import { conditionFromNwsIcon } from "../condition.js";
import { cToF } from "../units.js";
import { lookupPoint } from "./point.js";
import { fetchPeriods } from "./periods.js";
import { applyRadarToToday, startRadarRain } from "../radar.js";
import { localDay } from "../localDay.js";
const STORE_PREFIX = "aw:daily:";
const dailyCache = new WeatherCache(FRESH_MS.daily, 200, RESILIENT_CACHE);
/** At most four decimals, trailing zeros dropped: the same key as the point cache. */
const fmt = (v) => String(Number(v.toFixed(4)));
function rec(v) {
    return typeof v === "object" && v !== null ? v : null;
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
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
/** A period as a day part, or null when its start time has no YYYY-MM-DD date. */
function partOf(raw) {
    const p = rec(raw);
    if (!p || typeof p.startTime !== "string" || !DATE_RE.test(p.startTime))
        return null;
    const hour = Number(p.startTime.slice(11, 13));
    const temp = num(p.temperature);
    const icon = conditionFromNwsIcon(p.icon);
    return {
        date: p.startTime.slice(0, 10),
        hour: Number.isFinite(hour) ? hour : -1,
        isDay: typeof p.isDaytime === "boolean" ? p.isDaytime : null,
        temperature: num(p.temperatureUnit === "C" ? cToF(temp) : temp),
        precip: num(rec(p.probabilityOfPrecipitation)?.value),
        condition: icon.condition,
        windy: icon.windy,
    };
}
/** Fold one date's parts into its reading. Never uses a night temperature as a high. */
function foldDay(date, parts) {
    const day = parts.find((x) => x.isDay === true) ?? null;
    const nights = parts.filter((x) => x.isDay === false);
    // The evening night period (18:00 or later) is the night; an earlier one
    // (an "Overnight" dated today) only when it is this date's only night.
    const night = nights.find((x) => x.hour >= 18) ?? (nights.length === 1 ? nights[0] : null);
    const rounded = (t) => t === null ? null : Math.round(t);
    const chances = [day?.precip, night?.precip].filter((v) => typeof v === "number");
    return {
        date,
        high: rounded(day?.temperature ?? null),
        low: rounded(night?.temperature ?? null),
        precipProbabilityMax: chances.length > 0 ? Math.round(Math.max(...chances)) : null,
        dayCondition: day?.condition ?? null,
        nightCondition: night?.condition ?? null,
        windy: (day?.windy ?? false) || (night?.windy ?? false),
    };
}
/** Group the periods by date and fold each date, sorted by date. */
function foldDays(periods) {
    const byDate = new Map();
    for (const raw of periods) {
        const part = partOf(raw);
        if (!part)
            continue;
        const list = byDate.get(part.date);
        if (list)
            list.push(part);
        else
            byDate.set(part.date, [part]);
    }
    return [...byDate.keys()].sort().map((date) => foldDay(date, byDate.get(date)));
}
async function fetchDaily(coords, first, opts, now) {
    const { props, periods } = await fetchPeriods(coords, first, opts, (p) => p.forecast, "NWS daily");
    return {
        at: isoMs(props.updateTime) ?? now(),
        days: foldDays(periods),
    };
}
function withStamp(b, fetchedAt, stale) {
    return {
        stamp: { kind: "forecast", at: b.at, fetchedAt, stale, source: "nws-forecast" },
        days: b.days,
    };
}
/**
 * The seven-day forecast for a coordinate, one reading per date, or `null`
 * when the point is outside coverage or no reading is usable (fresh, stale
 * inside its bound, or last-good in the store). When the point lookup failed,
 * the forecast already in memory is returned under the same bound (B-015), else
 * the stored last-good forecast: no request, and no radar (there is no time zone
 * to place today). Never throws.
 */
export async function getDaily(coords, opts = {}) {
    const lookup = await lookupPoint(coords, opts);
    if (lookup.status === "outside")
        return null;
    const now = opts.now ?? Date.now;
    if (lookup.status === "failed")
        return heldDaily(coords, opts, now);
    const point = lookup.point;
    // The radar, when asked, runs alongside the reading. It is for today's cell, so
    // it starts only with a usable time zone: today is the venue's date for now().
    const today = opts.radar === true && point.timeZone !== null ? localDay(now(), point.timeZone) : null;
    const radar = today === null ? null : startRadarRain(coords, opts);
    const result = await readDaily(coords, point, opts, now);
    if (!result)
        return null;
    if (radar === null || today === null)
        return result;
    // The clock is read when the claim is made, so a frame that has aged out by then cannot claim (B-013).
    return { ...result, days: applyRadarToToday(result.days, await radar, today, now()) };
}
/**
 * The forecast from the cache, else from the last-good store. Neither copy
 * carries a radar claim: the claim is added by `getDaily`, after this returns.
 */
async function readDaily(coords, point, opts, now) {
    const { lat, lon } = coords;
    const key = `${fmt(lat)},${fmt(lon)}`;
    const storeKey = STORE_PREFIX + key;
    const meta = await dailyCache.getWithMeta(key, async () => {
        const body = await fetchDaily(coords, point, opts, now);
        writeLastGood(opts.store, storeKey, body, now());
        return body;
    }, null, bindOnError(opts, "getDaily", lat, lon), MAX_AGE_MS.daily, now);
    if (meta.data)
        return withStamp(meta.data, meta.fetchedAt, meta.stale);
    return readStoredDaily(storeKey, opts, now);
}
/** The last-good forecast from the store, marked stale, or `null` when none is usable. */
async function readStoredDaily(storeKey, opts, now) {
    const last = await readLastGood(opts.store, storeKey, MAX_AGE_MS.daily, now());
    return last ? withStamp(last.data, last.fetchedAt, true) : null;
}
/**
 * The failed-lookup path of `getDaily`: the in-memory forecast first (B-015), read
 * with no request and no `onError` under the normal age bound, then the store.
 */
async function heldDaily(coords, opts, now) {
    const key = `${fmt(coords.lat)},${fmt(coords.lon)}`;
    const held = dailyCache.peek(key, MAX_AGE_MS.daily, now);
    if (held?.data)
        return withStamp(held.data, held.fetchedAt, held.stale);
    return readStoredDaily(STORE_PREFIX + key, opts, now);
}
/** Test hook: clear every cached daily forecast. */
export function clearDailyCache() {
    dailyCache.clear();
}
//# sourceMappingURL=daily.js.map