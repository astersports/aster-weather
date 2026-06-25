import { describe, it, expect, beforeEach } from "vitest";
import {
  getDailyForecast,
  clearDailyCache,
  type FetchImpl,
} from "../index.js";

// Stub an Open-Meteo `daily` response with `count` days.
function stubDaily(count: number): FetchImpl {
  const time = Array.from(
    { length: count },
    (_, i) => `2026-06-${String(17 + i).padStart(2, "0")}`,
  );
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      daily: {
        time,
        temperature_2m_max: time.map(() => 81.6),
        temperature_2m_min: time.map(() => 62.3),
        precipitation_probability_max: time.map(() => 40),
        weather_code: time.map(() => 61),
        sunrise: time.map((d) => `${d}T05:21`),
        sunset: time.map((d) => `${d}T20:29`),
      },
    }),
  });
}

describe("getDailyForecast", () => {
  beforeEach(() => clearDailyCache());

  it("maps the Open-Meteo daily shape, rounds temps, parses sun times", async () => {
    const days = await getDailyForecast(
      { lat: 41.13, lon: -73.72 },
      { fetchImpl: stubDaily(7) },
    );
    expect(days).toHaveLength(7);
    const d0 = days[0];
    expect(d0.date).toBe("2026-06-17");
    expect(d0.high).toBe(82); // rounded
    expect(d0.low).toBe(62);
    expect(d0.precipProbabilityMax).toBe(40);
    expect(d0.weatherCode).toBe(61);
    expect(d0.icon).toBe("light-rain");
    expect(d0.description).toBe("Slight rain");
    expect(d0.sunrise).toBe("5:21 AM");
    expect(d0.sunset).toBe("8:29 PM");
  });

  it("returns [] for invalid coordinates without calling fetch", async () => {
    let called = false;
    const spy: FetchImpl = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const days = await getDailyForecast({ lat: 999, lon: 0 }, { fetchImpl: spy });
    expect(days).toEqual([]);
    expect(called).toBe(false);
  });

  it("returns [] (never throws) on a non-ok response", async () => {
    const days = await getDailyForecast(
      { lat: 1, lon: 1 },
      { fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) },
    );
    expect(days).toEqual([]);
  });

  it("returns [] (never throws) on a malformed response shape", async () => {
    const days = await getDailyForecast(
      { lat: 1, lon: 1 },
      { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ daily: {} }) }) },
    );
    expect(days).toEqual([]);
  });

  it("caches per coordinate within the TTL (one fetch for repeat calls)", async () => {
    let calls = 0;
    const counting: FetchImpl = async (url) => {
      calls += 1;
      return stubDaily(4)(url);
    };
    await getDailyForecast({ lat: 41.13, lon: -73.72 }, { fetchImpl: counting });
    await getDailyForecast({ lat: 41.13, lon: -73.72 }, { fetchImpl: counting });
    expect(calls).toBe(1);
    // A different coordinate is a separate cache entry.
    await getDailyForecast({ lat: 40.0, lon: -74.0 }, { fetchImpl: counting });
    expect(calls).toBe(2);
  });
});
