import { describe, it, expect } from "vitest";
import {
  getWeatherInfo,
  emojiForCode,
  labelForCode,
  rainWord,
  isWithinForecastWindow,
  parsePrecip,
  weatherLocationFrom,
  coordsForEvent,
  getWeatherForTime,
  isValidCoord,
  type HourlyForecast,
} from "../index.js";

describe("wmo maps", () => {
  it("maps known codes to description + svg icon key", () => {
    expect(getWeatherInfo(0)).toEqual({ description: "Clear sky", icon: "clear" });
    expect(getWeatherInfo(65)).toEqual({ description: "Heavy rain", icon: "heavy-rain" });
    expect(getWeatherInfo(95).icon).toBe("thunderstorm");
  });
  it("falls back to partly-cloudy (not a misleading clear) for unknown codes", () => {
    expect(getWeatherInfo(1234)).toEqual({ description: "Unknown", icon: "partly-cloudy" });
  });
  it("emoji has a thermometer fallback", () => {
    expect(emojiForCode(0)).toBe("☀️");
    expect(emojiForCode(1234)).toBe("🌡️");
  });
  it("labels fall back to Unknown", () => {
    expect(labelForCode(0)).toBe("Clear");
    expect(labelForCode(1234)).toBe("Unknown");
  });
  it("rainWord picks the right noun per code band", () => {
    expect(rainWord(63)).toBe("rain");
    expect(rainWord(73)).toBe("snow");
    expect(rainWord(95)).toBe("storms");
    expect(rainWord(99)).toBe("storms");
  });
});

describe("isWithinForecastWindow", () => {
  const now = 1_000_000_000_000;
  it("true inside the window", () => {
    expect(isWithinForecastWindow(now + 2 * 86400000, now, 10)).toBe(true);
  });
  it("false in the past", () => {
    expect(isWithinForecastWindow(now - 1000, now, 10)).toBe(false);
  });
  it("false beyond the window", () => {
    expect(isWithinForecastWindow(now + 11 * 86400000, now, 10)).toBe(false);
  });
  it("false for an invalid date", () => {
    expect(isWithinForecastWindow("not-a-date", now, 10)).toBe(false);
  });
});

describe("parsePrecip", () => {
  it("parses pct + kind", () => {
    expect(parsePrecip("55% rain")).toEqual({ pct: 55, kind: "rain" });
    expect(parsePrecip("96% storms")).toEqual({ pct: 96, kind: "storms" });
    expect(parsePrecip("80% snow")).toEqual({ pct: 80, kind: "snow" });
  });
  it("returns nulls (never fabricates) on bad input", () => {
    expect(parsePrecip("")).toEqual({ pct: null, kind: null });
    expect(parsePrecip(null)).toEqual({ pct: null, kind: null });
    expect(parsePrecip(42)).toEqual({ pct: null, kind: null });
  });
});

describe("coordsForEvent / weatherLocationFrom", () => {
  const locations = {
    a: { lat: null, lon: null, address: "No Coords, Nowhere" },
    b: { lat: 41.1, lon: -73.7, address: "123 Main St, Armonk, NY", name: "WCC" },
  };
  it("picks the first event-location carrying coords + city heuristic", () => {
    const anchor = weatherLocationFrom([{ location_id: "a" }, { location_id: "b" }], locations);
    expect(anchor).toEqual({ lat: 41.1, lon: -73.7, city: "Armonk" });
  });
  it("returns null when no event location has coords", () => {
    expect(weatherLocationFrom([{ location_id: "a" }], locations)).toBeNull();
  });
  it("coordsForEvent falls back to orgDefault", () => {
    expect(coordsForEvent([], locations, [10, 20])).toEqual([10, 20]);
    expect(coordsForEvent([{ location_id: "a" }], locations, [10, 20])).toEqual([10, 20]);
  });
  it("coordsForEvent returns the anchor tuple when present", () => {
    expect(coordsForEvent([{ location_id: "b" }], locations, [10, 20])).toEqual([41.1, -73.7]);
  });
});

describe("isValidCoord", () => {
  it("accepts in-range coords", () => {
    expect(isValidCoord(41.1, -73.7)).toBe(true);
  });
  it("rejects out-of-range / non-finite", () => {
    expect(isValidCoord(91, 0)).toBe(false);
    expect(isValidCoord(0, 181)).toBe(false);
    expect(isValidCoord(NaN, 0)).toBe(false);
  });
});

describe("getWeatherForTime (absolute epoch matcher)", () => {
  const base = 1_700_000_000_000;
  const hours: HourlyForecast[] = [0, 1, 2, 3].map((i) => ({
    timestamp: base + i * 3600_000,
    temperature: 60 + i,
    apparentTemperature: 60 + i,
    precipitationProbability: 0,
    precipitation: 0,
    weatherCode: 0,
    cloudCover: 0,
    windSpeed: 5,
    isDay: true,
  }));
  it("returns the closest hour within the window", () => {
    const m = getWeatherForTime(hours, base + 3600_000 + 60_000);
    expect(m?.temperature).toBe(61);
  });
  it("returns null when nearest hour is outside the 2h window", () => {
    expect(getWeatherForTime(hours, base + 10 * 3600_000)).toBeNull();
  });
  it("guards empty / invalid input", () => {
    expect(getWeatherForTime([], base)).toBeNull();
    expect(getWeatherForTime(hours, "nope")).toBeNull();
  });
});
