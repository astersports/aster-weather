/**
 * Official alerts: `/alerts/active?point=` for a point, parsed into one list.
 * Text fields are passed through exactly as NWS sent them; nothing is trimmed
 * or re-wrapped. The parsed list is cached per point; expiry is checked on
 * every read, so a cached alert never outlives its `ends`.
 */
import { WeatherCache } from "../cache.js";
import { RESILIENT_CACHE, bindOnError, isValidCoord } from "../helpers.js";
import { FRESH_MS } from "../provenance.js";
import { NWS_API, nwsJson } from "./http.js";
import { lookupPoint } from "./point.js";
/** Longest a failed refresh may serve the last list. */
export const ALERT_MAX_STALE_MS = 60 * 60_000;
const alertCache = new WeatherCache(FRESH_MS.alerts, 200, RESILIENT_CACHE);
/** Same key formatting as the point cache: at most four decimals, no trailing zeros. */
const fmt = (v) => String(Number(v.toFixed(4)));
const pointKey = (c) => `${fmt(c.lat)},${fmt(c.lon)}`;
const SEVERITIES = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];
const LEVEL = {
    Extreme: 3,
    Severe: 3,
    Moderate: 2,
    Minor: 1,
    Unknown: 1,
};
function rec(v) {
    return typeof v === "object" && v !== null ? v : null;
}
function str(v) {
    return typeof v === "string" ? v : null;
}
/** An ISO time as epoch ms, or null when missing or unparsable. */
function isoMs(v) {
    if (typeof v !== "string")
        return null;
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
}
function severityOf(v) {
    return typeof v === "string" && SEVERITIES.includes(v)
        ? v
        : "Unknown";
}
/** One GeoJSON feature as an alert, or null when it must be dropped. */
function parseFeature(f) {
    const feat = rec(f);
    const p = rec(feat?.properties);
    if (!feat || !p)
        return null;
    if (p.status !== "Actual")
        return null;
    if (p.messageType === "Cancel")
        return null;
    const id = str(p.id) ?? str(feat.id);
    if (id === null)
        return null;
    const event = str(p.event);
    if (event === null || event === "")
        return null;
    const severity = severityOf(p.severity);
    const params = rec(p.parameters);
    const nws = Array.isArray(params?.NWSheadline) ? params.NWSheadline[0] : undefined;
    return {
        id,
        event,
        headline: str(p.headline),
        nwsHeadline: typeof nws === "string" ? nws : null,
        description: str(p.description),
        instruction: str(p.instruction),
        severity,
        level: LEVEL[severity],
        urgency: str(p.urgency),
        certainty: str(p.certainty),
        onset: isoMs(p.onset),
        ends: isoMs(p.ends) ?? isoMs(p.expires),
        sender: str(p.senderName),
        areaDesc: str(p.areaDesc),
    };
}
function parseAlerts(body) {
    const features = rec(body)?.features;
    if (!Array.isArray(features))
        throw new Error("NWS alerts: no feature list");
    const out = [];
    for (const f of features) {
        const alert = parseFeature(f);
        if (alert !== null)
            out.push(alert);
    }
    return out;
}
/** Fetch and parse one point's alerts. A 404 is not an answer here, so it throws. */
async function loadAlerts(coords, opts) {
    const url = `${NWS_API}/alerts/active?point=${pointKey(coords)}`;
    const body = await nwsJson(url, opts);
    if (body === null)
        throw new Error("NWS alerts: HTTP 404");
    return parseAlerts(body);
}
function onsetAsc(x, y) {
    if (x === y)
        return 0;
    if (x === null)
        return 1;
    if (y === null)
        return -1;
    return x - y;
}
/**
 * Active official alerts for a point, highest level first, then earliest onset
 * (a null onset last). `[]` means none are active. `null` means outside NWS
 * coverage, or the lookup failed with no list young enough to serve. A failed
 * point lookup does not stop the alerts request: it needs only the coordinates.
 * Never throws; `onError` fires once per ultimately-failed alerts fetch.
 */
export async function getAlerts(coords, opts = {}) {
    const { lat, lon } = coords;
    const lookup = await lookupPoint(coords, opts);
    if (lookup.status === "outside")
        return null;
    if (!isValidCoord(lat, lon))
        return null;
    const now = opts.now ?? Date.now;
    const meta = await alertCache.getWithMeta(pointKey(coords), () => loadAlerts(coords, opts), null, bindOnError(opts, "getAlerts", lat, lon), ALERT_MAX_STALE_MS, now);
    if (meta.data === null)
        return null;
    const t = now();
    return meta.data
        .filter((a) => a.ends === null || a.ends > t)
        .sort((a, b) => b.level - a.level || onsetAsc(a.onset, b.onset));
}
/** Test hook: clear every cached alert list. */
export function clearAlertsCache() {
    alertCache.clear();
}
//# sourceMappingURL=alerts.js.map