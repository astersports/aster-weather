import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import * as api from "../index.js";
import { clearDailyCache as clearEngineDailyCache } from "../nws/daily.js";
import { setRetrySleep } from "../helpers.js";
import type { FetchImpl } from "../types.js";

/**
 * The public surface of `@aster/weather`. The sorted runtime export list is
 * written out here, so an accidental export or a removed one fails this test.
 * Type-level checks live in `publicSurface.types.ts`, because `tsc` for `check`
 * excludes `*.test.ts`.
 */

const EXPECTED_RUNTIME_EXPORTS = [
  // types.ts constants
  "FETCH_RETRY_BACKOFF_MS",
  "FETCH_RETRY_COUNT",
  "FETCH_TIMEOUT_MS",
  "FORECAST_DAYS",
  "DEFAULT_FORECAST_WINDOW_DAYS",
  "HOURLY_MATCH_WINDOW_MS",
  "MAX_FORECAST_HOUR_GAP_MS",
  "SEVERE_GUST_MPH",
  "SEVERE_WIND_MPH",
  // wmo.ts
  "WMO_CODES",
  "WMO_EMOJI",
  "WMO_LABELS",
  "emojiForCode",
  "getWeatherInfo",
  "labelForCode",
  "rainWord",
  "weatherInfoOrNull",
  // helpers.ts
  "isValidCoord",
  "parseOpenMeteoLocalTime",
  // Open-Meteo fetchers (deprecated)
  "clearCurrentCache",
  "clearDailyCache",
  "clearForecastCache",
  "clearNowcastCache",
  "fetchForecast",
  "getCurrentWeather",
  "getDailyForecast",
  "getNowcast",
  "getWeatherForEvent",
  "getWeatherForTime",
  // coordsForEvent.ts, forecastWindow.ts, parsePrecip.ts
  "coordsForEvent",
  "isWithinForecastWindow",
  "parsePrecip",
  "weatherLocationFrom",
  // NWS and NOAA engine (v0.8.0)
  "ALERT_MAX_STALE_MS",
  "FRESH_MS",
  "GRID_RETRY_AFTER_MS",
  "MAX_AGE_MS",
  "MAX_FRAME_AGE_MS",
  "MAX_OBSERVATION_AGE_MS",
  "NWS_ICON_CONDITION",
  "POINT_RETRY_AFTER_MS",
  "RADAR_RETRY_AFTER_MS",
  "RADAR_TIMEOUT_MS",
  "SUN_REFRESH_AFTER_MS",
  "clearWeatherCaches",
  "conditionFromNwsIcon",
  "conditionLabel",
  "getAlerts",
  "getAlertsReading",
  "getDaily",
  "getEventWeather",
  "getHourly",
  "getMoon",
  "getNow",
  "getRadarRain",
  "getSun",
  "getWeather",
  "isPrecipitation",
];

/** Engine names that must never be exported. */
const INTERNAL_NAMES = [
  "lookupPoint",
  "getPoint",
  "evictPoint",
  "getGrid",
  "getStations",
  "getLatestObservation",
  "nwsJson",
  "NWS_API",
  "NOAA_MAPS",
  "readLastGood",
  "writeLastGood",
  "localDay",
  "cToF",
  "kmhToMph",
  "mmToIn",
  "mToFt",
  "mToMi",
  "paToInHg",
  "classifyEcho",
  "parseRadarFrames",
  "resolveRadar",
  "rainClaimFrom",
  "radarCondition",
  "applyRadarToNow",
  "applyRadarToToday",
  "startRadarRain",
  "radarTimeoutMs",
  "SATURATED_HUMIDITY",
  "BRIDGE_FRAMES",
  "clearSunRefreshes",
  "safeReport",
  "setRetrySleep",
  "clearPointCache",
  "clearStationsCache",
  "clearGridCache",
  "clearHourlyCache",
  "clearNowCache",
  "clearAlertsCache",
  "clearRadarCache",
];

const NEW_FUNCTIONS = [
  "getWeather",
  "getNow",
  "getHourly",
  "getDaily",
  "getAlerts",
  "getAlertsReading",
  "getRadarRain",
  "getSun",
  "getMoon",
  "getEventWeather",
  "conditionFromNwsIcon",
  "conditionLabel",
  "isPrecipitation",
  "clearWeatherCaches",
] as const;

const NEW_CONSTANTS = [
  "MAX_AGE_MS",
  "FRESH_MS",
  "MAX_OBSERVATION_AGE_MS",
  "ALERT_MAX_STALE_MS",
  "MAX_FRAME_AGE_MS",
  "RADAR_TIMEOUT_MS",
  "RADAR_RETRY_AFTER_MS",
  "GRID_RETRY_AFTER_MS",
  "SUN_REFRESH_AFTER_MS",
  "POINT_RETRY_AFTER_MS",
  "NWS_ICON_CONDITION",
] as const;

