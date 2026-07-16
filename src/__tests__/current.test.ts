import { describe, it, expect, beforeEach } from "vitest";
import {
  getCurrentWeather,
  clearCurrentCache,
  type FetchImpl,
} from "../index.js";

// Stub an Open-Meteo `current` + `daily` (sunrise/sunset) response.
function stubCurrent(overrides: Record<string, unknown> = {}): FetchImpl {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      utc_offset_seconds: -4 * 3600,
      current: {
        time: "2026-06-17T15:45",
        temperature_2m: 72.4,
        apparent_temperature: 70.1,
        weather_code: 61,
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
      ...overrides,
    }),
  });
}

describe("getCurrentWeather", () => {
  beforeEach(() => clearCurrentCache());

  it("maps the Open-Meteo current shape, rounds temps, parses sun times", async () => {
    const cw = await getCurrentWeather(
      { lat: 41.13, lon: -73.72 },
      { fetchImpl: stubCurrent() },
    );
    expect(cw).not.toBeNull();
    expect(cw!.temperature).toBe(72); // rounded
    expect(cw!.feelsLike).toBe(70);
    expect(cw!.weatherCode).toBe(61);
    expect(cw!.description).toBe("Slight rain");
    expect(cw!.icon).toBe("light-rain");
    expect(cw!.windSpeed).toBe(9);
    expect(cw!.windGusts).toBe(15); // WX-P2-4
    expect(cw!.windDirection).toBe(213); // v0.4.0, rounded
    expect(cw!.precipitation).toBe(0.02); // v0.4.0
    expect(cw!.isDay).toBe(true);
    expect(cw!.humidity).toBe(55);
    expect(cw!.sunrise).toBe("5:21 AM");
    expect(cw!.sunset).toBe("8:29 PM");
    // WX-P2-5: observedAt = 15:45 local at offset -4h = 19:45 UTC.
    expect(cw!.observedAt).toBe(Date.UTC(2026, 5, 17, 19, 45, 0));
  });

  it("returns null for invalid coordinates without calling fetch", async () => {
    let called = false;
    const spy: FetchImpl = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const cw = await getCurrentWeather({ lat: 999, lon: 0 }, { fetchImpl: spy });
    expect(cw).toBeNull();
    expect(called).toBe(false);
  });

  it("returns null (never throws) on a non-ok response", async () => {
    const cw = await getCurrentWeather(
      { lat: 1, lon: 1 },
      { fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) },
    );
    expect(cw).toBeNull();
  });

  it("returns null (never throws) on a malformed response shape", async () => {
    const cw = await getCurrentWeather(
      { lat: 1, lon: 1 },
      { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ current: {} }) }) },
    );
    expect(cw).toBeNull();
  });

  it("caches per coordinate within the TTL (one fetch for repeat calls)", async () => {
    let calls = 0;
    const counting: FetchImpl = async (url) => {
      calls += 1;
      return stubCurrent()(url);
    };
    await getCurrentWeather({ lat: 41.13, lon: -73.72 }, { fetchImpl: counting });
    await getCurrentWeather({ lat: 41.13, lon: -73.72 }, { fetchImpl: counting });
    expect(calls).toBe(1);
    // A different coordinate is a separate cache entry.
    await getCurrentWeather({ lat: 40.0, lon: -74.0 }, { fetchImpl: counting });
    expect(calls).toBe(2);
  });
});
