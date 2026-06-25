/**
 * Internal helpers shared across the fetch modules.
 */
import { type FetchOptions } from "./types.js";
/**
 * Parse an Open-Meteo local time string ("2026-06-17T05:21") into a friendly
 * clock label ("5:21 AM") WITHOUT going through `new Date()` — Open-Meteo
 * returns these already in the requested timezone, so re-parsing would apply
 * the host timezone. Used for sunrise/sunset only (hourly uses unixtime).
 * From St. Patrick `parseOpenMeteoLocalTime`.
 */
export declare function parseOpenMeteoLocalTime(isoTime: string): string;
/** Round to 3 decimals (~110 m) so nearby callers share a cache entry. */
export declare function coordKey(lat: number, lon: number): string;
/** Coordinate sanity check. Merged from astersports-web `isValidCoord`. */
export declare function isValidCoord(lat: number, lon: number): boolean;
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
 * The timeout is enforced on BOTH paths: the injected `fetchImpl` is raced
 * against the same `timeoutMs` so a slow/hung consumer fetch can't stall a
 * forecast call indefinitely. The injected impl's signature
 * (`(url) => Promise<...>`) takes no AbortSignal, so we can't abort its
 * in-flight request — but the race ensures the caller's promise still rejects
 * with a timeout, matching the global-fetch path's behavior.
 */
export declare function fetchWithTimeout(url: string, opts?: FetchOptions): Promise<MinimalResponse>;
export {};
//# sourceMappingURL=helpers.d.ts.map