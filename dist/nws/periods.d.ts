/**
 * The period fetch both forecasts share: GET one forecast URL of a point, and
 * on a 404 evict the cached point, look it up afresh and try once more. Throws
 * when the periods cannot be read, so the cache serves stale or empty and
 * reports one `onError`.
 */
import type { EngineOptions } from "../provenance.js";
import type { Coords } from "../types.js";
import { type NwsPoint } from "./point.js";
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
export declare function fetchPeriods(coords: Coords, first: NwsPoint, opts: EngineOptions, urlOf: (p: NwsPoint) => string, label: string): Promise<FetchedPeriods>;
//# sourceMappingURL=periods.d.ts.map