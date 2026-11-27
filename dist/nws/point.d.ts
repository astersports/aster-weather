import { type EngineOptions } from "../provenance.js";
import type { Coords } from "../types.js";
export interface NwsPoint {
    forecast: string;
    forecastHourly: string;
    forecastGridData: string;
    observationStations: string;
    timeZone: string | null;
    city: string | null;
    state: string | null;
    radarStation: string | null;
    sun: {
        sunrise: number;
        sunset: number;
        firstLight: number | null;
        lastLight: number | null;
    } | null;
}
/**
 * The NWS point for a coordinate, or `null` when the point is invalid, outside
 * NWS coverage (404), or the lookup failed. Never throws.
 */
export declare function getPoint(coords: Coords, opts?: EngineOptions): Promise<NwsPoint | null>;
/** Drop one coordinate's cached point so the next call looks it up afresh. */
export declare function evictPoint(coords: Coords): void;
/** Test hook: clear every cached point. */
export declare function clearPointCache(): void;
//# sourceMappingURL=point.d.ts.map