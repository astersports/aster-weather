/**
 * @aster/weather/icons — colorful multi-stop SVG weather icons (React).
 *
 * Verbatim from the St. Patrick `weather-icons/` set (the canonical source).
 * `ColorfulWeatherIcon` is the dispatcher: pass the string `icon` key from
 * `getWeatherInfo(code).icon` (from the core `@aster/weather` WMO map).
 *
 * React is a peer dependency — these render in any React 18/19 app.
 */
export { SunnyIcon, PartlyCloudyIcon, OvercastIcon, FogIcon, DrizzleIcon, RainIcon, } from "./DayIcons.js";
export { HeavyRainIcon, FreezingRainIcon, SnowIcon, ThunderstormIcon, ClearNightIcon, PartlyCloudyNightIcon, } from "./NightAndSevereIcons.js";
export { WindIcon, DropletIcon } from "./UtilityIcons.js";
export { ColorfulWeatherIcon, ROUTED_ICON_KEYS } from "./ColorfulWeatherIcon.js";
export { usePrefersReducedMotion } from "./usePrefersReducedMotion.js";
//# sourceMappingURL=index.js.map