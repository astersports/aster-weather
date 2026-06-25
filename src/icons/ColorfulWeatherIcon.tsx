/**
 * Main weather icon dispatcher — maps icon string to colorful component.
 *
 * NOTE: `WindIcon` and `DropletIcon` (exported from ./index) are NOT reachable
 * through this dispatcher — no WMO icon key routes to them, so a severe-wind or
 * humidity surface that wants them must import + render them directly. Wiring a
 * wind-icon path (e.g. for high-wind event warnings) is deferred to the v0.2.0
 * hybrid build (audit P2-4), not part of this polish pass.
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
