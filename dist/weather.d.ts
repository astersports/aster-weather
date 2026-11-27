/**
 * The one-call report: every part of the engine for one point, in one object.
 * The parts run concurrently and each fails alone (a failed part is `null`).
 * Radar is asked once, here, and applied to the current reading and today's
 * daily cell with the pure functions in `radar.ts`.
 */
import { type AlertsReading, type WeatherAlert } from "./nws/alerts.js";
import { type DailyResult } from "./nws/daily.js";
import { type HourlyResult } from "./nws/hourly.js";
import { type NowReading } from "./now.js";
import { type RadarRain } from "./radar.js";
import { type MoonPhase, type SunTimes } from "./astro.js";
import type { EngineOptions } from "./provenance.js";
import type { Coords } from "./types.js";
export interface WeatherReport {
    place: {
        lat: number;
        lon: number;
        timeZone: string | null;
        city: string | null;
        state: string | null;
    };
    now: NowReading | null;
    hourly: HourlyResult | null;
    daily: DailyResult | null;
    alerts: WeatherAlert[] | null;
    /** The same alerts with when they were fetched and whether they are stale. */
    alertsReading: AlertsReading | null;
    radar: RadarRain | null;
    sun: SunTimes | null;
    moon: MoonPhase | null;
    fetchedAt: number;
}
/**
 * Every part of the engine for a coordinate, or `null` when the point is invalid
 * or outside NWS coverage (404). Those cases make no other request. When the
 * point lookup failed, the report still comes: the place has no time zone, city
 * or state, the sun is `null`, and the forecast parts come from their stores
 * (or `null`). Alerts and radar are asked as usual. Radar is asked once unless
 * `radar: false`. No `onError` of its own; a failing part reports through its own
 * loader, and a failed point lookup reports once through `getPoint`. Never throws.
 */
export declare function getWeather(coords: Coords, opts?: EngineOptions): Promise<WeatherReport | null>;
//# sourceMappingURL=weather.d.ts.map