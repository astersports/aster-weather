import { type EngineOptions } from "../provenance.js";
import type { Coords } from "../types.js";
export interface Station {
    id: string;
    name: string;
}
/** A station observation. Every measurement is `null` when the station gave none. */
export interface Observation {
    at: number;
    temperatureC: number | null;
    dewpointC: number | null;
    windKmh: number | null;
    windDeg: number | null;
    gustKmh: number | null;
    humidity: number | null;
    pressurePa: number | null;
    visibilityM: number | null;
    precipLastHourMm: number | null;
    windChillC: number | null;
    heatIndexC: number | null;
    cloudBaseM: number | null;
    icon: string | null;
}
/**
 * The observation stations for a coordinate, in the order NWS gives, or `null` when the
 * point is outside coverage or the list could not be read. Never throws. A list
 * that ultimately fails (after the cache's retry) is reported once through
 * `onError` as `getStations`.
 */
export declare function getStations(coords: Coords, opts?: EngineOptions): Promise<Station[] | null>;
/** Test hook: clear every cached station list. */
export declare function clearStationsCache(): void;
/**
 * The latest observation from one station, or `null` when the station answers
 * 404 or the body has no readable timestamp. Throws on any other failure.
 * Not cached.
 */
export declare function getLatestObservation(stationId: string, opts?: EngineOptions): Promise<Observation | null>;
//# sourceMappingURL=observations.d.ts.map