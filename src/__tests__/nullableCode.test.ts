import { describe, it, expect, beforeEach } from "vitest";
import {
  getCurrentWeather,
  clearCurrentCache,
  fetchForecast,
  getWeatherForEvent,
  clearForecastCache,
  getDailyForecast,
  clearDailyCache,
  getWeatherInfo,
  weatherInfoOrNull,
  type FetchImpl,
} from "../index.js";

// A stub that answers any Open-Meteo call with the given JSON body.
function stubJson(body: unknown): FetchImpl {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

// Open-Meteo `current` + `daily` (sunrise/sunset) response with one code.
function currentBody(weatherCode: unknown): unknown {
  return {
    utc_offset_seconds: -4 * 3600,
    current: {
      time: "2026-06-17T15:45",
      temperature_2m: 72.4,
      apparent_temperature: 70.1,
      weather_code: weatherCode,
      wind_speed_10m: 8.6,
      wind_gusts_10m: 15.2,
      wind_direction_10m: 213.4,
      precipitation: 0.02,
      is_day: 1,
      relative_humidity_2m: 55,
    },
    daily: {
      sunrise: ["2026-06-17T05:21"],
      sunset: ["2026-06-17T20:29"],
    },
  };
}

describe("nullable weather code: current conditions", () => {
  beforeEach(() => clearCurrentCache());

  it("keeps a real code 0 as clear sky", async () => {
    const r = await getCurrentWeather(
      { lat: 41.13, lon: -73.72 },
      { fetchImpl: stubJson(currentBody(0)) },
    );
    expect(r).not.toBeNull();
    expect(r!.weatherCode).toBe(0);
    expect(r!.icon).toBe("clear");
    expect(r!.description).toBe("Clear sky");
  });

  it.each([undefined, null, "3", NaN])(
    "reports code %s as unknown (null, never clear sky)",
    async (code) => {
      const r = await getCurrentWeather(
        { lat: 41.13, lon: -73.72 },
        { fetchImpl: stubJson(currentBody(code)) },
      );
      expect(r).not.toBeNull();
      expect(r!.weatherCode).toBeNull();
      expect(r!.icon).toBeNull();
      expect(r!.description).toBeNull();
    },
  );

  it("keeps a number that is not a WMO code, with no invented icon", async () => {
    const r = await getCurrentWeather(
      { lat: 41.13, lon: -73.72 },
      { fetchImpl: stubJson(currentBody(4)) },
    );
    expect(r).not.toBeNull();
    expect(r!.weatherCode).toBe(4);
    expect(r!.icon).toBeNull();
    expect(r!.description).toBeNull();
  });
});

describe("nullable weather code: pure helpers", () => {
  it("weatherInfoOrNull returns null for missing or non-WMO codes, and the entry otherwise", () => {
    expect(weatherInfoOrNull(null)).toBeNull();
    expect(weatherInfoOrNull(undefined)).toBeNull();
    expect(weatherInfoOrNull(4)).toBeNull();
    expect(weatherInfoOrNull(3)).toEqual({
      description: "Overcast",
      icon: "overcast",
    });
    // Legacy helper is unchanged: unknown code still maps to "Unknown".
    expect(getWeatherInfo(4)).toEqual({
      description: "Unknown",
      icon: "partly-cloudy",
    });
  });
});

describe("nullable weather code: hourly forecast", () => {
  beforeEach(() => clearForecastCache());

  it("a null hourly entry is unknown; a missing weather_code array is unknown for every hour", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const time = [nowSec, nowSec + 3600];
    const withNull = await fetchForecast(
      { lat: 41.13, lon: -73.72 },
      {
        fetchImpl: stubJson({
          utc_offset_seconds: -4 * 3600,
          hourly: {
            time,
            temperature_2m: [72.4, 72.4],
            weather_code: [0, null],
          },
        }),
      },
    );
    expect(withNull[0].weatherCode).toBe(0);
    expect(withNull[1].weatherCode).toBeNull();

    clearForecastCache();
    const noArray = await fetchForecast(
      { lat: 40.0, lon: -74.0 },
      {
        fetchImpl: stubJson({
          utc_offset_seconds: -4 * 3600,
          hourly: {
            time,
            temperature_2m: [72.4, 72.4],
          },
        }),
      },
    );
    expect(noArray.every((h) => h.weatherCode === null)).toBe(true);
  });
});

describe("nullable weather code: daily forecast", () => {
  beforeEach(() => clearDailyCache());

  it("a null daily code gives a null code, icon and description", async () => {
    const d = await getDailyForecast(
      { lat: 41.13, lon: -73.72 },
      {
        fetchImpl: stubJson({
          daily: {
            time: ["2026-06-17"],
            temperature_2m_max: [81.6],
            temperature_2m_min: [62.3],
            weather_code: [null],
            sunrise: ["2026-06-17T05:21"],
            sunset: ["2026-06-17T20:29"],
          },
        }),
      },
    );
    expect(d).toHaveLength(1);
    expect(d[0].weatherCode).toBeNull();
    expect(d[0].icon).toBeNull();
    expect(d[0].description).toBeNull();
  });
});

describe("nullable weather code: event enrichment", () => {
  beforeEach(() => clearForecastCache());

  it("a null code on the matched hour keeps the warning flags and the strip working", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const time = Array.from({ length: 12 }, (_, i) => nowSec + i * 3600);
    const eventISO = new Date((nowSec + 2 * 3600) * 1000).toISOString();
    const ew = await getWeatherForEvent(
      { lat: 41.13, lon: -73.72 },
      eventISO,
      {
        fetchImpl: stubJson({
          utc_offset_seconds: -4 * 3600,
          hourly: {
            time,
            temperature_2m: time.map(() => 72.4),
            apparent_temperature: time.map(() => 70.1),
            precipitation_probability: time.map(() => 80),
            precipitation: time.map(() => 0.1),
            weather_code: time.map(() => null),
            cloud_cover: time.map(() => 90),
            wind_speed_10m: time.map(() => 8.6),
            wind_gusts_10m: time.map(() => 50),
            is_day: time.map(() => 1),
          },
        }),
      },
    );
    expect(ew).not.toBeNull();
    expect(ew!.weatherCode).toBeNull();
    expect(ew!.icon).toBeNull();
    expect(ew!.description).toBeNull();
    expect(ew!.isRainWarning).toBe(true);
    expect(ew!.isSevereWarning).toBe(true);
    expect(ew!.forecastStrip.length).toBeGreaterThan(0);
    expect(ew!.forecastStrip.every((s) => s.icon === null)).toBe(true);
    expect(ew!.forecastStrip.every((s) => s.weatherCode === null)).toBe(true);
  });
});
