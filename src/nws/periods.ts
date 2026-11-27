/**
 * The period fetch both forecasts share: GET one forecast URL of a point, and
 * on a 404 evict the cached point, look it up afresh and try once more. Throws
 * when the periods cannot be read, so the cache serves stale or empty and
 * reports one `onError`.
 */
import type { EngineOptions } from "../provenance.js";
import type { Coords } from "../types.js";
import { evictPoint, getPoint, type NwsPoint } from "./point.js";
import { nwsJson } from "./http.js";

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

export interface FetchedPeriods {
  /** The point that answered (the fresh lookup after a 404). */
  point: NwsPoint;
  /** The response's `properties` (`updateTime` may be absent). */
  props: Record<string, unknown>;
  /** The response's `properties.periods`, checked to be an array. */
  periods: unknown[];
}

/**
 * Fetch `urlOf(point)` for the periods. `label` prefixes the error text.
 */
export async function fetchPeriods(
  coords: Coords,
  first: NwsPoint,
  opts: EngineOptions,
  urlOf: (p: NwsPoint) => string,
  label: string,
): Promise<FetchedPeriods> {
  let current = first;
  let body = await nwsJson(urlOf(current), opts);
  if (body === null) {
    // The point may have moved to another grid: look it up afresh, once.
    evictPoint(coords);
    const fresh = await getPoint(coords, opts);
    if (!fresh) throw new Error(`${label}: point gone after a 404`);
    current = fresh;
    body = await nwsJson(urlOf(current), opts);
    if (body === null) throw new Error(`${label}: forecast 404 twice`);
  }
  const props = rec(rec(body)?.properties);
  if (!props || !Array.isArray(props.periods)) throw new Error(`${label}: no periods`);
  return { point: current, props, periods: props.periods };
}
