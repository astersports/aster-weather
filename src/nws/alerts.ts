/**
 * Official alerts: `/alerts/active?point=` for a point, parsed into one list.
 * Text fields are passed through exactly as NWS sent them; nothing is trimmed
 * or re-wrapped. The parsed list is cached per point; expiry is checked on
 * every read, so a cached alert never outlives its `ends`.
 */
import { WeatherCache } from "../cache.js";
import { RESILIENT_CACHE, bindOnError, isValidCoord } from "../helpers.js";
import { FRESH_MS, type EngineOptions } from "../provenance.js";
import type { Coords } from "../types.js";
import { NWS_API, nwsJson } from "./http.js";
import { lookupPoint } from "./point.js";

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

type Severity = WeatherAlert["severity"];

/** Longest a failed refresh may serve the last list. */
export const ALERT_MAX_STALE_MS = 60 * 60_000;

const alertCache = new WeatherCache<WeatherAlert[] | null>(
  FRESH_MS.alerts,
  200,
  RESILIENT_CACHE,
);

/** Same key formatting as the point cache: at most four decimals, no trailing zeros. */
const fmt = (v: number): string => String(Number(v.toFixed(4)));
const pointKey = (c: Coords): string => `${fmt(c.lat)},${fmt(c.lon)}`;

const SEVERITIES: readonly Severity[] = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];
const LEVEL: Record<Severity, 1 | 2 | 3> = {
  Extreme: 3,
  Severe: 3,
  Moderate: 2,
  Minor: 1,
  Unknown: 1,
};

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** An ISO time as epoch ms, or null when missing or unparsable. */
function isoMs(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}

function severityOf(v: unknown): Severity {
  return typeof v === "string" && (SEVERITIES as readonly string[]).includes(v)
    ? (v as Severity)
    : "Unknown";
}

/** One GeoJSON feature as an alert, or null when it must be dropped. */
function parseFeature(f: unknown): WeatherAlert | null {
  const feat = rec(f);
  const p = rec(feat?.properties);
  if (!feat || !p) return null;
  if (p.status !== "Actual") return null;
  if (p.messageType === "Cancel") return null;
  const id = str(p.id) ?? str(feat.id);
  if (id === null) return null;
  const event = str(p.event);
  if (event === null || event === "") return null;

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

function parseAlerts(body: unknown): WeatherAlert[] {
  const features = rec(body)?.features;
  if (!Array.isArray(features)) throw new Error("NWS alerts: no feature list");
  const out: WeatherAlert[] = [];
  for (const f of features) {
    const alert = parseFeature(f);
    if (alert !== null) out.push(alert);
  }
  return out;
}

/** Fetch and parse one point's alerts. A 404 is not an answer here, so it throws. */
async function loadAlerts(coords: Coords, opts: EngineOptions): Promise<WeatherAlert[]> {
  const url = `${NWS_API}/alerts/active?point=${pointKey(coords)}`;
  const body = await nwsJson(url, opts);
  if (body === null) throw new Error("NWS alerts: HTTP 404");
  return parseAlerts(body);
}

function onsetAsc(x: number | null, y: number | null): number {
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x - y;
}

/**
 * Active official alerts for a point, highest level first, then earliest onset
 * (a null onset last). `[]` means none are active. `null` means outside NWS
 * coverage (invalid or 404 point), or the alerts request failed with no list
 * young enough to serve. A failed point lookup does not stop the alerts request:
 * it needs only the coordinates.
 * Never throws; `onError` fires once per ultimately-failed alerts fetch.
 */
export async function getAlerts(
  coords: Coords,
  opts: EngineOptions = {},
): Promise<WeatherAlert[] | null> {
  const { lat, lon } = coords;
  const lookup = await lookupPoint(coords, opts);
  if (lookup.status === "outside") return null;
  if (!isValidCoord(lat, lon)) return null;

  const now = opts.now ?? Date.now;
  const meta = await alertCache.getWithMeta(
    pointKey(coords),
    () => loadAlerts(coords, opts),
    null,
    bindOnError(opts, "getAlerts", lat, lon),
    ALERT_MAX_STALE_MS,
    now,
  );
  if (meta.data === null) return null;

  const t = now();
  return meta.data
    .filter((a) => a.ends === null || a.ends > t)
    .sort((a, b) => b.level - a.level || onsetAsc(a.onset, b.onset));
}

/** Test hook: clear every cached alert list. */
export function clearAlertsCache(): void {
  alertCache.clear();
}
