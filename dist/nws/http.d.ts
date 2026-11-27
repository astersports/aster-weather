import type { EngineOptions } from "../provenance.js";
export declare const NWS_API = "https://api.weather.gov";
export declare const NOAA_MAPS = "https://mapservices.weather.noaa.gov";
/**
 * GET a GeoJSON resource from a fixed NWS host. Resolves `null` on HTTP 404,
 * the parsed body on 2xx, and rejects with `Error("HTTP <status>")` otherwise.
 * Rejects before any request when the URL's origin is not one of the fixed hosts.
 */
export declare function nwsJson(url: string, opts?: EngineOptions): Promise<unknown | null>;
//# sourceMappingURL=http.d.ts.map