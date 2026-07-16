import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Main weather icon dispatcher — maps an icon-key string to a colorful
 * component.
 *
 * NOTE: `WindIcon` and `DropletIcon` (exported from ./index) are NOT reachable
 * through this dispatcher — no WMO icon key routes to them, so a severe-wind or
 * humidity surface that wants them must import + render them directly.
 *
 * Accessibility (WX-P2-8): icons default to decorative (`aria-hidden`). Pass
 * `decorative={false}` to expose `role="img"` + a label; if no explicit `label`
 * is given the key is humanized ("partly-cloudy" → "Partly cloudy").
 */
import { SunnyIcon, PartlyCloudyIcon, OvercastIcon, FogIcon, DrizzleIcon, RainIcon } from "./DayIcons.js";
import { HeavyRainIcon, FreezingRainIcon, SnowIcon, ThunderstormIcon, ClearNightIcon, PartlyCloudyNightIcon } from "./NightAndSevereIcons.js";
/**
 * The icon keys with an explicit dispatcher case (i.e. NOT falling to the
 * neutral default). The WMO↔dispatcher parity test (WX-P2-22) cross-checks
 * this against every key the WMO map emits — a new WMO icon key with no case
 * here fails that test instead of silently rendering the neutral fallback.
 */
export const ROUTED_ICON_KEYS = new Set([
    "clear",
    "mostly-clear",
    "partly-cloudy",
    "overcast",
    "fog",
    "drizzle",
    "light-rain",
    "rain",
    "freezing-rain",
    "heavy-rain",
    "light-snow",
    "snow",
    "heavy-snow",
    "thunderstorm",
]);
function humanizeIconKey(key) {
    const spaced = key.replace(/-/g, " ");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
export function ColorfulWeatherIcon({ icon, className = "w-4 h-4", isDay = true, label, decorative = true, }) {
    const resolvedLabel = decorative ? undefined : label ?? humanizeIconKey(icon);
    const base = { className, decorative, label: resolvedLabel, isDay };
    switch (icon) {
        case "clear":
        case "mostly-clear":
            return isDay ? _jsx(SunnyIcon, { ...base }) : _jsx(ClearNightIcon, { ...base });
        case "partly-cloudy":
            return isDay ? _jsx(PartlyCloudyIcon, { ...base }) : _jsx(PartlyCloudyNightIcon, { ...base });
        case "overcast":
            return _jsx(OvercastIcon, { ...base });
        case "fog":
            return _jsx(FogIcon, { ...base });
        case "drizzle":
        case "light-rain":
            return _jsx(DrizzleIcon, { ...base });
        case "rain":
            return _jsx(RainIcon, { ...base });
        case "freezing-rain":
            return _jsx(FreezingRainIcon, { ...base });
        case "heavy-rain":
            return _jsx(HeavyRainIcon, { ...base });
        case "light-snow":
        case "snow":
        case "heavy-snow":
            return _jsx(SnowIcon, { ...base });
        case "thunderstorm":
            return _jsx(ThunderstormIcon, { ...base });
        default:
            // WX-P3-10: neutral fallback (matches core getWeatherInfo unknown →
            // "partly-cloudy"), never a misleading Sunny for an unknown condition.
            return _jsx(OvercastIcon, { ...base });
    }
}
//# sourceMappingURL=ColorfulWeatherIcon.js.map