import { type EngineOptions } from "../provenance.js";
import type { Coords } from "../types.js";
export interface WeatherAlert {
    id: string;
    event: string;
    headline: string | null;
    nwsHeadline: string | null;
    description: string | null;
    instruction: string | null;
    severity: "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
    level: 1 | 2 | 3;
    urgency: string | null;
    certainty: string | null;
    onset: number | null;
    ends: number | null;
    sender: string | null;
    areaDesc: string | null;
}
/** Longest a failed refresh may serve the last list. */
export declare const ALERT_MAX_STALE_MS: number;
/** A point's active alerts with the moment they were fetched and whether that list is stale. */
export interface AlertsReading {
    alerts: WeatherAlert[];
    /** When the list was fetched (epoch ms): the cache's fetch time, not the clock at the call. */
    fetchedAt: number;
    /** True when a refresh failed and this is the earlier list, still inside `ALERT_MAX_STALE_MS`. */
    stale: boolean;
}
/**
 * Active official alerts for a point, highest level first, then earliest onset
 * (a null onset last), with when the list was fetched and whether it is stale.
 * `alerts: []` means none are active. `null` means outside NWS coverage
 * (invalid or 404 point), or the alerts request failed with no list young enough
 * to serve. A failed point lookup does not stop the alerts request: it needs
 * only the coordinates.
 * Never throws; `onError` fires once per ultimately-failed alerts fetch.
 */
export declare function getAlertsReading(coords: Coords, opts?: EngineOptions): Promise<AlertsReading | null>;
/**
 * Active official alerts for a point: the list of `getAlertsReading`, without
 * its fetch time. `null` as there. Never throws; `onError` fires once per
 * ultimately-failed alerts fetch.
 */
export declare function getAlerts(coords: Coords, opts?: EngineOptions): Promise<WeatherAlert[] | null>;
/** Test hook: clear every cached alert list. */
export declare function clearAlertsCache(): void;
//# sourceMappingURL=alerts.d.ts.map