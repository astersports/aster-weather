/**
 * The weather for one event: the forecast hour nearest the event's start, the
 * four-hour strip around it, and the two warning flags. Built on `getHourly`
 * only. Warning thresholds match the Open-Meteo `getWeatherForEvent`; a `null`
 * value never raises a flag. Never throws.
 */
import { getHourly, type HourReading } from "./nws/hourly.js";
import type { EngineOptions, Stamp } from "./provenance.js";
import {
  MAX_FORECAST_HOUR_GAP_MS,
  SEVERE_GUST_MPH,
  SEVERE_WIND_MPH,
  type Coords,
} from "./types.js";

export interface EventReading {
  hour: HourReading;
  strip: HourReading[];
  isRainWarning: boolean;
  isSevereWarning: boolean;
  stamp: Stamp;
}

const HOUR_MS = 3_600_000;

/** An event start as epoch ms, or NaN when it is not a usable time. */
function toMs(v: string | number | Date): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") return Date.parse(v);
  return v;
}

/** The hour nearest `t`, the earlier one on a tie; null when none is within the gap bound. */
function nearestHour(hours: HourReading[], t: number): HourReading | null {
  let best: HourReading | null = null;
  let bestGap = Infinity;
  for (const h of hours) {
    const gap = Math.abs(h.timestamp - t);
    if (gap < bestGap || (gap === bestGap && best !== null && h.timestamp < best.timestamp)) {
      best = h;
      bestGap = gap;
    }
  }
  return best !== null && bestGap <= MAX_FORECAST_HOUR_GAP_MS ? best : null;
}

/**
 * The forecast for an event starting at `eventStart` (an ISO string, epoch ms or
 * a Date), or `null` when the time is unusable (no request made), the point is
 * outside coverage, the forecast is unavailable, or no forecast hour is within
 * six hours of the start.
 */
export async function getEventWeather(
  coords: Coords,
  eventStart: string | number | Date,
  opts: EngineOptions = {},
): Promise<EventReading | null> {
  const t = toMs(eventStart);
  if (!Number.isFinite(t)) return null;

  let forecast;
  try {
    forecast = await getHourly(coords, opts);
  } catch {
    return null;
  }
  if (!forecast) return null;

  const hour = nearestHour(forecast.hours, t);
  if (!hour) return null;

  const strip = forecast.hours
    .filter((h) => h.timestamp >= t - 2 * HOUR_MS && h.timestamp <= t + 4 * HOUR_MS)
    .slice(0, 4);

  const rain = hour.precipProbability;
  const temp = hour.temperature;
  const wind = hour.windSpeed;
  const gust = hour.windGust;

  return {
    hour,
    strip,
    isRainWarning: rain !== null && rain > 40,
    isSevereWarning:
      (rain !== null && rain > 70) ||
      (temp !== null && (temp < 20 || temp > 100)) ||
      (wind !== null && wind > SEVERE_WIND_MPH) ||
      (gust !== null && gust > SEVERE_GUST_MPH),
    stamp: forecast.stamp,
  };
}
