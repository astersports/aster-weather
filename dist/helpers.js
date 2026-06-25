/**
 * Internal helpers shared across the fetch modules.
 */
import { FETCH_TIMEOUT_MS } from "./types.js";
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
    const ampm = hours >= 12 ? "PM" : "AM";
    const h = hours % 12 || 12;
    return minutes === 0
        ? `${h} ${ampm}`
        : `${h}:${minutes.toString().padStart(2, "0")} ${ampm}`;
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
export async function fetchWithTimeout(url, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
    if (opts.fetchImpl) {
        // Injected impl owns SSRF semantics; we still enforce the timeout by
        // racing it (its signature carries no AbortSignal to cancel with).
        let timeoutId;
        const timeout = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(`fetch timed out after ${timeoutMs}ms`)), timeoutMs);
        });
        try {
            return await Promise.race([opts.fetchImpl(url), timeout]);
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    const globalFetch = typeof fetch !== "undefined" ? fetch : undefined;
    if (!globalFetch) {
        throw new Error("No fetch implementation available");
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        // Cast: global fetch accepts a second init arg; FetchImpl is the
        // narrowed shape we depend on.
        return await fetch(url, { signal: controller.signal });
    }
    finally {
        clearTimeout(timeoutId);
    }
}
//# sourceMappingURL=helpers.js.map