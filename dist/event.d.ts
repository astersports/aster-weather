/**
 * The weather for one event: the forecast hour nearest the event's start, the
 * four-hour strip around it, and the two warning flags. Built on `getHourly`
 * only. Warning thresholds match the Open-Meteo `getWeatherForEvent`; a `null`
 * value never raises a flag. Never throws.
 */
import { type HourReading } from "./nws/hourly.js";
import type { EngineOptions, Stamp } from "./provenance.js";
import { type Coords } from "./types.js";
export interface EventReading {
    hour: HourReading;
    strip: HourReading[];
    isRainWarning: boolean;
    isSevereWarning: boolean;
    stamp: Stamp;
}
/**
 * The forecast for an event starting at `eventStart` (an ISO string, epoch ms or
 * a Date), or `null` when the time is unusable (no request made), the event is
 * more than 7 days ahead or more than 1 day past (no request made), the point is
 * outside coverage, the forecast is unavailable, or no forecast hour is within
 * six hours of the start.
 */
export declare function getEventWeather(coords: Coords, eventStart: string | number | Date, opts?: EngineOptions): Promise<EventReading | null>;
//# sourceMappingURL=event.d.ts.map