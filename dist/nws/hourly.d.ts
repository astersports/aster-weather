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
}
/**
 * The hourly forecast for a coordinate, joined with the grid, or `null` when
 * the point is outside coverage or no reading is usable (fresh, stale inside
 * its bound, or last-good in the store). Never throws.
 */
export declare function getHourly(coords: Coords, opts?: EngineOptions): Promise<HourlyResult | null>;
/** Test hook: clear every cached hourly forecast. */
export declare function clearHourlyCache(): void;
//# sourceMappingURL=hourly.d.ts.map