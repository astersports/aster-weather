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
/**
 * Fetch a URL AND parse its JSON body under ONE abort/timeout budget that spans
 * BOTH the headers read and the body read (WX-R2 — extends WX-P2-16 to `json()`).
 *
 * v0.2.0 (WX-P2-16) armed the abort+race for the headers read, but the body
 * (`res.json()`) then ran in the loader with the timer already cleared — a server
 * that sent headers and stalled the body hung `json()` forever, and because the
 * loader runs inside `WeatherCache`'s in-flight dedup, every concurrent caller for
 * that coordinate hung with it (retry never fired; the attempt never rejected).
 * This helper keeps the single `AbortController` armed and races the WHOLE
 * fetch → ok-check → json chain against one deadline, so the total budget stays
 * `<= timeoutMs` on BOTH paths: a well-behaved impl aborts and frees its socket
 * (on the headers OR the body read), and a misbehaving impl that ignores the
 * signal still can't hang the caller — the race rejects regardless.
 *
 * Internal / un-exported (WX-P2-13). Throws on timeout, HTTP `!ok`, or a parse
 * failure; the caller's shape guard validates the parsed value, and the cache
 * turns any throw into stale-or-empty + a single `onError`.
 */
export declare function fetchJsonWithTimeout(url: string, opts?: FetchOptions): Promise<unknown>;
//# sourceMappingURL=helpers.d.ts.map