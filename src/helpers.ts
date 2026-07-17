/**
 * Internal helpers shared across the fetch modules.
 */

import {
  FETCH_TIMEOUT_MS,
  FETCH_RETRY_COUNT,
  FETCH_RETRY_BACKOFF_MS,
  type FetchImpl,
  type FetchOptions,
  type WeatherCall,
} from "./types.js";
import type { CacheBehavior } from "./cache.js";

/**
 * The resilience profile every loader's cache runs with (v0.5.0): one retry
 * (M5) + stale-while-revalidate (M6). Shared so all four loaders stay identical.
 */
export const RESILIENT_CACHE: CacheBehavior = {
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
export function bindOnError(
  opts: FetchOptions,
  call: WeatherCall,
  lat: number,
  lon: number,
): ((err: unknown) => void) | undefined {
  const hook = opts.onError;
  return hook ? (err: unknown) => hook(err, { call, lat, lon }) : undefined;
}

/**
 * Parse an Open-Meteo local time string ("2026-06-17T05:21") into a friendly
 * clock label ("5:21 AM") WITHOUT going through `new Date()` — Open-Meteo
 * returns these already in the requested timezone, so re-parsing would apply
 * the host timezone. Used for sunrise/sunset only (hourly uses unixtime).
 * From St. Patrick `parseOpenMeteoLocalTime`.
 */
export function parseOpenMeteoLocalTime(isoTime: string): string {
  const [, timePart] = isoTime.split("T");
  if (!timePart) return isoTime;
  const [hourStr, minuteStr] = timePart.split(":");
  const hours = parseInt(hourStr, 10);
  const minutes = parseInt(minuteStr, 10);
  if (!Number.isFinite(hours)) return isoTime;
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  // WX-P3-6: a time string with no minutes ("T05") must not render "5:NaN AM".
  if (!Number.isFinite(minutes) || minutes === 0) return `${h} ${ampm}`;
  return `${h}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * Convert an Open-Meteo venue-local ISO string ("2026-06-17T15:45", no zone)
 * to an absolute epoch-ms using the response's `utc_offset_seconds` — the
 * inverse of the `stripLabel` shift, so it stays free of the host-timezone bug.
 * Used for the current-conditions "observed at" time (WX-P2-5). Returns null
 * on a malformed input.
 */
export function localIsoToEpoch(
  isoTime: string | null | undefined,
  utcOffsetSeconds: number,
): number | null {
  if (!isoTime) return null;
  // Parse the naive local string as if it were UTC, then shift back by the
  // venue offset: true_utc = local - offset.
  const asIfUtc = Date.parse(`${isoTime}Z`);
  if (Number.isNaN(asIfUtc)) return null;
  return asIfUtc - utcOffsetSeconds * 1000;
}

/** Round to 3 decimals (~110 m) so nearby callers share a cache entry. */
export function coordKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

/** Coordinate sanity check. Merged from astersports-web `isValidCoord`. */
export function isValidCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Map an Open-Meteo reading to `number | null` — a missing/`null`/non-finite
 * value stays `null` ("unknown"), never a fabricated `0` (WX-P1-1). Use
 * {@link roundOrNull} for temps/wind, {@link numOrNull} for probabilities/amounts.
 */
export function numOrNull(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
export function roundOrNull(v: number | null | undefined): number | null {
  const n = numOrNull(v);
  return n === null ? null : Math.round(n);
}

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
export async function fetchJsonWithTimeout(
  url: string,
  opts: FetchOptions = {},
): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort(); // free a well-behaved impl's socket (headers OR body)
      reject(new Error(`fetch timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  // Injected impl owns SSRF semantics; it gets the signal so a timeout aborts its
  // in-flight request. The race guarantees the caller settles even if the impl
  // ignores the signal — on the headers read AND the body read.
  const fetchAndParse = async (): Promise<unknown> => {
    const impl: FetchImpl | undefined =
      opts.fetchImpl ??
      (typeof fetch !== "undefined"
        ? (fetch as unknown as FetchImpl)
        : undefined);
    if (!impl) throw new Error("No fetch implementation available");
    const res = await impl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // The body read is INSIDE the race now — a stalled body can't outlive the deadline.
    return await res.json();
  };

  try {
    return await Promise.race([fetchAndParse(), timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
}
