/**
 * Radar rain: NOAA's MRMS base reflectivity at a point, read as a time series
 * of rendered palette colours, and the one rule that turns an echo into a rain
 * claim. Radar may only ADD rain. A radar that cannot answer is `null`, which
 * is unknown and never dry.
 *
 * Ported from the parish's `radarNow.ts` and `radarUpgrade.ts`. Logic is the
 * same. The WMO codes are replaced by `Condition` values.
 *
 * - Echo classes come from hue families, and the rain floor is `rain`, `heavy`
 *   and `storm`. Blue (`light`) claims rain only in saturated air.
 * - The claim looks at the two newest frames (`BRIDGE_FRAMES`) and no further.
 * - A claim is stamped with its own frame's time, never with "now".
 */
import { WeatherCache } from "./cache.js";
import { bindOnError, coordKey, isValidCoord } from "./helpers.js";
import { FRESH_MS, MAX_AGE_MS, type EngineOptions } from "./provenance.js";
import { NOAA_MAPS, nwsJson } from "./nws/http.js";
import { isPrecipitation, type Condition } from "./condition.js";
import type { Coords } from "./types.js";
import type { NowReading } from "./now.js";
import type { DayReading } from "./nws/daily.js";

export type EchoIntensity =
  | "none" // transparent pixel: no echo
  | "light" // blue family, below the rain floor (virga or clutter)
  | "rain" // green family
  | "heavy" // yellow and orange family
  | "storm" // red and beyond, including magenta and white extremes
  | "unknown-echo"; // echo present, palette drifted: never dry, never a rain claim

export interface RadarFrame {
  /** Epoch ms, the radar's own clock (idp_validtime). */
  at: number;
  intensity: EchoIntensity;
}

export interface RadarRain {
  /** The newest frame is at or above the rain floor. */
  rainingNow: boolean;
  /** Any frame in the last 20 minutes is at or above the rain floor. */
  recentRain: boolean;
  /** The newest frame's classification. */
  intensity: EchoIntensity;
  /** Timestamp of the newest frame, or null. */
  latestFrameAt: number | null;
  /** Epoch ms of the fetch that produced this answer. */
  checkedAt: number;
  /** The two newest frames, newest first. See `rainClaimFrom`. */
  bridgeFrames: RadarFrame[];
}

const IDENTIFY_URL = `${NOAA_MAPS}/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer/identify`;

/**
 * A radar frame's own age limit, measured from `now`. A frame older than this
 * is ignored everywhere: it cannot claim rain, and it is not "dry" either. The
 * same value bounds the "recent" window. Frames dated after `now` are kept, since
 * a device clock may run behind the radar's.
 *
 * The rule for a rain claim (B-013): radar never claims rain from a frame more
 * than this old at the moment the claim is made. A radar answer is cached, so the
 * age is checked again in `rainClaimFrom` with the caller's clock, not only when
 * the radar was read.
 */
export const MAX_FRAME_AGE_MS = 20 * 60_000;

/**
 * After a radar read ultimately fails for a coordinate, the radar is not asked
 * again for that coordinate until this much time has passed (measured with
 * `opts.now`). Calls inside the hold make no request and no `onError`.
 */
export const RADAR_RETRY_AFTER_MS = 60_000;

/** Holds kept at most, oldest dropped first. */
const RADAR_HOLD_LIMIT = 200;

/** Intensities at or above the unconditional rain floor. */
const RAIN_FLOOR: ReadonlySet<EchoIntensity> = new Set(["rain", "heavy", "storm"]);

/**
 * Classify one rendered pixel by hue family. Accepts both separators the
 * service emits (space-separated frames, comma-separated `value`) and its
 * literal "NoData".
 */
