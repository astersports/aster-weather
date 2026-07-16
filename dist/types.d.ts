/**
 * @aster/weather — shared types & constants
 *
 * Framework-agnostic. No React, no app constants. Shapes follow the
 * St. Patrick `server/weather` engine (the canonical source), with the
 * time representation changed to absolute epoch-ms per the aster-sports
 * `useWeather` DL-13 fix (see DERIVATION.md §"Hourly time").
 *
 * v0.2.0: measurement fields are `number | null` — a missing Open-Meteo
 * reading is `null` ("unknown"), never a fabricated `0` (WX-P1-1 / AP #27,
 * #36). `weatherCode` stays a number (it drives icon dispatch; absent → 0
 * "clear", the documented neutral).
 */
/**
 * Open-Meteo hourly coverage supports up to 16 days; we request 14 to comfortably
 * cover the `DEFAULT_FORECAST_WINDOW_DAYS` surface window (was 7, which left a dead
 * 7–10 day gap — WX-P2-2).
 */
export declare const FORECAST_DAYS = 14;
/** Default fetch timeout for Open-Meteo calls (ms). */
export declare const FETCH_TIMEOUT_MS = 5000;
/**
 * Loader resilience (v0.5.0, M5). One retry with a fixed backoff before a fetch
 * falls through to stale-or-empty — absorbs a single transient blip instead of
 * serving stale for the whole TTL window. Each attempt keeps its own
 * {@link FETCH_TIMEOUT_MS} budget; a retry-then-fail emits exactly one
 * `onError` signal (paired with M1), never one per attempt.
 */
export declare const FETCH_RETRY_COUNT = 1;
export declare const FETCH_RETRY_BACKOFF_MS = 500;
/** Skip an event match when the nearest forecast hour is further than this. */
export declare const MAX_FORECAST_HOUR_GAP_MS: number;
/**
 * Tightest hour match used by {@link getWeatherForTime}. Merged from
 * aster-sports `getWeatherForTime` (2h window) — distinct from the looser
 * 6h gap used by the daily-schedule event enrichment.
 */
export declare const HOURLY_MATCH_WINDOW_MS: number;
/**
 * Default "surface weather UX for an upcoming event" window in days.
 * Merged from aster-sports `WEATHER_FORECAST_WINDOW_DAYS`. Consumers may
 * override per call; the hourly indicator still self-limits to its
 * Open-Meteo coverage (`FORECAST_DAYS`) regardless.
 */
export declare const DEFAULT_FORECAST_WINDOW_DAYS = 10;
/**
 * Sustained-wind and gust thresholds (mph) for the severe-weather flag.
 * Gusts (typically 1.5–2× sustained) are what actually cancel outdoor
 * events, so they carry their own threshold (WX-P2-4).
 */
export declare const SEVERE_WIND_MPH = 40;
export declare const SEVERE_GUST_MPH = 45;
/**
 * The closed set of SVG-icon keys the WMO map emits and the icon dispatcher
 * routes. Typing every `icon` field with this union turns a future key
 * rename into a compile error at the consumer instead of a silent
 * fall-through to the default icon (WX-P2-15).
 */
export type WeatherIconKey = "clear" | "mostly-clear" | "partly-cloudy" | "overcast" | "fog" | "drizzle" | "light-rain" | "rain" | "freezing-rain" | "heavy-rain" | "light-snow" | "snow" | "heavy-snow" | "thunderstorm";
/** A weather anchor coordinate. */
export interface Coords {
    lat: number;
    lon: number;
}
/**
 * One hour of forecast. `timestamp` is absolute epoch-ms derived from
 * Open-Meteo `&timeformat=unixtime` — NOT from parsing a timezone-naive
 * local string with `new Date(...)` (the bug the aster-sports DL-13 fix
 * corrected and that the original St. Patrick engine still carried).
 *
 * Measurement fields are `number | null`: `null` means Open-Meteo did not
 * report a value for this hour (never a fabricated `0`).
 */
