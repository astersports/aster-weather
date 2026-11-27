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
import { getPoint } from "./point.js";
import { fetchPeriods } from "./periods.js";
import { applyRadarToToday, getRadarRain } from "../radar.js";
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
 * inside its bound, or last-good in the store). Never throws.
 */
export async function getDaily(coords, opts = {}) {
    const { lat, lon } = coords;
    const point = await getPoint(coords, opts);
    if (!point)
        return null;
    const now = opts.now ?? Date.now;
    const key = `${fmt(lat)},${fmt(lon)}`;
    const storeKey = STORE_PREFIX + key;
    const meta = await dailyCache.getWithMeta(key, async () => {
        const body = await fetchDaily(coords, point, opts, now);
        writeLastGood(opts.store, storeKey, body, now());
        return body;
    }, null, bindOnError(opts, "getDaily", lat, lon), MAX_AGE_MS.daily, now);
    if (meta.data)
        return withRadarToday(withStamp(meta.data, meta.fetchedAt, meta.stale), coords, point, opts, now);
    const last = await readLastGood(opts.store, storeKey, MAX_AGE_MS.daily, now());
    return last ? withRadarToday(withStamp(last.data, last.fetchedAt, true), coords, point, opts, now) : null;
}
/**
 * The radar upgrade for today's cell, applied after the cache or store so neither
 * copy carries a claim. Only when `opts.radar` is `true` and the point has a time
 * zone: today is the venue's date for `now()`. An invalid zone skips the radar.
 */
async function withRadarToday(result, coords, point, opts, now) {
    if (opts.radar !== true || point.timeZone === null)
        return result;
    let today;
    try {
        today = new Intl.DateTimeFormat("en-CA", {
            timeZone: point.timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(new Date(now()));
    }
    catch {
        return result;
    }
    const radar = await getRadarRain(coords, opts);
    return { ...result, days: applyRadarToToday(result.days, radar, today) };
}
/** Test hook: clear every cached daily forecast. */
export function clearDailyCache() {
    dailyCache.clear();
}
//# sourceMappingURL=daily.js.map