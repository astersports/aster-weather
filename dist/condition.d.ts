/**
 * The condition vocabulary for the v0.8.0 engine, and the NWS icon-keyword
 * table that feeds it. Pure: no fetching, no clock.
 */
import type { WeatherIconKey } from "./types.js";
/** Every condition the engine can report. Extends the existing icon keys. */
export type Condition = WeatherIconKey | "mostly-cloudy" | "wintry-mix" | "sleet" | "blizzard" | "haze" | "smoke" | "dust" | "hot" | "cold" | "tornado" | "tropical-storm";
/**
 * NWS icon keyword (without a `wind_` prefix) to condition. The `wind_`
 * variants are not listed: the prefix sets `windy` and the rest maps as here.
 */
export declare const NWS_ICON_CONDITION: Readonly<Record<string, Condition>>;
/** A sentence-case, human label for a condition. */
export declare function conditionLabel(c: Condition): string;
/** True for drizzle through thunderstorm, and for a tropical storm. */
export declare function isPrecipitation(c: Condition | null): boolean;
/** What one NWS icon URL says. Every field is null or false when unknown. */
export interface NwsIconReading {
    condition: Condition | null;
    windy: boolean;
    isDay: boolean | null;
}
/**
 * Read an NWS icon URL, e.g.
 * `https://api.weather.gov/icons/land/day/rain,60/rain_showers,40?size=medium`.
 * Keywords after the time of day are split on `/`, each with an optional
 * `,percent`. The worst known keyword wins; unknown keywords are ignored.
 * Anything that is not a URL with an `icons` segment gives all-null.
 */
export declare function conditionFromNwsIcon(iconUrl: unknown): NwsIconReading;
//# sourceMappingURL=condition.d.ts.map