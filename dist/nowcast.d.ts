/**
 * 15-minute precipitation nowcast (WX-P2-3) — "will it rain during the next
 * couple hours of the game?". Sourced from Open-Meteo `minutely_15` on the
 * same `/v1/forecast` endpoint (no separate endpoint), so it costs one extra
 * request. `precipitation_probability` is NOT valid at 15-min resolution, so
 * this carries precipitation AMOUNT + gusts, not a probability.
 *
 * Per-coord cached for 10 min (shorter than hourly — nowcast is the freshest
 * signal), with in-flight dedup + stale-on-error, via the shared cache.
 */
import { type Coords, type FetchOptions, type NowcastPoint } from "./types.js";
/**
 * Fetch the next ~2 hours of 15-minute precipitation/gust nowcast for a
 * coordinate. Returns `[]` on invalid coords or failure (never throws, never
 * fabricates); falls back to stale cache when available.
 */
export declare function getNowcast(coords: Coords, opts?: FetchOptions): Promise<NowcastPoint[]>;
/** Clear the nowcast cache (test hook / sign-out hygiene). */
export declare function clearNowcastCache(): void;
//# sourceMappingURL=nowcast.d.ts.map