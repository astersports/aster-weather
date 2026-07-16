/**
 * Org-agnostic coordinate resolution. Merged from aster-sports
 * `weatherLocationFrom` + `coordsForEvent` — the seam that closes the
 * hardcoded-Westchester default (AP #7): the source is real event locations,
 * with an explicit org-default fallback rather than a constant baked into the
 * engine (St. Patrick baked ARMONK_LAT/LON straight into every call).
 *
 * Pure. No app constants.
 */
import type { Coords } from "./types.js";
export interface WeatherLocation {
    lat: number | null | undefined;
    lon: number | null | undefined;
    address?: string | null;
    name?: string | null;
}
export interface WeatherAnchor extends Coords {
    city: string | null;
}
/**
 * Pick the forecast anchor: the first event (already sorted by the caller)
 * whose location carries lat/lon. Returns `{ lat, lon, city }` or null.
 */
export declare function weatherLocationFrom(events: Array<{
    location_id?: string | number | null;
}> | null | undefined, locations: Record<string | number, WeatherLocation> | null | undefined): WeatherAnchor | null;
/**
 * Resolve the weather-anchor coords for a set of events. Returns the first
 * event-location carrying lat/lon, else `orgDefault`. Returns a `Coords`
 * object so it feeds `fetchForecast`/`getCurrentWeather`/`getDailyForecast`
 * directly (WX-P2-14) — those take `Coords`, not a tuple.
 */
export declare function coordsForEvent(events: Array<{
    location_id?: string | number | null;
}> | null | undefined, locations: Record<string | number, WeatherLocation> | null | undefined, orgDefault: Coords): Coords;
//# sourceMappingURL=coordsForEvent.d.ts.map