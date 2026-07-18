/**
 * Sky icon system — condition → sky tint (ICON_SYSTEM_SKY_BUILD_SPEC §3, §5).
 *
 * THE CONTRAST RULE (measured, non-negotiable): weather renders only on a sky
 * surface at or darker than #2E5A8C — the floor where the white cloud (7.1:1),
 * gold sun (4.7:1) and raindrop (3.29:1, the binding constraint) all clear WCAG
 * 1.4.11's 3:1. Every tint below is at or below that floor. The panel travels
 * with the component (SkyPanel), so a cream page and a navy app get identical,
 * guaranteed contrast from ONE palette — no theme fork.
 *
 * Refinement on the spec's §6 (flagged for the architect): SKY_TINTS is keyed by
 * `SkyCondition` (17), NOT `WeatherIconKey` (14) — the three night variants carry
 * distinct, darker tints (clear #4E80B4 by day vs #1E3358 at night), so they need
 * their own keys. Components take the engine-native `WeatherIconKey` + `isDay`
 * and resolve to a `SkyCondition` via `skyConditionFor`.
 */
import type { WeatherIconKey } from "../types.js";
/** The 17-key render vocabulary: the 14 WMO keys + three night variants. */
export type SkyCondition = WeatherIconKey | "clear-night" | "partly-cloudy-night" | "snow-night";
/** Every SkyCondition, in canonical order (drives the exhaustiveness test). */
export declare const SKY_CONDITIONS: readonly SkyCondition[];
/**
 * condition → [from, to] gradient stops (rendered at 168°). Every value is at or
 * below the #2E5A8C floor; storm + night are darkest by physics and by contrast.
 * Typed Record so a new SkyCondition fails to compile until it has a tint.
 */
export declare const SKY_TINTS: Record<SkyCondition, readonly [string, string]>;
/** The measured contrast floor. Panels are never lighter than this. */
export declare const SKY_FLOOR = "#2E5A8C";
/**
 * Resolve the engine's WMO icon key (+ whether it is daytime) to the 17-key
 * render vocabulary. Night art exists only for clear / partly-cloudy / snow;
 * every other condition looks the same after dark (on its already-dark sky).
 */
export declare function skyConditionFor(icon: WeatherIconKey, isDay?: boolean): SkyCondition;
/** The CSS `background` value for a condition's sky (168° gradient). */
export declare function skyGradient(cond: SkyCondition): string;
/** The 14 WMO-routable keys — the WMO map ↔ dispatcher parity set (WX-P2-22). */
export declare const ROUTED_ICON_KEYS: ReadonlySet<string>;
//# sourceMappingURL=skyTints.d.ts.map