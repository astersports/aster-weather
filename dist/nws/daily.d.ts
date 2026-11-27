import { type EngineOptions, type Stamp } from "../provenance.js";
import { type Condition } from "../condition.js";
import type { Coords } from "../types.js";
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
/**
 * The seven-day forecast for a coordinate, one reading per date, or `null`
 * when the point is outside coverage or no reading is usable (fresh, stale
 * inside its bound, or last-good in the store). Never throws.
 */
export declare function getDaily(coords: Coords, opts?: EngineOptions): Promise<DailyResult | null>;
/** Test hook: clear every cached daily forecast. */
export declare function clearDailyCache(): void;
//# sourceMappingURL=daily.d.ts.map