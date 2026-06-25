/**
 * Main weather icon dispatcher — maps icon string to colorful component.
 */

import { SunnyIcon, PartlyCloudyIcon, OvercastIcon, FogIcon, DrizzleIcon, RainIcon } from "./DayIcons.js";
import { HeavyRainIcon, SnowIcon, ThunderstormIcon, ClearNightIcon, PartlyCloudyNightIcon } from "./NightAndSevereIcons.js";

export function ColorfulWeatherIcon({ icon, className = "w-4 h-4", isDay = true }: { icon: string; className?: string; isDay?: boolean }) {
  switch (icon) {
    case "clear":
    case "mostly-clear":
      return isDay ? <SunnyIcon className={className} /> : <ClearNightIcon className={className} />;
    case "partly-cloudy":
      return isDay ? <PartlyCloudyIcon className={className} /> : <PartlyCloudyNightIcon className={className} />;
    case "overcast":
      return <OvercastIcon className={className} />;
    case "fog":
      return <FogIcon className={className} />;
    case "drizzle":
    case "light-rain":
      return <DrizzleIcon className={className} />;
    case "rain":
      return <RainIcon className={className} />;
    case "heavy-rain":
      return <HeavyRainIcon className={className} />;
    case "light-snow":
    case "snow":
    case "heavy-snow":
      return <SnowIcon className={className} />;
    case "thunderstorm":
      return <ThunderstormIcon className={className} />;
    default:
      return isDay ? <SunnyIcon className={className} /> : <ClearNightIcon className={className} />;
  }
}
