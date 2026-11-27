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
/** What a lookup of one coordinate reports. */
export type PointLookup = {
    status: "ok";
    point: NwsPoint;
} | {
    status: "outside";
} | {
    status: "failed";
};
/** After a failed lookup, a coordinate is not asked again for this long. */
export declare const POINT_RETRY_AFTER_MS = 30000;
/**
 * The NWS point for a coordinate, with the reason it is missing told apart.
 * `outside`: invalid coordinates, or a 404 (no `onError`, cached as a normal
 * answer). `failed`: the lookup could not be read; `onError` fires once, the
 * coordinate is held for `POINT_RETRY_AFTER_MS` with no request, and a stored
 * point the cache still holds comes back as `ok`. Never throws.
 */
export declare function lookupPoint(coords: Coords, opts?: EngineOptions): Promise<PointLookup>;
/**
 * The NWS point for a coordinate, or `null` when the point is invalid, outside
 * NWS coverage (404), or the lookup failed. Never throws. Use `lookupPoint`
 * when the difference matters.
 */
export declare function getPoint(coords: Coords, opts?: EngineOptions): Promise<NwsPoint | null>;
/** Drop one coordinate's cached point so the next call looks it up afresh. A hold stays. */
export declare function evictPoint(coords: Coords): void;
/** Test hook: clear every cached point and every hold. */
export declare function clearPointCache(): void;
//# sourceMappingURL=point.d.ts.map