export function classifyEcho(pixel: string): EchoIntensity {
  const s = pixel.trim();
  if (s === "" || /nodata/i.test(s)) return "none";
  const parts = s.split(/[\s,]+/).map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return "unknown-echo";
  const [r, g, b] = parts;
  const a = parts.length > 3 ? parts[3] : 255;
  if (a === 0 || (r === 0 && g === 0 && b === 0)) return "none";
  // Order matters. Yellow/orange before the red check: (255,211,0) has r as max but is
  // "heavy", not "storm". Magenta/white before the blue check: (248,0,253) has b as max
  // but is a 65+ dBZ extreme, not a below-floor blue.
  if (r >= 180 && g >= 140 && b < 100) return "heavy"; // yellow/orange
  if (r >= 180 && b >= 180) return "storm"; // magenta/purple/white extremes
  if (g > r && g > b) return "rain"; // green family, incl. teal-tinted (82,214,162)
  if (b > r && b > g) return "light"; // blue family, below the floor
  if (r > g && r > b) return "storm"; // orange-red through dark red
  return "unknown-echo"; // greys, teals, palette drift: echo present, intensity unknown
}

/**
 * Align frame pixel values with their catalog timestamps and sort oldest first.
 * Returns `[]` for anything that is not an identify response. A frame with no
 * numeric time is skipped. A pixel that is not a string is `unknown-echo`.
 */
export function parseRadarFrames(data: unknown): RadarFrame[] {
  if (typeof data !== "object" || data === null) return [];
  const root = data as Record<string, unknown>;
  const props = typeof root.properties === "object" && root.properties !== null
    ? (root.properties as Record<string, unknown>)
    : {};
  const cat = typeof root.catalogItems === "object" && root.catalogItems !== null
    ? (root.catalogItems as Record<string, unknown>)
    : {};
  const values: unknown[] = Array.isArray(props.Values) ? props.Values : [];
  const feats: unknown[] = Array.isArray(cat.features) ? cat.features : [];
  const frames: RadarFrame[] = [];
  for (let i = 0; i < Math.min(values.length, feats.length); i++) {
    const feat = feats[i];
    const attrs =
      typeof feat === "object" && feat !== null
        ? (feat as Record<string, unknown>).attributes
        : undefined;
    const at =
      typeof attrs === "object" && attrs !== null
        ? (attrs as Record<string, unknown>).idp_validtime
        : undefined;
    if (typeof at !== "number") continue;
    const v = values[i];
    frames.push({
      at,
      intensity: typeof v === "string" ? classifyEcho(v) : "unknown-echo",
    });
  }
  return frames.sort((x, y) => x.at - y.at);
}

/** True when a frame is older than `MAX_FRAME_AGE_MS` at `now`. Future frames are not old. */
function frameTooOld(frame: RadarFrame, now: number): boolean {
  return now - frame.at > MAX_FRAME_AGE_MS;
}

/**
 * The radar's answer from its frames, or `null` when none is usable. Frames older
 * than `MAX_FRAME_AGE_MS` are ignored, so a stalled radar that serves only old
 * frames answers `null` (no answer, never dry). The answer is computed from the
 * frames that remain.
 */
export function resolveRadar(frames: RadarFrame[], now: number): RadarRain | null {
  const live = frames.filter((f) => !frameTooOld(f, now));
  if (live.length === 0) return null;
  const latest = live[live.length - 1]!;
  return {
    rainingNow: RAIN_FLOOR.has(latest.intensity),
    recentRain: live.some((f) => RAIN_FLOOR.has(f.intensity)),
    intensity: latest.intensity,
    latestFrameAt: latest.at,
    checkedAt: now,
    // The two newest live frames, newest first, so the claim search reads in preference order.
    bridgeFrames: live.slice(-2).reverse(),
  };
}

/**
 * Radar intensity to a `Condition`. Radar cannot tell rain from snow, so at or
 * below 34 F the family is snow. Light showers become `light-rain`, heavier
 * `rain`, storms `thunderstorm`. Only `heavy` and `storm` freeze to `snow`.
 */
export function radarCondition(intensity: EchoIntensity, temperatureF: number | null): Condition {
  const freezing = temperatureF !== null && temperatureF <= 34;
  if (freezing) return intensity === "heavy" || intensity === "storm" ? "snow" : "light-snow";
  if (intensity === "storm") return "thunderstorm";
  if (intensity === "heavy") return "rain";
  // Blue echo in saturated air is stratiform: slight rain, not a shower.
  return "light-rain";
}

