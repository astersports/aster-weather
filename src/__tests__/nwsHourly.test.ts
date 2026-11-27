import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getHourly, clearHourlyCache } from "../nws/hourly.js";
import { clearPointCache } from "../nws/point.js";
import { clearGridCache } from "../nws/grid.js";
import { NWS_API } from "../nws/http.js";
import type { WeatherStore } from "../store.js";
import type { FetchImpl, WeatherErrorContext } from "../types.js";

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/nws/${name}`, import.meta.url), "utf8")) as Record<
    string,
    unknown
  >;
const points = load("points.json");
const hourly = load("hourly.json");
const grid = load("grid.json");

const COORDS = { lat: 41.03, lon: -73.76 };
const POINT_URL = `${NWS_API}/points/41.03,-73.76`;
const HOURLY_URL = "https://api.weather.gov/gridpoints/OKX/39,58/forecast/hourly";
const GRID_URL = "https://api.weather.gov/gridpoints/OKX/39,58";
const NOW = 1795787700000;
const STORE_KEY = "aw:hourly:41.03,-73.76";

interface Reply {
  status: number;
  body: unknown;
}

/**
 * A stub that answers by exact URL. A URL may have a queue of replies: each
 * call takes the head, and the last one repeats.
 */
function router(script: Record<string, Reply | Reply[]>) {
  const queues = new Map<string, Reply[]>();
  for (const [url, v] of Object.entries(script)) {
    queues.set(url, Array.isArray(v) ? [...v] : [v]);
  }
  const calls: string[] = [];
  const fetchImpl: FetchImpl = async (url) => {
    calls.push(url);
    const q = queues.get(url);
    const r: Reply = !q ? { status: 404, body: {} } : q.length > 1 ? q.shift()! : q[0]!;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { calls, fetchImpl };
}

const ok = (body: unknown): Reply => ({ status: 200, body });
const fail = (status: number): Reply => ({ status, body: {} });

function happy(extra: Record<string, Reply | Reply[]> = {}) {
  return router({
    [POINT_URL]: ok(points),
    [HOURLY_URL]: ok(hourly),
    [GRID_URL]: ok(grid),
    ...extra,
  });
}

/** A copy of the hourly fixture with one edit to its first period. */
function firstPeriod(edit: (p: Record<string, unknown>) => void) {
  const clone = structuredClone(hourly) as { properties: { periods: Record<string, unknown>[] } };
  edit(clone.properties.periods[0]!);
  return clone;
}

function memoryStore(): WeatherStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    async set(key, value) {
      data.set(key, value);
    },
  };
}

beforeEach(() => {
  clearPointCache();
  clearGridCache();
  clearHourlyCache();
});
afterEach(() => vi.useRealTimers());

describe("getHourly — the recorded fixtures", () => {
  it("returns 30 hours in the point's time zone", async () => {
    const { fetchImpl } = happy();
    const r = await getHourly(COORDS, { fetchImpl, now: () => NOW });
    expect(r).not.toBeNull();
    expect(r!.hours).toHaveLength(30);
    expect(r!.timeZone).toBe("America/New_York");
  });

  it("joins the first hour with the grid", async () => {
    const { fetchImpl } = happy();
    const r = (await getHourly(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(r.hours[0]).toEqual({
      timestamp: 1795784400000,
      isDay: true,
      temperature: 53,
      feelsLike: 53,
      precipProbability: 18,
      windSpeed: 15,
      windDirection: "S",
      windGust: 25,
      cloudCover: 91,
      humidity: 89,
      dewPoint: 50,
      thunderProbability: 0,
      visibility: 5,
      heatStress: 52,
      condition: "light-rain",
      windy: false,
    });
  });

  it("reads the last hour", async () => {
    const { fetchImpl } = happy();
    const r = (await getHourly(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(r.hours[29]).toMatchObject({
      temperature: 51,
      precipProbability: 0,
      windDirection: "W",
      condition: "mostly-cloudy",
      cloudCover: 73,
    });
  });

  it("labels the stamp as a forecast from NWS, not stale, fetched at now", async () => {
    const { fetchImpl } = happy();
    const r = (await getHourly(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(r.stamp).toMatchObject({
      kind: "forecast",
      source: "nws-forecast",
      stale: false,
      fetchedAt: NOW,
    });
  });

  it("builds rain blocks in inches, with the 0.254 mm block at 0.01 in", async () => {
    const { fetchImpl } = happy();
    const r = (await getHourly(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(r.rain[2]).toEqual({
      start: Date.parse("2026-11-27T12:00:00Z"),
      end: Date.parse("2026-11-27T18:00:00Z"),
      inches: 0.01,
    });
  });
});

describe("getHourly — grid failure keeps the hours", () => {
  it("returns 30 hours with every grid field null and empty amounts", async () => {
    vi.useFakeTimers();
    const { fetchImpl } = happy({ [GRID_URL]: fail(500) });
    const pending = getHourly(COORDS, { fetchImpl, now: () => NOW });
    await vi.advanceTimersByTimeAsync(1000);
    const r = (await pending)!;
    expect(r.hours).toHaveLength(30);
    for (const h of r.hours) {
      expect(h.feelsLike).toBeNull();
      expect(h.windGust).toBeNull();
      expect(h.cloudCover).toBeNull();
      expect(h.humidity).toBeNull();
      expect(h.dewPoint).toBeNull();
      expect(h.thunderProbability).toBeNull();
      expect(h.visibility).toBeNull();
      expect(h.heatStress).toBeNull();
    }
    expect(r.rain).toEqual([]);
    expect(r.snow).toEqual([]);
    expect(r.ice).toEqual([]);
  });

  it("reports the grid failure once, as getGrid", async () => {
    vi.useFakeTimers();
    const { fetchImpl } = happy({ [GRID_URL]: fail(500) });
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const pending = getHourly(COORDS, { fetchImpl, onError, now: () => NOW });
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1].call).toBe("getGrid");
  });
});

describe("getHourly — a re-gridded point", () => {
  it("a 404 on the hourly URL evicts the point, looks it up again and retries once", async () => {
    const { calls, fetchImpl } = happy({ [HOURLY_URL]: [fail(404), ok(hourly)] });
    const onError = vi.fn();
    const r = await getHourly(COORDS, { fetchImpl, onError, now: () => NOW });
    expect(r!.hours).toHaveLength(30);
    expect(calls.filter((u) => u === POINT_URL)).toHaveLength(2);
    expect(calls.filter((u) => u === HOURLY_URL)).toHaveLength(2);
    expect(onError.mock.calls.some((c) => c[1].call === "getHourly")).toBe(false);
  });

  it("a 404 on the hourly URL twice gives null and exactly one getHourly onError", async () => {
    vi.useFakeTimers();
    const { fetchImpl } = happy({ [HOURLY_URL]: fail(404) });
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const pending = getHourly(COORDS, { fetchImpl, onError, now: () => NOW });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
    const hourlyErrors = onError.mock.calls.filter((c) => c[1].call === "getHourly");
    expect(hourlyErrors).toHaveLength(1);
  });
});

describe("getHourly — outside coverage", () => {
  it("a /points 404 gives null and never calls onError", async () => {
    const { fetchImpl } = router({ [POINT_URL]: fail(404) });
    const onError = vi.fn();
    expect(await getHourly(COORDS, { fetchImpl, onError, now: () => NOW })).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("getHourly — per-period conversions", () => {
  it("converts a Celsius temperature: 10 C is 50 F", async () => {
    const body = firstPeriod((p) => {
      p.temperatureUnit = "C";
      p.temperature = 10;
    });
    const { fetchImpl } = happy({ [HOURLY_URL]: ok(body) });
    const r = (await getHourly(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(r.hours[0].temperature).toBe(50);
  });

  it("a period with no temperature has temperature null", async () => {
    const body = firstPeriod((p) => {
      delete p.temperature;
    });
    const { fetchImpl } = happy({ [HOURLY_URL]: ok(body) });
    const r = (await getHourly(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(r.hours[0].temperature).toBeNull();
  });

  it("a range wind speed takes the largest number: 5 to 12 mph is 12", async () => {
    const body = firstPeriod((p) => {
      p.windSpeed = "5 to 12 mph";
    });
    const { fetchImpl } = happy({ [HOURLY_URL]: ok(body) });
    const r = (await getHourly(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(r.hours[0].windSpeed).toBe(12);
  });
});

describe("getHourly — last-good store", () => {
  it("writes a successful load under the hourly key", async () => {
    const store = memoryStore();
    const { fetchImpl } = happy();
    await getHourly(COORDS, { fetchImpl, store, now: () => NOW });
    expect(store.data.has(STORE_KEY)).toBe(true);
  });

  it("serves a one-hour-old stored reading as stale when every forecast request fails", async () => {
    const store = memoryStore();
    await getHourly(COORDS, { fetchImpl: happy().fetchImpl, store, now: () => NOW });
    clearHourlyCache();
    clearGridCache();
    clearPointCache();
    vi.useFakeTimers();
    const later = NOW + 3600_000;
    const { fetchImpl } = happy({ [HOURLY_URL]: fail(500), [GRID_URL]: fail(500) });
    const pending = getHourly(COORDS, { fetchImpl, store, now: () => later });
    await vi.advanceTimersByTimeAsync(1000);
    const r = (await pending)!;
    expect(r.stamp.stale).toBe(true);
    expect(r.stamp.fetchedAt).toBe(NOW);
    expect(r.hours).toHaveLength(30);
  });

  it("gives null for a stored reading 13 hours old", async () => {
    const store = memoryStore();
    await getHourly(COORDS, { fetchImpl: happy().fetchImpl, store, now: () => NOW });
    clearHourlyCache();
    clearGridCache();
    clearPointCache();
    vi.useFakeTimers();
    const later = NOW + 13 * 3600_000;
    const { fetchImpl } = happy({ [HOURLY_URL]: fail(500) });
    const pending = getHourly(COORDS, { fetchImpl, store, now: () => later });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
  });
});
