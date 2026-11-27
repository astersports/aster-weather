/**
 * Type-level checks for the public surface. `pnpm run check` type-checks this
 * file (tsconfig excludes `*.test.ts`), so a missing or renamed export fails
 * the check. Nothing here runs at test time.
 */
import type {
  AmountBlock,
  Condition,
  DailyResult,
  DayReading,
  EchoIntensity,
  EngineOptions,
  EventReading,
  HourReading,
  HourlyResult,
  MoonPhase,
  NowReading,
  NwsIconReading,
  RadarFrame,
  RadarRain,
  ReadingKind,
  Stamp,
  SunTimes,
  WeatherAlert,
  AlertsReading,
  WeatherReport,
  WeatherStore,
} from "../index.js";
import { getWeather } from "../index.js";

/** Every new type, used once. A name missing from the index fails this file. */
export type PublicTypeUses = [
  Condition,
  NwsIconReading,
  ReadingKind,
  Stamp,
  EngineOptions,
  WeatherStore,
  NowReading,
  HourReading,
  AmountBlock,
  HourlyResult,
  DayReading,
  DailyResult,
  WeatherAlert,
  AlertsReading,
  EchoIntensity,
  RadarFrame,
  RadarRain,
  SunTimes,
  MoonPhase,
  EventReading,
  WeatherReport,
];

/**
 * The browser store from README section 14, as written there. It must satisfy
 * `WeatherStore`. Storage that is off or full is treated as a miss, not an error.
 */
export const localStorageStore: WeatherStore = {
  async get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage is off or full: the last-good store is best effort.
    }
  },
};

/** The quick start from README section 3, as written there. */
export async function quickStart(): Promise<string> {
  const report = await getWeather({ lat: 41.03, lon: -73.76 }, { store: localStorageStore });
  if (report === null) return "outside US coverage";
  const now = report.now;
  if (now === null || now.temperature === null) return "no current reading";
  const when = new Date(now.stamp.at).toISOString();
  return now.stamp.kind === "observed"
    ? `${now.temperature} F, measured at ${when}`
    : `${now.temperature} F, forecast for ${when}`;
}