/** Surface relative humidity at or above which blue echo means arriving rain, not virga. */
export const SATURATED_HUMIDITY = 95;

/** How many frames back a claim may be drawn from. A third frame back never claims. */
export const BRIDGE_FRAMES = 2;

/** The frame that justifies a rain claim, with its own clock. */
export interface RainClaim {
  intensity: EchoIntensity;
  /** The claiming frame's validtime, not "now". */
  at: number;
}

/**
 * The one place a radar echo becomes a rain claim. Used by both the current
 * reading and the daily cell, so they cannot disagree about the same sky.
 *
 * - Only the two newest frames count.
 * - When `now` is given, a frame more than `MAX_FRAME_AGE_MS` older than `now`
 *   cannot claim; the search moves on to the next bridge frame (B-013). Without
 *   `now`, frames are not age-checked here (the read has already dropped old ones).
 * - `rain`, `heavy` and `storm` always claim.
 * - `light` claims only when humidity is at or above `SATURATED_HUMIDITY`.
 *   Absent humidity (`null` or `undefined`) means it does not claim.
 * - `unknown-echo` and `none` never claim.
 */
export function rainClaimFrom(
  radar: RadarRain | null | undefined,
  humidity: number | null | undefined,
  now?: number,
): RainClaim | null {
  if (!radar) return null;
  const saturated = typeof humidity === "number" && humidity >= SATURATED_HUMIDITY;
  for (const frame of (radar.bridgeFrames ?? []).slice(0, BRIDGE_FRAMES)) {
    if (now !== undefined && frameTooOld(frame, now)) continue;
    if (RAIN_FLOOR.has(frame.intensity)) return { intensity: frame.intensity, at: frame.at };
    if (frame.intensity === "light" && saturated) return { intensity: "light", at: frame.at };
  }
  return null;
}

/**
 * The radar's own budget for one request, in ms. The parish port asks once with
 * this budget. A hung service costs one budget, not a retry on top of it.
 */
export const RADAR_TIMEOUT_MS = 4000;

/**
 * The timeout for one radar request. A caller may shorten the budget but never
 * lengthen it: a finite, positive value below `RADAR_TIMEOUT_MS` is used as
 * given, and anything else (absent, zero, negative, NaN, Infinity, or longer)
 * is `RADAR_TIMEOUT_MS`.
 */
export function radarTimeoutMs(callerMs: number | undefined): number {
  return typeof callerMs === "number" && Number.isFinite(callerMs) && callerMs > 0 && callerMs < RADAR_TIMEOUT_MS
    ? callerMs
    : RADAR_TIMEOUT_MS;
}

/**
 * Cache of answers keyed by coordinate. A single shared value would hand one
 * point's weather to another. No retry: the radar is asked once per fetch, so a
 * hung service costs one `RADAR_TIMEOUT_MS`, not two attempts plus a backoff.
 */
const radarCache = new WeatherCache<RadarRain | null>(FRESH_MS.radar, 200, { retries: 0 });

function identifyUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
    returnGeometry: "false",
    returnCatalogItems: "true",
    returnPixelValues: "true",
    f: "json",
  });
  return `${IDENTIFY_URL}?${params.toString()}`;
}

/**
 * Coordinate key to the time its last radar read failed. While a hold is in
 * force, that coordinate makes no radar request and no `onError`. A successful
 * read clears it. Bounded by `RADAR_HOLD_LIMIT`.
 */
const radarHolds = new Map<string, number>();

function setRadarHold(key: string, failedAt: number): void {
  radarHolds.delete(key);
  radarHolds.set(key, failedAt);
  while (radarHolds.size > RADAR_HOLD_LIMIT) {
    const oldest = radarHolds.keys().next();
    if (oldest.done) break;
    radarHolds.delete(oldest.value);
  }
}

