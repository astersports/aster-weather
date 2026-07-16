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
    icon: WeatherIconKey;
}
/** Canonical WMO code → { description, SVG-icon key }. From St. Patrick. */
export declare const WMO_CODES: Record<number, WmoInfo>;
/**
 * Lookup with a neutral fallback. Uses "partly-cloudy" rather than a
 * misleading "clear" for unknown codes (St. Patrick choice, preserved).
 */
export declare function getWeatherInfo(code: number): WmoInfo;
/** Emoji per WMO code — for plain-text / email / non-SVG surfaces. */
export declare const WMO_EMOJI: Record<number, string>;
/** Emoji for a code with a thermometer fallback. */
export declare function emojiForCode(code: number): string;
/** Short labels — for compact strips. From aster-sports WMO_LABELS. */
export declare const WMO_LABELS: Record<number, string>;
export declare function labelForCode(code: number): string;
/**
 * Per-code precipitation noun ("55% storms" / "96% rain" / "snow").
 * From aster-sports rainWord().
 */
export declare function rainWord(code: number): "storms" | "snow" | "rain";
//# sourceMappingURL=wmo.d.ts.map