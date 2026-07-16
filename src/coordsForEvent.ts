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
 * Derive a display city from a free-text address (WX-P2-6). Addresses come in
 * two common shapes: "Street, City, State[, ...]" (city is the 2nd segment)
 * and "City, State" (city is the 1st segment). The old heuristic always took
 * the 2nd segment, so "Armonk, NY" resolved to the STATE. Empty segments (a
 * trailing comma) are dropped so they can't win, falling through to `name`.
 */
function cityFromAddress(
  address: string | null | undefined,
  name: string | null | undefined,
): string | null {
  const segs = address
    ? String(address)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (segs.length >= 3) return segs[1]; // "street, city, state" → city
  if (segs.length >= 1) return segs[0]; // "city, state" / single → first
  return name || null;
}

/**
 * Pick the forecast anchor: the first event (already sorted by the caller)
 * whose location carries lat/lon. Returns `{ lat, lon, city }` or null.
 */
export function weatherLocationFrom(
  events: Array<{ location_id?: string | number | null }> | null | undefined,
  locations: Record<string | number, WeatherLocation> | null | undefined,
): WeatherAnchor | null {
  if (!events || !locations) return null;
  for (const ev of events) {
    if (ev.location_id == null) continue;
    const loc = locations[ev.location_id];
    if (loc && loc.lat != null && loc.lon != null) {
      // Narrow to non-null so the WeatherAnchor (`lat: number`) is honest —
      // the guard above already proved both are present at runtime.
      const lat: number = loc.lat;
      const lon: number = loc.lon;
      return { lat, lon, city: cityFromAddress(loc.address, loc.name) };
    }
  }
  return null;
}

/**
 * Resolve the weather-anchor coords for a set of events. Returns the first
 * event-location carrying lat/lon, else `orgDefault`. Returns a `Coords`
 * object so it feeds `fetchForecast`/`getCurrentWeather`/`getDailyForecast`
 * directly (WX-P2-14) — those take `Coords`, not a tuple.
 */
export function coordsForEvent(
  events: Array<{ location_id?: string | number | null }> | null | undefined,
  locations: Record<string | number, WeatherLocation> | null | undefined,
  orgDefault: Coords,
): Coords {
  const anchor = weatherLocationFrom(events || [], locations || {});
  return anchor ? { lat: anchor.lat, lon: anchor.lon } : orgDefault;
}