/**
 * Radar rain at a point, or `null` when the radar cannot answer (invalid
 * coordinates, fetch failure, or no usable frames). A failed refresh serves the
 * last answer for up to `MAX_AGE_MS.radar`. After a failed read, the coordinate
 * is held for `RADAR_RETRY_AFTER_MS`: calls inside the hold make no request and
 * no `onError`, and serve the last answer under the same `MAX_AGE_MS.radar`
 * bound, else `null`. Never throws.
 */
export async function getRadarRain(
  coords: Coords,
  opts: EngineOptions = {},
): Promise<RadarRain | null> {
  const { lat, lon } = coords;
  if (!isValidCoord(lat, lon)) return null;
  const now = opts.now ?? Date.now;
  const key = coordKey(lat, lon);
  const heldAt = radarHolds.get(key);
  if (heldAt !== undefined && now() - heldAt < RADAR_RETRY_AFTER_MS) {
    // The loader throws at once, so no request is made, and no onError is given.
    // The result is the stored answer if it is still inside MAX_AGE_MS.radar, else null.
    const held = await radarCache.getWithMeta(
      key,
      async () => {
        throw new Error("radar: held after a failed read");
      },
      null,
      undefined,
      MAX_AGE_MS.radar,
      now,
    );
    return held.data;
  }
  const meta = await radarCache.getWithMeta(
    key,
    async () => {
      try {
        const data = await nwsJson(identifyUrl(lat, lon), {
          ...opts,
          timeoutMs: radarTimeoutMs(opts.timeoutMs),
        });
        const result = resolveRadar(parseRadarFrames(data), now());
        if (!result) throw new Error("radar: no usable frames");
        radarHolds.delete(key);
        return result;
      } catch (err) {
        setRadarHold(key, now());
        throw err;
      }
    },
    null,
    bindOnError(opts, "getRadarRain", lat, lon),
    MAX_AGE_MS.radar,
    now,
  );
  return meta.data;
}

/**
 * Start the radar request now, so it runs alongside the caller's reading. The
 * promise never rejects: a radar that fails is `null` (unknown, never dry).
 */
export function startRadarRain(coords: Coords, opts: EngineOptions = {}): Promise<RadarRain | null> {
  return getRadarRain(coords, opts).catch(() => null);
}

/**
 * Add a radar rain claim to a current reading. Returns the same object unless
 * the reading is dry and the radar claims rain. Never removes precipitation
 * and never changes any field other than `condition`, `rainSource` and `radarAt`.
 */
export function applyRadarToNow(reading: NowReading, radar: RadarRain | null, now?: number): NowReading {
  if (!radar) return reading;
  if (isPrecipitation(reading.condition)) return reading;
  const claim = rainClaimFrom(radar, reading.humidity, now);
  if (!claim) return reading;
  return {
    ...reading,
    condition: radarCondition(claim.intensity, reading.temperature),
    rainSource: "radar",
    radarAt: claim.at,
  };
}

/**
 * Add a radar rain claim to today's daily cell. Only the entry whose `date` is
 * `today` can change. A dry day gets the claim on `dayCondition`, or on
 * `nightCondition` when there is no day condition. The daily path has no
 * humidity, so blue echo never claims here. Other days are untouched.
 */
export function applyRadarToToday(
  days: DayReading[],
  radar: RadarRain | null,
  today: string,
  now?: number,
): DayReading[] {
  if (!radar) return days;
  const index = days.findIndex((d) => d.date === today);
  if (index < 0) return days;
  const day = days[index]!;
  if (isPrecipitation(day.dayCondition) || isPrecipitation(day.nightCondition)) return days;
  const claim = rainClaimFrom(radar, null, now);
  if (!claim) return days;
  const condition = radarCondition(claim.intensity, day.high);
  const updated: DayReading =
    day.dayCondition !== null
      ? { ...day, dayCondition: condition, rainSource: "radar" }
      : { ...day, nightCondition: condition, rainSource: "radar" };
  return days.map((d, i) => (i === index ? updated : d));
}

/** Test hook: clear every cached radar answer and every hold. */
export function clearRadarCache(): void {
  radarCache.clear();
  radarHolds.clear();
}
