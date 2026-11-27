/**
 * The condition vocabulary for the v0.8.0 engine, and the NWS icon-keyword
 * table that feeds it. Pure: no fetching, no clock.
 */

import type { WeatherIconKey } from "./types.js";

/** Every condition the engine can report. Extends the existing icon keys. */
export type Condition =
  | WeatherIconKey
  | "mostly-cloudy"
  | "wintry-mix"
  | "sleet"
  | "blizzard"
  | "haze"
  | "smoke"
  | "dust"
  | "hot"
  | "cold"
  | "tornado"
  | "tropical-storm";

/**
 * Severity, mildest first. When an NWS icon URL names two sky states (for
 * example `rain,60/rain_showers,40`), the one later in this list wins.
 */
const SEVERITY_ORDER: readonly Condition[] = [
  "clear",
  "mostly-clear",
  "partly-cloudy",
  "mostly-cloudy",
  "overcast",
  "haze",
  "smoke",
  "dust",
  "hot",
  "cold",
  "fog",
  "drizzle",
  "light-rain",
  "rain",
  "heavy-rain",
  "light-snow",
  "snow",
  "heavy-snow",
  "wintry-mix",
  "sleet",
  "freezing-rain",
  "blizzard",
  "thunderstorm",
  "tropical-storm",
  "tornado",
];

const RANK: ReadonlyMap<Condition, number> = new Map(
  SEVERITY_ORDER.map((c, i) => [c, i] as const),
);

/**
 * NWS icon keyword (without a `wind_` prefix) to condition. The `wind_`
 * variants are not listed: the prefix sets `windy` and the rest maps as here.
 */
export const NWS_ICON_CONDITION: Readonly<Record<string, Condition>> = {
  skc: "clear",
  few: "mostly-clear",
  sct: "partly-cloudy",
  bkn: "mostly-cloudy",
  ovc: "overcast",
  fog: "fog",
  rain: "rain",
  rain_showers: "light-rain",
  rain_showers_hi: "light-rain",
  tsra: "thunderstorm",
  tsra_sct: "thunderstorm",
  tsra_hi: "thunderstorm",
  snow: "snow",
  rain_snow: "wintry-mix",
  sleet: "sleet",
  rain_sleet: "sleet",
  snow_sleet: "sleet",
  fzra: "freezing-rain",
  rain_fzra: "freezing-rain",
  snow_fzra: "freezing-rain",
  blizzard: "blizzard",
  haze: "haze",
  smoke: "smoke",
  dust: "dust",
  hot: "hot",
  cold: "cold",
  tornado: "tornado",
  hurricane: "tropical-storm",
  tropical_storm: "tropical-storm",
};

const LABELS: Readonly<Record<Condition, string>> = {
  clear: "Clear",
  "mostly-clear": "Mostly clear",
  "partly-cloudy": "Partly cloudy",
  "mostly-cloudy": "Mostly cloudy",
  overcast: "Overcast",
  haze: "Haze",
  smoke: "Smoke",
  dust: "Dust",
  hot: "Extreme heat",
  cold: "Extreme cold",
  fog: "Fog",
  drizzle: "Drizzle",
  "light-rain": "Light rain",
  rain: "Rain",
  "heavy-rain": "Heavy rain",
  "light-snow": "Light snow",
  snow: "Snow",
  "heavy-snow": "Heavy snow",
  "wintry-mix": "Wintry mix",
  sleet: "Sleet",
  "freezing-rain": "Freezing rain",
  blizzard: "Blizzard",
  thunderstorm: "Thunderstorm",
  "tropical-storm": "Tropical storm",
  tornado: "Tornado",
};

/** A sentence-case, human label for a condition. */
export function conditionLabel(c: Condition): string {
  return LABELS[c];
}

const PRECIP_FROM = RANK.get("drizzle") ?? 0;
const PRECIP_TO = RANK.get("thunderstorm") ?? 0;

/** True for drizzle through thunderstorm, and for a tropical storm. */
export function isPrecipitation(c: Condition | null): boolean {
  if (c === null) return false;
  if (c === "tropical-storm") return true;
  const r = RANK.get(c);
  return r !== undefined && r >= PRECIP_FROM && r <= PRECIP_TO;
}

/** What one NWS icon URL says. Every field is null or false when unknown. */
export interface NwsIconReading {
  condition: Condition | null;
  windy: boolean;
  isDay: boolean | null;
}

function unknownReading(): NwsIconReading {
  return { condition: null, windy: false, isDay: null };
}

/**
 * Read an NWS icon URL, e.g.
 * `https://api.weather.gov/icons/land/day/rain,60/rain_showers,40?size=medium`.
 * Keywords after the time of day are split on `/`, each with an optional
 * `,percent`. The worst known keyword wins; unknown keywords are ignored.
 * Anything that is not a URL with an `icons` segment gives all-null.
 */
export function conditionFromNwsIcon(iconUrl: unknown): NwsIconReading {
  if (typeof iconUrl !== "string") return unknownReading();

  let pathname: string;
  try {
    pathname = new URL(iconUrl).pathname;
  } catch {
    return unknownReading();
  }

  const parts = pathname.split("/").filter((p) => p.length > 0);
  const iconsAt = parts.indexOf("icons");
  if (iconsAt < 0) return unknownReading();

  const timeOfDay = parts[iconsAt + 2];
  const isDay = timeOfDay === "day" ? true : timeOfDay === "night" ? false : null;
  const keywordStart = isDay === null ? iconsAt + 2 : iconsAt + 3;

  let windy = false;
  let worst: Condition | null = null;
  let worstRank = -1;

  for (const segment of parts.slice(keywordStart)) {
    const keyword = segment.split(",")[0] ?? "";
    let base = keyword;
    if (base.startsWith("wind_")) {
      windy = true;
      base = base.slice("wind_".length);
    }
    if (!Object.prototype.hasOwnProperty.call(NWS_ICON_CONDITION, base)) continue;
    const condition = NWS_ICON_CONDITION[base]!;
    const rank = RANK.get(condition) ?? -1;
    if (rank > worstRank) {
      worst = condition;
      worstRank = rank;
    }
  }

  return { condition: worst, windy, isDay };
}
