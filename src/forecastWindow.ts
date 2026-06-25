/**
 * "Is this event near enough to bother surfacing weather?" — one pure,
 * testable predicate. Merged verbatim (behavior) from aster-sports
 * `isWithinForecastWindow`.
 *
 * True when `isoTime` is in [now, now + days]; false for past times, beyond
 * the window, or an invalid date. No IO. The hourly indicator still
 * self-limits to its ~7-day Open-Meteo coverage regardless — this just bounds
 * WHEN we surface weather UX (and gates any daily rain banner).
 */

import { DEFAULT_FORECAST_WINDOW_DAYS } from "./types.js";

export function isWithinForecastWindow(
  isoTime: string | number | Date,
  nowMs: number = Date.now(),
  days: number = DEFAULT_FORECAST_WINDOW_DAYS,
): boolean {
  const t = new Date(isoTime).getTime();
  if (Number.isNaN(t)) return false;
  return t >= nowMs && t <= nowMs + days * 24 * 60 * 60 * 1000;
}
