import { type EngineOptions, type Stamp } from "./provenance.js";
import { type Condition } from "./condition.js";
import type { Coords } from "./types.js";
/** The longest age an observation may have and still be the current reading. */
export declare const MAX_OBSERVATION_AGE_MS: number;
export interface NowReading {
    stamp: Stamp;
    station: {
        id: string;
        name: string;
    } | null;
    temperature: number | null;
    feelsLike: number | null;
    dewPoint: number | null;
    humidity: number | null;
    windSpeed: number | null;
    windDirection: number | null;
    windGust: number | null;
    pressure: number | null;
    visibility: number | null;
    cloudBase: number | null;
    precipLastHour: number | null;
    condition: Condition | null;
    windy: boolean;
    isDay: boolean | null;
    rainSource?: "radar";
    radarAt?: number | null;
}
/**
 * Current conditions for a coordinate: a measured station reading when one is
 * fresh enough, else the official forecast hour containing now. `null` when the
 * point is outside NWS coverage (no `onError`), or no reading is usable (fresh,
 * stale inside its bound, or last-good in the store). When the point lookup
 * failed, the reading already in memory is returned under the same bound (B-015),
 * else the stored last-good observed reading: no request, and no radar claim.
 * Never throws.
 */
export declare function getNow(coords: Coords, opts?: EngineOptions): Promise<NowReading | null>;
/** Test hook: clear every cached current reading. */
export declare function clearNowCache(): void;
//# sourceMappingURL=now.d.ts.map