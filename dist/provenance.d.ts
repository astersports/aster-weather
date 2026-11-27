/**
 * Provenance vocabulary for the NWS engine: what a reading is, how old it may
 * be, and how long a cached value stays fresh.
 */
import type { FetchOptions } from "./types.js";
import type { WeatherStore } from "./store.js";
/** `observed` = a station measurement; `forecast` = the official model forecast. */
export type ReadingKind = "observed" | "forecast";
/** What a station reading, a forecast or an event reading carries, so a consumer can label it. */
export interface Stamp {
    kind: ReadingKind;
    /**
     * Epoch ms. For a current reading: the observation time, or the start of the
     * forecast hour. For an hourly or daily result, and the event reading built on
     * one: the time NWS issued the forecast, or the time it was read when NWS gives none.
     */
    at: number;
    /** Epoch ms the engine fetched it. */
    fetchedAt: number;
    /**
     * True whenever the reading is served past its freshness window, whether it
     * comes from memory or from the last-good store. A reading inside its window is false.
     */
    stale: boolean;
    source: "nws-station" | "nws-forecast";
}
/** Longest a reading may be served at all, per kind of reading. */
export declare const MAX_AGE_MS: {
    readonly now: number;
    readonly hourly: number;
    readonly daily: number;
    readonly radar: number;
};
/** How long a fetched value is considered fresh (no refetch inside it). */
export declare const FRESH_MS: {
    readonly now: number;
    readonly hourly: number;
    readonly daily: number;
    readonly alerts: number;
    readonly radar: number;
    readonly point: number;
};
/** Shared option type, used by every fetcher. */
export interface EngineOptions extends FetchOptions {
    userAgent?: string;
    store?: WeatherStore;
    now?: () => number;
    /**
     * `getNow` and `getDaily` ask the radar only when this is `true` (default off).
     * `getWeather` asks it unless this is `false`.
     */
    radar?: boolean;
}
//# sourceMappingURL=provenance.d.ts.map