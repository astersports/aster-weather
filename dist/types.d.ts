/**
 * @aster/weather — shared types & constants
 *
 * Framework-agnostic. No React, no app constants. Shapes follow the
 * St. Patrick `server/weather` engine (the canonical source), with the
 * time representation changed to absolute epoch-ms per the aster-sports
 * `useWeather` DL-13 fix (see DERIVATION.md §"Hourly time").
 */
/** Open-Meteo 7-day coverage is the practical ceiling for the hourly endpoint. */
export declare const FORECAST_DAYS = 7;
/** Default fetch timeout for Open-Meteo calls (ms). */
export declare const FETCH_TIMEOUT_MS = 5000;
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
 * override per call; the hourly indicator still self-limits to its ~7-day
 * Open-Meteo coverage regardless.
 */
export declare const DEFAULT_FORECAST_WINDOW_DAYS = 10;
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
 */
export interface HourlyForecast {
    timestamp: number;
    temperature: number;
    apparentTemperature: number;
    precipitationProbability: number;
    precipitation: number;
    weatherCode: number;
    cloudCover: number;
    windSpeed: number;
    isDay: boolean;
}
export interface EventWeather {
    temperature: number;
    feelsLike: number;
    precipProbability: number;
    precipAmount: number;
    weatherCode: number;
    description: string;
    icon: string;
    windSpeed: number;
    isDay: boolean;
    isRainWarning: boolean;
    isSevereWarning: boolean;
    forecastStrip: Array<{
        timestamp: number;
        label: string;
        temperature: number;
        precipProbability: number;
        weatherCode: number;
        icon: string;
    }>;
}
export interface CurrentWeather {
    temperature: number;
    feelsLike: number;
    weatherCode: number;
    description: string;
    icon: string;
    windSpeed: number;
    isDay: boolean;
    humidity: number;
    sunrise: string;
    sunset: string;
}
export interface DailyForecast {
    date: string;
    high: number;
    low: number;
    precipProbabilityMax: number;
    weatherCode: number;
    icon: string;
    description: string;
    sunrise: string;
    sunset: string;
}
/**
 * Injectable fetch — defaults to global `fetch`. Consumers with an SSRF
 * boundary (e.g. astersports-web `safeFetch`) pass their own. Merged from
 * the aster-sports resolver pattern (AP #27: pure with injected IO).
 */
export type FetchImpl = (url: string) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
}>;
export interface FetchOptions {
    /** Injected fetch (SSRF boundary / test stub). Defaults to global fetch. */
    fetchImpl?: FetchImpl;
    /** Per-call timeout override (ms). */
    timeoutMs?: number;
}
//# sourceMappingURL=types.d.ts.map