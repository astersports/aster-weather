/**
 * Internal helpers shared across the fetch modules.
 */
import { FETCH_TIMEOUT_MS, FETCH_RETRY_COUNT, FETCH_RETRY_BACKOFF_MS, } from "./types.js";
/**
 * The resilience profile every loader's cache runs with (v0.5.0): one retry
 * (M5) + stale-while-revalidate (M6). Shared so all four loaders stay identical.
 */
export const RESILIENT_CACHE = {
    retries: FETCH_RETRY_COUNT,
    retryBackoffMs: FETCH_RETRY_BACKOFF_MS,
    swr: true,
};
/**
 * Bind a loader's `{ call, lat, lon }` context onto the consumer's `onError`
 * hook (M1). Returns `undefined` when no hook was supplied, so the cache stays
 * zero-overhead and the never-throw path is byte-for-byte unchanged for the
 * (default) no-hook case.
 */
export function bindOnError(opts, call, lat, lon) {
    const hook = opts.onError;
    return hook ? (err) => hook(err, { call, lat, lon }) : undefined;
}
/**
 * Parse an Open-Meteo local time string ("2026-06-17T05:21") into a friendly
 * clock label ("5:21 AM") WITHOUT going through `new Date()` — Open-Meteo
 * returns these already in the requested timezone, so re-parsing would apply
 * the host timezone. Used for sunrise/sunset only (hourly uses unixtime).
 * From St. Patrick `parseOpenMeteoLocalTime`.
 */
export function parseOpenMeteoLocalTime(isoTime) {
    const [, timePart] = isoTime.split("T");
    if (!timePart)
        return isoTime;
    const [hourStr, minuteStr] = timePart.split(":");
    const hours = parseInt(hourStr, 10);
    const minutes = parseInt(minuteStr, 10);
    if (!Number.isFinite(hours))
        return isoTime;
    const ampm = hours >= 12 ? "PM" : "AM";
    const h = hours % 12 || 12;
    // WX-P3-6: a time string with no minutes ("T05") must not render "5:NaN AM".
    if (!Number.isFinite(minutes) || minutes === 0)
        return `${h} ${ampm}`;
    return `${h}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}
/**
 * Convert an Open-Meteo venue-local ISO string ("2026-06-17T15:45", no zone)
 * to an absolute epoch-ms using the response's `utc_offset_seconds` — the
 * inverse of the `stripLabel` shift, so it stays free of the host-timezone bug.
 * Used for the current-conditions "observed at" time (WX-P2-5). Returns null
 * on a malformed input.
 */
export function localIsoToEpoch(isoTime, utcOffsetSeconds) {
    if (!isoTime)
        return null;
    // Parse the naive local string as if it were UTC, then shift back by the
    // venue offset: true_utc = local - offset.
    const asIfUtc = Date.parse(`${isoTime}Z`);
    if (Number.isNaN(asIfUtc))
        return null;
    return asIfUtc - utcOffsetSeconds * 1000;
}
/** Round to 3 decimals (~110 m) so nearby callers share a cache entry. */
export function coordKey(lat, lon) {
    return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}
/** Coordinate sanity check. Merged from astersports-web `isValidCoord`. */
export function isValidCoord(lat, lon) {
    return (Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        lat >= -90 &&
        lat <= 90 &&
        lon >= -180 &&
        lon <= 180);
}
/**
 * Map an Open-Meteo reading to `number | null` — a missing/`null`/non-finite
 * value stays `null` ("unknown"), never a fabricated `0` (WX-P1-1). Use
 * {@link roundOrNull} for temps/wind, {@link numOrNull} for probabilities/amounts.
 */
export function numOrNull(v) {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}
export function roundOrNull(v) {
    const n = numOrNull(v);
    return n === null ? null : Math.round(n);
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
export async function fetchWithTimeout(url, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
    const controller = new AbortController();
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            controller.abort(); // free a well-behaved impl's socket
            reject(new Error(`fetch timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });
    try {
        if (opts.fetchImpl) {
            // Injected impl owns SSRF semantics; it gets the signal so a timeout
            // aborts its in-flight request. The race guarantees the caller settles
            // even if the impl ignores the signal.
            return await Promise.race([
                opts.fetchImpl(url, { signal: controller.signal }),
                timeout,
            ]);
        }
        const globalFetch = typeof fetch !== "undefined" ? fetch : undefined;
        if (!globalFetch) {
            throw new Error("No fetch implementation available");
        }
        return await Promise.race([
            fetch(url, { signal: controller.signal }),
            timeout,
        ]);
    }
    finally {
        clearTimeout(timeoutId);
    }
}
//# sourceMappingURL=helpers.js.map