/**
 * Sun and moon. `getSun` reads the sun data the point lookup already carries,
 * and only for the venue's current local calendar day: another day's times are
 * never returned. `getMoon` is a pure calculation from a time, with no network.
 */
import { localDay } from "./localDay.js";
import { evictPoint, getPoint, type NwsPoint } from "./nws/point.js";
import type { EngineOptions } from "./provenance.js";
import type { Coords } from "./types.js";

export interface SunTimes {
  sunrise: number;
  sunset: number;
  firstLight: number | null;
  lastLight: number | null;
  dayLengthMs: number;
}

export interface MoonPhase {
  fraction: number;
  illumination: number;
  name:
    | "New moon"
    | "Waxing crescent"
    | "First quarter"
    | "Waxing gibbous"
    | "Full moon"
    | "Waning gibbous"
    | "Last quarter"
    | "Waning crescent";
}

const SYNODIC_MONTH_MS = 29.530588853 * 86_400_000;
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
const PHASE_NAMES: readonly MoonPhase["name"][] = [
  "New moon",
  "Waxing crescent",
  "First quarter",
  "Waxing gibbous",
  "Full moon",
  "Waning gibbous",
  "Last quarter",
  "Waning crescent",
];

interface UsableSun {
  sun: NonNullable<NwsPoint["sun"]>;
  zone: string;
}

/** The point's sun data when it has a zone, sunrise, sunset and a positive day length. */
function usableSun(point: NwsPoint | null): UsableSun | null {
  if (!point || point.timeZone === null || point.sun === null) return null;
  const dayLengthMs = point.sun.sunset - point.sun.sunrise;
  if (!Number.isFinite(dayLengthMs) || dayLengthMs <= 0) return null;
  return { sun: point.sun, zone: point.timeZone };
}

/** True when the sunrise falls on the same local calendar day as `now`. */
function isToday({ sun, zone }: UsableSun, now: number): boolean {
  const today = localDay(now, zone);
  return today !== null && today === localDay(sun.sunrise, zone);
}

function toSunTimes({ sun }: UsableSun): SunTimes {
  return {
    sunrise: sun.sunrise,
    sunset: sun.sunset,
    firstLight: sun.firstLight,
    lastLight: sun.lastLight,
    dayLengthMs: sun.sunset - sun.sunrise,
  };
}

/** At most one point refresh per coordinate in this window (B-010). */
export const SUN_REFRESH_AFTER_MS = 15 * 60_000;

/** Coordinates whose last refresh attempt is remembered. The oldest is dropped beyond this. */
const SUN_REFRESH_LIMIT = 200;

/** The last refresh attempt for one coordinate, and what it brought (null when none usable). */
interface SunRefresh {
  at: number;
  sun: UsableSun | null;
}

const sunRefreshes = new Map<string, SunRefresh>();

/** At most four decimals, trailing zeros dropped: the same key as the point cache. */
const fmt = (v: number): string => String(Number(v.toFixed(4)));

/** Store a refresh attempt, most recent last, dropping the oldest beyond the bound. */
function rememberRefresh(key: string, entry: SunRefresh): void {
  sunRefreshes.delete(key);
  sunRefreshes.set(key, entry);
  while (sunRefreshes.size > SUN_REFRESH_LIMIT) {
    const oldest = sunRefreshes.keys().next().value;
    if (oldest === undefined) break;
    sunRefreshes.delete(oldest);
  }
}

/** True while `elapsed` is inside the refresh window (a clock that stepped back is not inside it). */
const withinRefreshWindow = (elapsed: number): boolean =>
  elapsed >= 0 && elapsed < SUN_REFRESH_AFTER_MS;

/** Test hook: forget every remembered refresh attempt. */
export function clearSunRefreshes(): void {
  sunRefreshes.clear();
}

/**
 * Today's sun times at the venue, or `null` when the point is outside coverage,
 * the lookup failed, or no sun data for today's local date is available. A cached
 * point from an earlier day is evicted and looked up once more, at most once per
 * coordinate per {@link SUN_REFRESH_AFTER_MS}; inside that window the last
 * refresh answers. A venue whose time zone is unusable gets `null` with no
 * refresh. Another day's times are never returned. Never throws.
 */
export async function getSun(
  coords: Coords,
  opts: EngineOptions = {},
): Promise<SunTimes | null> {
  try {
    const now = opts.now?.() ?? Date.now();
    const key = `${fmt(coords.lat)},${fmt(coords.lon)}`;

    const last = sunRefreshes.get(key);
    if (last && withinRefreshWindow(now - last.at)) {
      return last.sun && isToday(last.sun, now) ? toSunTimes(last.sun) : null;
    }

    const first = usableSun(await getPoint(coords, opts));
    if (!first || localDay(now, first.zone) === null) return null;
    if (isToday(first, now)) return toSunTimes(first);

    rememberRefresh(key, { at: now, sun: null });
    evictPoint(coords);
    const fresh = usableSun(await getPoint(coords, opts));
    rememberRefresh(key, { at: now, sun: fresh });
    return fresh && isToday(fresh, now) ? toSunTimes(fresh) : null;
  } catch {
    return null;
  }
}

/**
 * The moon at `at` (epoch ms), from the mean synodic month counted from the new
 * moon of 2000-01-06 18:14 UTC. `null` for a non-finite time. Never throws.
 */
export function getMoon(at: number): MoonPhase | null {
  if (!Number.isFinite(at)) return null;
  const age =
    ((((at - REFERENCE_NEW_MOON) % SYNODIC_MONTH_MS) + SYNODIC_MONTH_MS) %
      SYNODIC_MONTH_MS);
  let fraction = age / SYNODIC_MONTH_MS;
  if (fraction >= 1) fraction = 0; // float rounding at the wrap is the new moon
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
  const name = PHASE_NAMES[Math.round(fraction * 8) % 8];
  return { fraction, illumination, name };
}
