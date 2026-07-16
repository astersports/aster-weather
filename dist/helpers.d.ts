/**
 * Internal helpers shared across the fetch modules.
 */
import { type FetchOptions, type WeatherCall } from "./types.js";
import type { CacheBehavior } from "./cache.js";
/**
 * The resilience profile every loader's cache runs with (v0.5.0): one retry
 * (M5) + stale-while-revalidate (M6). Shared so all four loaders stay identical.
 */
export declare const RESILIENT_CACHE: CacheBehavior;
/**
 * Bind a loader's `{ call, lat, lon }` context onto the consumer's `onError`
 * hook (M1). Returns `undefined` when no hook was supplied, so the cache stays
 * zero-overhead and the never-throw path is byte-for-byte unchanged for the
 * (default) no-hook case.
 */
export declare function bindOnError(opts: FetchOptions, call: WeatherCall, lat: number, lon: number): ((err: unknown) => void) | undefined;
/**
 * Parse an Open-Meteo local time string ("2026-06-17T05:21") into a friendly
 * clock label ("5:21 AM") WITHOUT going through `new Date()` — Open-Meteo
 * returns these already in the requested timezone, so re-parsing would apply
 * the host timezone. Used for sunrise/sunset only (hourly uses unixtime).
 * From St. Patrick `parseOpenMeteoLocalTime`.
 */
export declare function parseOpenMeteoLocalTime(isoTime: string): string;
/**
 * Convert an Open-Meteo venue-local ISO string ("2026-06-17T15:45", no zone)
 * to an absolute epoch-ms using the response's `utc_offset_seconds` — the
 * inverse of the `stripLabel` shift, so it stays free of the host-timezone bug.
 * Used for the current-conditions "observed at" time (WX-P2-5). Returns null
 * on a malformed input.
 */
export declare function localIsoToEpoch(isoTime: string | null | undefined, utcOffsetSeconds: number): number | null;
/** Round to 3 decimals (~110 m) so nearby callers share a cache entry. */
export declare function coordKey(lat: number, lon: number): string;
/** Coordinate sanity check. Merged from astersports-web `isValidCoord`. */
export declare function isValidCoord(lat: number, lon: number): boolean;
/**
 * Map an Open-Meteo reading to `number | null` — a missing/`null`/non-finite
 * value stays `null` ("unknown"), never a fabricated `0` (WX-P1-1). Use
 * {@link roundOrNull} for temps/wind, {@link numOrNull} for probabilities/amounts.
 */
export declare function numOrNull(v: number | null | undefined): number | null;
export declare function roundOrNull(v: number | null | undefined): number | null;
interface MinimalResponse {
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
}
/**
 * Fetch with an abort timeout. Uses the injected `fetchImpl` when provided
 * (SSRF boundary / test stub); otherwise the global `fetch`. From St. Patrick
 * `fetchWithTimeout`, generalized to accept an injected implementation.
 *
 * v0.2.0 (WX-P2-16): a single `AbortController` drives BOTH paths, and the
 * injected `fetchImpl` now receives `{ signal }` — so on timeout the underlying
 * request is actually aborted (no more leaked socket per timed-out injected
 * call). We ALSO race against the timeout: a well-behaved impl aborts and frees
 * its socket, while a misbehaving impl that ignores the signal still can't hang
 * the caller — the race rejects regardless. Best of both.
 */
export declare function fetchWithTimeout(url: string, opts?: FetchOptions): Promise<MinimalResponse>;
export {};
//# sourceMappingURL=helpers.d.ts.map