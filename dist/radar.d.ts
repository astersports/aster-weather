import { type EngineOptions } from "./provenance.js";
import { type Condition } from "./condition.js";
import type { Coords } from "./types.js";
import type { NowReading } from "./now.js";
import type { DayReading } from "./nws/daily.js";
export type EchoIntensity = "none" | "light" | "rain" | "heavy" | "storm" | "unknown-echo";
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
/**
 * A radar frame's own age limit, measured from `now`. A frame older than this
 * is ignored everywhere: it cannot claim rain, and it is not "dry" either. The
 * same value bounds the "recent" window. Frames dated after `now` are kept, since
 * a device clock may run behind the radar's.
 */
export declare const MAX_FRAME_AGE_MS: number;
/**
 * After a radar read ultimately fails for a coordinate, the radar is not asked
 * again for that coordinate until this much time has passed (measured with
 * `opts.now`). Calls inside the hold make no request and no `onError`.
 */
export declare const RADAR_RETRY_AFTER_MS = 60000;
/**
 * Classify one rendered pixel by hue family. Accepts both separators the
 * service emits (space-separated frames, comma-separated `value`) and its
 * literal "NoData".
 */
export declare function classifyEcho(pixel: string): EchoIntensity;
/**
 * Align frame pixel values with their catalog timestamps and sort oldest first.
 * Returns `[]` for anything that is not an identify response. A frame with no
 * numeric time is skipped. A pixel that is not a string is `unknown-echo`.
 */
export declare function parseRadarFrames(data: unknown): RadarFrame[];
/**
 * The radar's answer from its frames, or `null` when none is usable. Frames older
 * than `MAX_FRAME_AGE_MS` are ignored, so a stalled radar that serves only old
 * frames answers `null` (no answer, never dry). The answer is computed from the
 * frames that remain.
 */
export declare function resolveRadar(frames: RadarFrame[], now: number): RadarRain | null;
/**
 * Radar intensity to a `Condition`. Radar cannot tell rain from snow, so at or
 * below 34 F the family is snow. Light showers become `light-rain`, heavier
 * `rain`, storms `thunderstorm`. Only `heavy` and `storm` freeze to `snow`.
 */
export declare function radarCondition(intensity: EchoIntensity, temperatureF: number | null): Condition;
/** Surface relative humidity at or above which blue echo means arriving rain, not virga. */
export declare const SATURATED_HUMIDITY = 95;
/** How many frames back a claim may be drawn from. A third frame back never claims. */
export declare const BRIDGE_FRAMES = 2;
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
 * - `rain`, `heavy` and `storm` always claim.
 * - `light` claims only when humidity is at or above `SATURATED_HUMIDITY`.
 *   Absent humidity (`null` or `undefined`) means it does not claim.
 * - `unknown-echo` and `none` never claim.
 */
export declare function rainClaimFrom(radar: RadarRain | null | undefined, humidity: number | null | undefined): RainClaim | null;
/**
 * The radar's own budget for one request, in ms. The parish port asks once with
 * this budget. A hung service costs one budget, not a retry on top of it.
 */
export declare const RADAR_TIMEOUT_MS = 4000;
/**
 * The timeout for one radar request. A caller may shorten the budget but never
 * lengthen it: a finite, positive value below `RADAR_TIMEOUT_MS` is used as
 * given, and anything else (absent, zero, negative, NaN, Infinity, or longer)
 * is `RADAR_TIMEOUT_MS`.
 */
export declare function radarTimeoutMs(callerMs: number | undefined): number;
/**
 * Radar rain at a point, or `null` when the radar cannot answer (invalid
 * coordinates, fetch failure, or no usable frames). A failed refresh serves the
 * last answer for up to `MAX_AGE_MS.radar`. After a failed read, the coordinate
 * is held for `RADAR_RETRY_AFTER_MS`: calls inside the hold make no request and
 * no `onError`, and serve the last answer under the same `MAX_AGE_MS.radar`
 * bound, else `null`. Never throws.
 */
export declare function getRadarRain(coords: Coords, opts?: EngineOptions): Promise<RadarRain | null>;
/**
 * Start the radar request now, so it runs alongside the caller's reading. The
 * promise never rejects: a radar that fails is `null` (unknown, never dry).
 */
export declare function startRadarRain(coords: Coords, opts?: EngineOptions): Promise<RadarRain | null>;
/**
 * Add a radar rain claim to a current reading. Returns the same object unless
 * the reading is dry and the radar claims rain. Never removes precipitation
 * and never changes any field other than `condition`, `rainSource` and `radarAt`.
 */
export declare function applyRadarToNow(reading: NowReading, radar: RadarRain | null): NowReading;
/**
 * Add a radar rain claim to today's daily cell. Only the entry whose `date` is
 * `today` can change. A dry day gets the claim on `dayCondition`, or on
 * `nightCondition` when there is no day condition. The daily path has no
 * humidity, so blue echo never claims here. Other days are untouched.
 */
export declare function applyRadarToToday(days: DayReading[], radar: RadarRain | null, today: string): DayReading[];
/** Test hook: clear every cached radar answer and every hold. */
export declare function clearRadarCache(): void;
//# sourceMappingURL=radar.d.ts.map