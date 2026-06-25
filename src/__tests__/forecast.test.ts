import { describe, it, expect, beforeEach } from "vitest";
import {
  fetchForecast,
  getWeatherForEvent,
  clearForecastCache,
  type FetchImpl,
} from "../index.js";

// Build a stub Open-Meteo hourly response in &timeformat=unixtime shape:
// `time` is epoch SECONDS, not a TZ-naive local string.
function stubHourly(startSec: number, count: number): FetchImpl {
  const time = Array.from({ length: count }, (_, i) => startSec + i * 3600);
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      utc_offset_seconds: -4 * 3600,
      hourly: {
        time,
        temperature_2m: time.map(() => 72.4),
        apparent_temperature: time.map(() => 70.1),
        precipitation_probability: time.map(() => 30),
        precipitation: time.map(() => 0),
        weather_code: time.map(() => 61),
        cloud_cover: time.map(() => 50),
        wind_speed_10m: time.map(() => 8.6),
        is_day: time.map(() => 1),
      },
    }),
  });
}

describe("fetchForecast (unixtime → absolute epoch ms)", () => {
  beforeEach(() => clearForecastCache());

  it("maps unixtime seconds to epoch ms and rounds temps", async () => {
    const startSec = Math.floor(Date.now() / 1000);
    const hours = await fetchForecast(
      { lat: 41.13, lon: -73.72 },
      { fetchImpl: stubHourly(startSec, 6) },
    );
    expect(hours).toHaveLength(6);
    expect(hours[0].timestamp).toBe(startSec * 1000);
    expect(hours[0].temperature).toBe(72); // rounded
    expect(hours[0].weatherCode).toBe(61);
    expect(hours[0].isDay).toBe(true);
  });

  it("returns [] for invalid coordinates without calling fetch", async () => {
    let called = false;
    const spy: FetchImpl = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const hours = await fetchForecast({ lat: 999, lon: 0 }, { fetchImpl: spy });
    expect(hours).toEqual([]);
    expect(called).toBe(false);
  });

  it("returns [] (never throws) on a non-ok response", async () => {
    const hours = await fetchForecast(
      { lat: 1, lon: 1 },
      { fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) },
    );
    expect(hours).toEqual([]);
  });

  it("caches per coordinate within the TTL (one fetch for repeat calls)", async () => {
    const startSec = Math.floor(Date.now() / 1000);
    let calls = 0;
    const counting: FetchImpl = async (url) => {
      calls += 1;
      return stubHourly(startSec, 4)(url);
    };
    await fetchForecast({ lat: 41.13, lon: -73.72 }, { fetchImpl: counting });
    await fetchForecast({ lat: 41.13, lon: -73.72 }, { fetchImpl: counting });
    expect(calls).toBe(1);
    // A different coordinate is a separate cache entry.
    await fetchForecast({ lat: 40.0, lon: -74.0 }, { fetchImpl: counting });
    expect(calls).toBe(2);
  });
});

describe("getWeatherForEvent", () => {
  beforeEach(() => clearForecastCache());

  it("enriches an event 2h out with a venue-local labelled strip", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const eventISO = new Date((nowSec + 2 * 3600) * 1000).toISOString();
    const ew = await getWeatherForEvent(
      { lat: 41.13, lon: -73.72 },
      eventISO,
      { fetchImpl: stubHourly(nowSec, 12) },
    );
    expect(ew).not.toBeNull();
    expect(ew!.temperature).toBe(72);
    expect(ew!.description).toBe("Slight rain");
    expect(ew!.icon).toBe("light-rain");
    expect(ew!.forecastStrip.length).toBeGreaterThan(0);
    expect(["Morning", "Afternoon", "Evening", "Night"]).toContain(
      ew!.forecastStrip[0].label,
    );
  });

  it("returns null for an event beyond the 7-day horizon", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const eventISO = new Date(Date.now() + 9 * 86400000).toISOString();
    const ew = await getWeatherForEvent(
      { lat: 41.13, lon: -73.72 },
      eventISO,
      { fetchImpl: stubHourly(nowSec, 24) },
    );
    expect(ew).toBeNull();
  });
});