// ---- fixtures and a stub network, as in weather.test.ts ----

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/nws/${name}`, import.meta.url), "utf8")) as any;
const points = load("points.json");
const stations = load("stations.json");
const observation = load("observation.json");
const hourly = load("hourly.json");
const grid = load("grid.json");
const forecast = load("forecast.json");
const alerts = load("alerts.json");
const radar = load("radar-identify.json");

const C = { lat: 41.03, lon: -73.76 };
const NOW = 1795787700000;
const POINT_URL = "https://api.weather.gov/points/41.03,-73.76";
const STATIONS_URL = "https://api.weather.gov/gridpoints/OKX/39,58/stations";
const HOURLY_URL = "https://api.weather.gov/gridpoints/OKX/39,58/forecast/hourly";
const GRID_URL = "https://api.weather.gov/gridpoints/OKX/39,58";
const FORECAST_URL = "https://api.weather.gov/gridpoints/OKX/39,58/forecast";
const OBS_KHPN = "https://api.weather.gov/stations/KHPN/observations/latest";
const ALERTS = "https://api.weather.gov/alerts/active*";
const RADAR = "https://mapservices.weather.noaa.gov/*";

type Reply = { status: number; body: unknown };

/** A stub by exact URL; a key ending in `*` matches any URL with that prefix. */
function router(script: Record<string, Reply>) {
  const calls: string[] = [];
  const fetchImpl: FetchImpl = async (url) => {
    calls.push(url);
    const key = Object.keys(script).find((k) =>
      k.endsWith("*") ? url.startsWith(k.slice(0, -1)) : url === k,
    );
    const r: Reply = key === undefined ? { status: 404, body: {} } : script[key]!;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { calls, fetchImpl };
}

const ok = (body: unknown): Reply => ({ status: 200, body });

function healthy() {
  return router({
    [POINT_URL]: ok(points),
    [STATIONS_URL]: ok(stations),
    [OBS_KHPN]: ok(observation),
    [HOURLY_URL]: ok(hourly),
    [GRID_URL]: ok(grid),
    [FORECAST_URL]: ok(forecast),
    [ALERTS]: ok(alerts),
    [RADAR]: ok(radar),
  });
}

beforeEach(() => {
  api.clearWeatherCaches();
  setRetrySleep(async () => {});
});
afterEach(() => setRetrySleep(null));

describe("public surface: exports", () => {
  it("exports exactly the listed runtime names, sorted", () => {
    const actual = Object.keys(api).sort();
    expect(actual).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
  });

  it("exports each new function as a function", () => {
    for (const name of NEW_FUNCTIONS) {
      expect(typeof (api as Record<string, unknown>)[name], name).toBe("function");
    }
  });

  it("exports each new constant as defined", () => {
    for (const name of NEW_CONSTANTS) {
      expect((api as Record<string, unknown>)[name], name).toBeDefined();
    }
  });

  it("keeps the Open-Meteo functions exported and deprecated names unchanged", () => {
    for (const name of [
      "fetchForecast",
      "getCurrentWeather",
      "getDailyForecast",
      "getNowcast",
      "getWeatherForEvent",
    ]) {
      expect(typeof (api as Record<string, unknown>)[name], name).toBe("function");
    }
  });

  it("does not export any engine internal", () => {
    for (const name of INTERNAL_NAMES) {
      expect((api as Record<string, unknown>)[name], name).toBeUndefined();
    }
  });

  it("exports the Open-Meteo clearDailyCache, not the engine's", () => {
    // Same name, two functions: the public one is the Open-Meteo cache's.
    expect(api.clearDailyCache).toBeDefined();
    expect(api.clearDailyCache).not.toBe(clearEngineDailyCache);
  });
});

describe("public surface: the one-call report through the public entry", () => {
  it("getWeather returns the fixture point's place from the public entry", async () => {
    const w = await api.getWeather(C, { fetchImpl: healthy().fetchImpl, now: () => NOW });
    expect(w).not.toBeNull();
    expect(w!.place.city).toBe("White Plains");
    expect(w!.place.state).toBe("NY");
    expect(w!.place.timeZone).toBe("America/New_York");
  });
});

describe("clearWeatherCaches", () => {
  it("makes the next getWeather ask the network again", async () => {
    const h = healthy();
    const opts = { fetchImpl: h.fetchImpl, now: () => NOW, radar: false };

    await api.getWeather(C, opts);
    const afterFirst = h.calls.length;
    expect(h.calls.filter((u) => u === POINT_URL)).toHaveLength(1);

    // Warm: every part is cached, so no request is made.
    await api.getWeather(C, opts);
    expect(h.calls).toHaveLength(afterFirst);

    api.clearWeatherCaches();
    await api.getWeather(C, opts);
    expect(h.calls.length).toBeGreaterThan(afterFirst);
    expect(h.calls.filter((u) => u === POINT_URL)).toHaveLength(2);
    expect(h.calls.filter((u) => u === STATIONS_URL)).toHaveLength(2);
  });
});
