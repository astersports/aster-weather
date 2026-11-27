/**
 * The one-call report: every part of the engine for one point, in one object.
 * The parts run concurrently and each fails alone (a failed part is `null`).
 * Radar is asked once, here, and applied to the current reading and today's
 * daily cell with the pure functions in `radar.ts`.
 */
import { getAlerts, type WeatherAlert } from "./nws/alerts.js";
import { getDaily, type DailyResult } from "./nws/daily.js";
import { getHourly, type HourlyResult } from "./nws/hourly.js";
import { getPoint } from "./nws/point.js";
import { getNow, type NowReading } from "./now.js";
import { getRadarRain, applyRadarToNow, applyRadarToToday, type RadarRain } from "./radar.js";
import { getMoon, getSun, type MoonPhase, type SunTimes } from "./astro.js";
import { localDay } from "./localDay.js";
import type { EngineOptions } from "./provenance.js";
import type { Coords } from "./types.js";

export interface WeatherReport {
  place: { lat: number; lon: number; timeZone: string | null; city: string | null; state: string | null };
  now: NowReading | null;
  hourly: HourlyResult | null;
  daily: DailyResult | null;
  alerts: WeatherAlert[] | null;
  radar: RadarRain | null;
  sun: SunTimes | null;
  moon: MoonPhase | null;
  fetchedAt: number;
}

/** A part's answer, or `null` when it throws: one part never rejects the report. */
async function part<T>(load: () => Promise<T | null>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

/**
 * Every part of the engine for a coordinate, or `null` when the point is invalid,
 * outside NWS coverage (404), or its lookup failed. In those cases no other request
 * is made. Radar is asked once unless `radar: false`. No `onError` of its own; a
 * failing part reports through its own loader. Never throws.
 */
export async function getWeather(
  coords: Coords,
  opts: EngineOptions = {},
): Promise<WeatherReport | null> {
  const nowMs = opts.now?.() ?? Date.now();
  const point = await part(() => getPoint(coords, opts));
  if (!point) return null;

  // Each part is asked without radar, so the radar is asked only here, once.
  const partOpts: EngineOptions = { ...opts, radar: false };
  const wantRadar = opts.radar !== false;

  const [now, hourly, daily, alerts, sun, radar] = await Promise.all([
    part(() => getNow(coords, partOpts)),
    part(() => getHourly(coords, partOpts)),
    part(() => getDaily(coords, partOpts)),
    part(() => getAlerts(coords, partOpts)),
    part(() => getSun(coords, partOpts)),
    wantRadar ? part(() => getRadarRain(coords, opts)) : Promise.resolve(null),
  ]);

  const today = point.timeZone === null ? null : localDay(nowMs, point.timeZone);

  return {
    place: {
      lat: coords.lat,
      lon: coords.lon,
      timeZone: point.timeZone,
      city: point.city,
      state: point.state,
    },
    now: now && radar ? applyRadarToNow(now, radar) : now,
    hourly,
    daily:
      daily && radar && today !== null
        ? { ...daily, days: applyRadarToToday(daily.days, radar, today) }
        : daily,
    alerts,
    radar,
    sun,
    moon: getMoon(nowMs),
    fetchedAt: nowMs,
  };
}
