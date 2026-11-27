import { type EngineOptions, type Stamp } from "../provenance.js";
import { type Condition } from "../condition.js";
import type { Coords } from "../types.js";
/** One hour of the forecast. Every measurement is `null` when NWS gave none. */
export interface HourReading {
    timestamp: number;
    isDay: boolean;
    temperature: number | null;
    feelsLike: number | null;
    precipProbability: number | null;
    windSpeed: number | null;
    windDirection: string | null;
    windGust: number | null;
    cloudCover: number | null;
    humidity: number | null;
    dewPoint: number | null;
    thunderProbability: number | null;
    visibility: number | null;
    heatStress: number | null;
    condition: Condition | null;
    windy: boolean;
}
/** An amount over one grid interval, in inches. */
export interface AmountBlock {
    start: number;
    end: number;
    inches: number;
}
export interface HourlyResult {
    stamp: Stamp;
    timeZone: string | null;
    hours: HourReading[];
    rain: AmountBlock[];
    snow: AmountBlock[];
    ice: AmountBlock[];
    /**
     * `true` when the grid was merged into the hours. `false` when the grid could
     * not be read for this load: the grid-derived fields (feels-like, gusts,
     * amounts, cloud, humidity, thunder, visibility, heat stress) are then `null`,
     * and the engine asks for the grid again after five minutes.
     */
    gridAvailable: boolean;
}
/** How long an hourly load without its grid is kept before the grid is asked again (B-003). */
export declare const GRID_RETRY_AFTER_MS: number;
/**
 * The hourly forecast for a coordinate, joined with the grid, or `null` when
 * the point is outside coverage or no reading is usable (fresh, stale inside
 * its bound, or last-good in the store). When the point lookup failed, the reading
 * already in memory is returned under the same bound (B-015), else the stored
 * last-good reading: no request, no grid. Never throws.
 */
export declare function getHourly(coords: Coords, opts?: EngineOptions): Promise<HourlyResult | null>;
/** Test hook: clear every cached hourly forecast. */
export declare function clearHourlyCache(): void;
//# sourceMappingURL=hourly.d.ts.map