import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Main weather icon dispatcher — maps icon string to colorful component.
 */
import { SunnyIcon, PartlyCloudyIcon, OvercastIcon, FogIcon, DrizzleIcon, RainIcon } from "./DayIcons.js";
import { HeavyRainIcon, SnowIcon, ThunderstormIcon, ClearNightIcon, PartlyCloudyNightIcon } from "./NightAndSevereIcons.js";
export function ColorfulWeatherIcon({ icon, className = "w-4 h-4", isDay = true }) {
    switch (icon) {
        case "clear":
        case "mostly-clear":
            return isDay ? _jsx(SunnyIcon, { className: className }) : _jsx(ClearNightIcon, { className: className });
        case "partly-cloudy":
            return isDay ? _jsx(PartlyCloudyIcon, { className: className }) : _jsx(PartlyCloudyNightIcon, { className: className });
        case "overcast":
            return _jsx(OvercastIcon, { className: className });
        case "fog":
            return _jsx(FogIcon, { className: className });
        case "drizzle":
        case "light-rain":
            return _jsx(DrizzleIcon, { className: className });
        case "rain":
            return _jsx(RainIcon, { className: className });
        case "heavy-rain":
            return _jsx(HeavyRainIcon, { className: className });
        case "light-snow":
        case "snow":
        case "heavy-snow":
            return _jsx(SnowIcon, { className: className });
        case "thunderstorm":
            return _jsx(ThunderstormIcon, { className: className });
        default:
            return isDay ? _jsx(SunnyIcon, { className: className }) : _jsx(ClearNightIcon, { className: className });
    }
}
//# sourceMappingURL=ColorfulWeatherIcon.js.map