export interface HourlyForecast {
    timestamp: number;
    temperature: number | null;
    apparentTemperature: number | null;
    precipitationProbability: number | null;
    precipitation: number | null;
    weatherCode: number;
    cloudCover: number | null;
    windSpeed: number | null;
    windGusts: number | null;
    isDay: boolean;
}
/**
 * A single 15-minute precipitation-nowcast point (WX-P2-3). Sourced from
 * Open-Meteo `minutely_15` on the same `/v1/forecast` endpoint. Answers
 * "will it rain during the next couple hours of the game?"
 * (`precipitation_probability` is NOT valid at 15-min resolution, so this
 * carries amount + gusts, not a probability.)
 */
export interface NowcastPoint {
    timestamp: number;
    precipitation: number | null;
    windGusts: number | null;
}
export interface EventWeather {
    temperature: number | null;
    feelsLike: number | null;
    precipProbability: number | null;
    precipAmount: number | null;
    weatherCode: number;
    description: string;
    icon: WeatherIconKey;
    windSpeed: number | null;
    windGusts: number | null;
    isDay: boolean;
    isRainWarning: boolean;
    isSevereWarning: boolean;
    forecastStrip: Array<{
        timestamp: number;
        label: string;
        temperature: number | null;
        precipProbability: number | null;
        weatherCode: number;
        icon: WeatherIconKey;
    }>;
}
export interface CurrentWeather {
    temperature: number | null;
    feelsLike: number | null;
    weatherCode: number;
    description: string;
    icon: WeatherIconKey;
    windSpeed: number | null;
    windGusts: number | null;
    windDirection: number | null;
    precipitation: number | null;
    isDay: boolean;
    humidity: number | null;
    /** Epoch ms of the observation (Open-Meteo `current.time`) — data age for a realtime UI (WX-P2-5). */
    observedAt: number | null;
    sunrise: string;
    sunset: string;
}
export interface DailyForecast {
    date: string;
    high: number | null;
    low: number | null;
    precipProbabilityMax: number | null;
    windSpeedMax: number | null;
    uvIndexMax: number | null;
    weatherCode: number;
    icon: WeatherIconKey;
    description: string;
    sunrise: string;
    sunset: string;
}
/**
 * Injectable fetch — defaults to global `fetch`. Consumers with an SSRF
 * boundary (e.g. astersports-web `safeFetch`) pass their own. Merged from
 * the aster-sports resolver pattern (AP #27: pure with injected IO).
 *
 * v0.2.0: the optional `init` carries an `AbortSignal` so the engine can
 * abort a timed-out injected fetch (WX-P2-16) — the extra param is optional,
 * so existing single-arg implementations remain assignable.
 */
export type FetchImpl = (url: string, init?: {
    signal?: AbortSignal;
}) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
}>;
/** Which loader an {@link WeatherErrorContext} came from. */
export type WeatherCall = "fetchForecast" | "getCurrentWeather" | "getDailyForecast" | "getNowcast";
/**
 * Context passed to {@link FetchOptions.onError} so a consumer can tag the
 * failure by call + venue when routing it into its own tracker.
 */
export interface WeatherErrorContext {
    /** The loader that failed. */
    call: WeatherCall;
    lat: number;
    lon: number;
}
export interface FetchOptions {
    /** Injected fetch (SSRF boundary / test stub). Defaults to global fetch. */
    fetchImpl?: FetchImpl;
    /** Per-call timeout override (ms). */
    timeoutMs?: number;
    /**
     * Observability hook (v0.5.0, M1). Invoked ONCE per fetch that ultimately
     * fails — after retries are exhausted, immediately before the engine falls
     * back to stale-or-empty. The engine still never throws; an omitted hook is
     * zero behavior change. This is the single channel that lets a consumer route
     * an Open-Meteo outage into Sentry/PostHog instead of it vanishing into
     * `[]`/`null`/stale. A background stale-while-revalidate refresh that fails
     * also fires it (the refresh is exactly the silent failure this surfaces).
     */
    onError?: (err: unknown, ctx: WeatherErrorContext) => void;
}
//# sourceMappingURL=types.d.ts.map