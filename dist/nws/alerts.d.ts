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
/**
 * Active official alerts for a point, highest level first, then earliest onset
 * (a null onset last). `[]` means none are active. `null` means outside NWS
 * coverage (invalid or 404 point), or the alerts request failed with no list
 * young enough to serve. A failed point lookup does not stop the alerts request:
 * it needs only the coordinates.
 * Never throws; `onError` fires once per ultimately-failed alerts fetch.
 */
export declare function getAlerts(coords: Coords, opts?: EngineOptions): Promise<WeatherAlert[] | null>;
/** Test hook: clear every cached alert list. */
export declare function clearAlertsCache(): void;
//# sourceMappingURL=alerts.d.ts.map