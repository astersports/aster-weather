/**
 * The one NWS transport. Hosts are constants: a caller can never supply one.
 * 404 is a normal answer (`null`); any other failure throws, and the cache
 * turns the throw into stale-or-empty plus one `onError`.
 */
import { fetchJsonStatus } from "../helpers.js";
import type { EngineOptions } from "../provenance.js";

export const NWS_API = "https://api.weather.gov";
export const NOAA_MAPS = "https://mapservices.weather.noaa.gov";

const ALLOWED_ORIGINS: readonly string[] = [NWS_API, NOAA_MAPS];

/**
 * GET a GeoJSON resource from a fixed NWS host. Resolves `null` on HTTP 404,
 * the parsed body on 2xx, and rejects with `Error("HTTP <status>")` otherwise.
 * Rejects before any request when the URL's origin is not one of the fixed hosts.
 */
export async function nwsJson(
  url: string,
  opts: EngineOptions = {},
): Promise<unknown | null> {
  const origin = new URL(url).origin;
  if (!ALLOWED_ORIGINS.includes(origin)) {
    throw new Error(`refused host: ${origin}`);
  }
  const headers: Record<string, string> = { Accept: "application/geo+json" };
  if (typeof opts.userAgent === "string" && opts.userAgent.length > 0) {
    headers["User-Agent"] = opts.userAgent;
  }
  const { status, body } = await fetchJsonStatus(url, {
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.timeoutMs,
    headers,
  });
  if (status === 404) return null;
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
  return body;
}
