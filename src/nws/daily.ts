/**
 * The seven-day forecast: `forecast` periods folded into one reading per date
 * (the venue's own date). A day has its day period's high and its evening
 * night period's low. A point that has moved (404) is looked up again once.
 */
import { WeatherCache } from "../cache.js";
import { RESILIENT_CACHE, bindOnError } from "../helpers.js";
import { FRESH_MS, MAX_AGE_MS, type EngineOptions, type Stamp } from "../provenance.js";
import { readLastGood, writeLastGood } from "../store.js";
import { conditionFromNwsIcon, type Condition } from "../condition.js";
import { cToF } from "../units.js";
import type { Coords } from "../types.js";
import { getPoint, type NwsPoint } from "./point.js";
import { fetchPeriods } from "./periods.js";
import { applyRadarToToday, getRadarRain } from "../radar.js";
import { localDay } from "../localDay.js";

/** One calendar day of the forecast. Every measurement is `null` when NWS gave none. */
export interface DayReading {
  date: string;
  high: number | null;
  low: number | null;
  precipProbabilityMax: number | null;
  dayCondition: Condition | null;
  nightCondition: Condition | null;
  windy: boolean;
  rainSource?: "radar";
}

export interface DailyResult {
  stamp: Stamp;
  days: DayReading[];
}

/** The cached body: the stamp's `fetchedAt` and `stale` come from the cache meta. */
interface DailyBody {
  at: number;
  days: DayReading[];
}

const STORE_PREFIX = "aw:daily:";

const dailyCache = new WeatherCache<DailyBody | null>(
  FRESH_MS.daily,
  200,
  RESILIENT_CACHE,
);

/** At most four decimals, trailing zeros dropped: the same key as the point cache. */
const fmt = (v: number): string => String(Number(v.toFixed(4)));

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** An ISO time as epoch ms, or null when missing or unparsable. */
function isoMs(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}

/** One period, reduced to what the day needs. */
interface Part {
  date: string;
  /** Hour of day at the venue, or -1 when the start time has none. */
  hour: number;
  isDay: boolean | null;
  temperature: number | null;
  precip: number | null;
  condition: Condition | null;
  windy: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/** A period as a day part, or null when its start time has no YYYY-MM-DD date. */
function partOf(raw: unknown): Part | null {
  const p = rec(raw);
  if (!p || typeof p.startTime !== "string" || !DATE_RE.test(p.startTime)) return null;
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
function foldDay(
  date: string,
  parts: Part[],
): DayReading {
  const day = parts.find((x) => x.isDay === true) ?? null;
  const nights = parts.filter((x) => x.isDay === false);
  // The evening night period (18:00 or later) is the night; an earlier one
  // (an "Overnight" dated today) only when it is this date's only night.
  const night =
    nights.find((x) => x.hour >= 18) ?? (nights.length === 1 ? nights[0]! : null);

  const rounded = (t: number | null): number | null =>
    t === null ? null : Math.round(t);
  const chances = [day?.precip, night?.precip].filter(
    (v): v is number => typeof v === "number",
  );

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
function foldDays(periods: unknown[]): DayReading[] {
  const byDate = new Map<string, Part[]>();
  for (const raw of periods) {
    const part = partOf(raw);
    if (!part) continue;
    const list = byDate.get(part.date);
    if (list) list.push(part);
    else byDate.set(part.date, [part]);
  }
  return [...byDate.keys()].sort().map((date) => foldDay(date, byDate.get(date)!));
}

async function fetchDaily(
  coords: Coords,
  first: NwsPoint,
  opts: EngineOptions,
  now: () => number,
): Promise<DailyBody> {
  const { props, periods } = await fetchPeriods(
    coords,
    first,
    opts,
    (p) => p.forecast,
    "NWS daily",
  );
  return {
    at: isoMs(props.updateTime) ?? now(),
    days: foldDays(periods),
  };
}

function withStamp(b: DailyBody, fetchedAt: number, stale: boolean): DailyResult {
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
export async function getDaily(
  coords: Coords,
  opts: EngineOptions = {},
): Promise<DailyResult | null> {
  const { lat, lon } = coords;
  const point = await getPoint(coords, opts);
  if (!point) return null;
  const now = opts.now ?? Date.now;
  const key = `${fmt(lat)},${fmt(lon)}`;
  const storeKey = STORE_PREFIX + key;

  const meta = await dailyCache.getWithMeta(
    key,
    async () => {
      const body = await fetchDaily(coords, point, opts, now);
      writeLastGood(opts.store, storeKey, body, now());
      return body;
    },
    null,
    bindOnError(opts, "getDaily", lat, lon),
    MAX_AGE_MS.daily,
    now,
  );
  if (meta.data) return withRadarToday(withStamp(meta.data, meta.fetchedAt, meta.stale), coords, point, opts, now);

  const last = await readLastGood<DailyBody>(opts.store, storeKey, MAX_AGE_MS.daily, now());
  return last ? withRadarToday(withStamp(last.data, last.fetchedAt, true), coords, point, opts, now) : null;
}

/**
 * The radar upgrade for today's cell, applied after the cache or store so neither
 * copy carries a claim. Only when `opts.radar` is `true` and the point has a time
 * zone: today is the venue's date for `now()`. An invalid zone skips the radar.
 */
async function withRadarToday(
  result: DailyResult,
  coords: Coords,
  point: NwsPoint,
  opts: EngineOptions,
  now: () => number,
): Promise<DailyResult> {
  if (opts.radar !== true || point.timeZone === null) return result;
  const today = localDay(now(), point.timeZone);
  if (today === null) return result;
  const radar = await getRadarRain(coords, opts);
  return { ...result, days: applyRadarToToday(result.days, radar, today) };
}

/** Test hook: clear every cached daily forecast. */
export function clearDailyCache(): void {
  dailyCache.clear();
}
