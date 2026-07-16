/**
 * WMO weather-code maps — the single source of truth.
 *
 * Merges two previously-duplicated maps in the family:
 *  - St. Patrick `server/weather/helpers.ts` WMO_CODES → { description, icon }
 *    where `icon` is a STRING key driving the SVG dispatcher (canonical, the
 *    richer map: covers 56/57/66/67/77/85/86 and the light-/heavy- variants).
 *  - aster-sports `src/lib/weather/wmo.js` WMO_ICONS (emoji) + WMO_LABELS +
 *    rainWord() — kept for text/email contexts where SVG isn't available.
 *
 * One place for the code→presentation mapping (resolves AP #42 byte-for-byte
 * duplication across useWeather + tournamentWeather + the parish engine).
 */

import type { WeatherIconKey } from "./types.js";

export interface WmoInfo {
  description: string;
  icon: WeatherIconKey; // typed key for the SVG dispatcher (see ./icons)
}

/** Canonical WMO code → { description, SVG-icon key }. From St. Patrick. */
export const WMO_CODES: Record<number, WmoInfo> = {
  0: { description: "Clear sky", icon: "clear" },
  1: { description: "Mainly clear", icon: "mostly-clear" },
  2: { description: "Partly cloudy", icon: "partly-cloudy" },
  3: { description: "Overcast", icon: "overcast" },
  45: { description: "Foggy", icon: "fog" },
  48: { description: "Rime fog", icon: "fog" },
  51: { description: "Light drizzle", icon: "drizzle" },
  53: { description: "Moderate drizzle", icon: "drizzle" },
  55: { description: "Dense drizzle", icon: "rain" },
  56: { description: "Freezing drizzle", icon: "rain" },
  57: { description: "Dense freezing drizzle", icon: "rain" },
  61: { description: "Slight rain", icon: "light-rain" },
  63: { description: "Moderate rain", icon: "rain" },
  65: { description: "Heavy rain", icon: "heavy-rain" },
  66: { description: "Freezing rain", icon: "rain" },
  67: { description: "Heavy freezing rain", icon: "heavy-rain" },
  71: { description: "Slight snow", icon: "light-snow" },
  73: { description: "Moderate snow", icon: "snow" },
  75: { description: "Heavy snow", icon: "heavy-snow" },
  77: { description: "Snow grains", icon: "snow" },
  80: { description: "Light showers", icon: "light-rain" },
  81: { description: "Moderate showers", icon: "rain" },
  82: { description: "Violent showers", icon: "heavy-rain" },
  85: { description: "Light snow showers", icon: "light-snow" },
  86: { description: "Heavy snow showers", icon: "heavy-snow" },
  95: { description: "Thunderstorm", icon: "thunderstorm" },
  96: { description: "Thunderstorm with hail", icon: "thunderstorm" },
  99: { description: "Severe thunderstorm", icon: "thunderstorm" },
};

/**
 * Lookup with a neutral fallback. Uses "partly-cloudy" rather than a
 * misleading "clear" for unknown codes (St. Patrick choice, preserved).
 */
export function getWeatherInfo(code: number): WmoInfo {
  return WMO_CODES[code] ?? { description: "Unknown", icon: "partly-cloudy" };
}

/** Emoji per WMO code — for plain-text / email / non-SVG surfaces. */
export const WMO_EMOJI: Record<number, string> = {
  0: "☀️",
  1: "🌤️",
  2: "⛅",
  3: "☁️",
  45: "🌫️",
  48: "🌫️",
  51: "🌧️",
  53: "🌧️",
  55: "🌧️",
  56: "🌧️",
  57: "🌧️",
  61: "🌧️",
  63: "🌧️",
  65: "🌧️",
  66: "🌧️",
  67: "🌧️",
  71: "🌨️",
  73: "🌨️",
  75: "🌨️",
  77: "🌨️",
  80: "🌦️",
  81: "🌦️",
  82: "🌦️",
  85: "🌨️",
  86: "🌨️",
  95: "⛈️",
  96: "⛈️",
  99: "⛈️",
};

/** Emoji for a code with a thermometer fallback. */
export function emojiForCode(code: number): string {
  return WMO_EMOJI[code] ?? "🌡️";
}

/** Short labels — for compact strips. From aster-sports WMO_LABELS. */
export const WMO_LABELS: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

export function labelForCode(code: number): string {
  return WMO_LABELS[code] ?? "Unknown";
}

/**
 * Per-code precipitation noun ("55% storms" / "96% rain" / "snow").
 * From aster-sports rainWord().
 */
export function rainWord(code: number): "storms" | "snow" | "rain" {
  if (code >= 95) return "storms";
  if (code >= 71 && code <= 77) return "snow";
  return "rain";
}
