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
 * City = the address segment after the first comma (same heuristic as the
 * venue-list city), falling back to the first segment or the venue name.
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
      const parts = loc.address
        ? String(loc.address).split(",").map((s) => s.trim())
        : [];
      return {
        lat,
        lon,
        city: parts.length >= 2 ? parts[1] : parts[0] || loc.name || null,
      };
    }
  }
  return null;
}

/**
 * Resolve the weather-anchor coords for a set of events. Returns the first
 * event-location carrying lat/lon, else `orgDefault`. Returns a `[lat, lon]`
 * tuple to spread straight into a `useWeather(lat, lon)`-style hook.
 */
export function coordsForEvent(
  events: Array<{ location_id?: string | number | null }> | null | undefined,
  locations: Record<string | number, WeatherLocation> | null | undefined,
  orgDefault: [number, number],
): [number, number] {
  const anchor = weatherLocationFrom(events || [], locations || {});
  return anchor ? [anchor.lat, anchor.lon] : orgDefault;
}
