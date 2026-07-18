/**
 * @aster/weather/icons — the "Sky" weather icon system (v0.6.0).
 *
 * Weather renders inside a panel of sky tinted to the condition; the icon is
 * glossy and dimensional and fills its container. The panel is never lighter
 * than #2E5A8C (SKY_FLOOR) — the measured floor where every mark clears WCAG
 * 3:1 — so contrast is guaranteed by construction, one palette, no theme fork.
 *
 *   import { WeatherIcon, SkyPanel } from "@aster/weather/icons";
 *   import { getWeatherInfo } from "@aster/weather";
 *
 *   <SkyPanel condition={getWeatherInfo(code).icon} isDay style={{ borderRadius: 16, padding: 12 }}>
 *     <div style={{ width: 54, height: 54 }}>
 *       <WeatherIcon condition={getWeatherInfo(code).icon} isDay />
 *     </div>
 *   </SkyPanel>
 *
 * Motion is ON by default; `animate={false}` for a static frame and
 * `prefers-reduced-motion` always resolves to static. React is a peer dependency.
 */
export { WeatherIcon } from "./WeatherIcon.js";
export { SkyPanel } from "./SkyPanel.js";
export { SKY_TINTS, SKY_CONDITIONS, SKY_FLOOR, ROUTED_ICON_KEYS, skyConditionFor, skyGradient, } from "./skyTints.js";
export { WEATHER_ART } from "./weatherArt.js";
export { ensureSkyStyles, SKY_KEYFRAMES, SKY_STYLE_ID } from "./skyStyles.js";
export { WindIcon, DropletIcon } from "./UtilityIcons.js";
export { usePrefersReducedMotion } from "./usePrefersReducedMotion.js";
//# sourceMappingURL=index.js.map