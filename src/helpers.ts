/**
 * Internal helpers shared across the fetch modules.
 */

import { FETCH_TIMEOUT_MS, type FetchImpl, type FetchOptions } from "./types.js";

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
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  return minutes === 0
    ? `${h} ${ampm}`
    : `${h}:${minutes.toString().padStart(2, "0")} ${ampm}`;
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

interface MinimalResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/**
 * Fetch with an abort timeout. Uses the injected `fetchImpl` when provided
 * (SSRF boundary / test stub); otherwise the global `fetch` with an
 * AbortController. From St. Patrick `fetchWithTimeout`, generalized to accept
 * an injected implementation.
 */
export async function fetchWithTimeout(
  url: string,
  opts: FetchOptions = {},
): Promise<MinimalResponse> {
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;

  if (opts.fetchImpl) {
    // Injected impl owns its own timeout/SSRF semantics.
    return opts.fetchImpl(url);
  }

  const globalFetch: FetchImpl | undefined =
    typeof fetch !== "undefined" ? (fetch as unknown as FetchImpl) : undefined;
  if (!globalFetch) {
    throw new Error("No fetch implementation available");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Cast: global fetch accepts a second init arg; FetchImpl is the
    // narrowed shape we depend on.
    return await (fetch as unknown as (
      u: string,
      init: { signal: AbortSignal },
    ) => Promise<MinimalResponse>)(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
