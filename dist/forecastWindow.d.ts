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
export declare function isWithinForecastWindow(isoTime: string | number | Date, nowMs?: number, days?: number): boolean;
//# sourceMappingURL=forecastWindow.d.ts.map