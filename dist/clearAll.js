/**
 * Clear every in-memory cache and hold of the NWS and NOAA engine: sign-out
 * hygiene and tests. The Open-Meteo caches have their own clear functions
 * (`clearForecastCache`, `clearCurrentCache`, `clearDailyCache`,
 * `clearNowcastCache`), which this does not call.
 */
import { clearPointCache } from "./nws/point.js";
import { clearStationsCache } from "./nws/observations.js";
import { clearGridCache } from "./nws/grid.js";
import { clearHourlyCache } from "./nws/hourly.js";
import { clearDailyCache as clearEngineDailyCache } from "./nws/daily.js";
import { clearAlertsCache } from "./nws/alerts.js";
import { clearNowCache } from "./now.js";
import { clearRadarCache } from "./radar.js";
import { clearSunRefreshes } from "./astro.js";
/** Clear every in-memory cache and hold of the engine (sign-out hygiene, tests). The Open-Meteo caches have their own clear functions. */
export function clearWeatherCaches() {
    clearPointCache();
    clearStationsCache();
    clearGridCache();
    clearHourlyCache();
    clearEngineDailyCache();
    clearNowCache();
    clearAlertsCache();
    clearRadarCache();
    clearSunRefreshes();
}
//# sourceMappingURL=clearAll.js.map