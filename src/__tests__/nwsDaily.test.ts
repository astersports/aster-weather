import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getDaily, clearDailyCache } from "../nws/daily.js";
import { clearPointCache } from "../nws/point.js";
import { clearHourlyCache } from "../nws/hourly.js";
import { setRetrySleep } from "../helpers.js";
import { NWS_API } from "../nws/http.js";
import type { WeatherStore } from "../store.js";
import type { FetchImpl, WeatherErrorContext } from "../types.js";

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/nws/${name}`, import.meta.url), "utf8")) as Record<
    string,
    unknown
  >;
const points = load("points.json");
const forecast = load("forecast.json");

const COORDS = { lat: 41.03, lon: -73.76 };
const POINT_URL = `${NWS_API}/points/41.03,-73.76`;
const FORECAST_URL = "https://api.weather.gov/gridpoints/OKX/39,58/forecast";
const NOW = 1795787700000;
const STORE_KEY = "aw:daily:41.03,-73.76";
const HOUR = 3600_000;

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

function happy(forecastBody: unknown = forecast, extra: Record<string, Reply | Reply[]> = {}) {
  return router({
    [POINT_URL]: ok(points),
    [FORECAST_URL]: ok(forecastBody),
    ...extra,
  });
}

/** A forecast body built from hand-made periods. */
function bodyOf(periods: Record<string, unknown>[]) {
  return { properties: { updateTime: "2026-11-27T09:02:58+00:00", periods } };
}

/** A period with sensible defaults; the test overrides what it needs. */
function period(over: Record<string, unknown>): Record<string, unknown> {
  return {
    startTime: "2026-11-28T06:00:00-05:00",
    isDaytime: true,
    temperature: 53,
    temperatureUnit: "F",
    probabilityOfPrecipitation: { unitCode: "wmoUnit:percent", value: 0 },
    icon: "https://api.weather.gov/icons/land/day/few?size=medium",
    ...over,
  };
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
  clearHourlyCache();
  clearDailyCache();
});
afterEach(() => vi.useRealTimers());

describe("getDaily — the recorded fixture", () => {
  it("returns seven days", async () => {
    const { fetchImpl } = happy();
    const d = (await getDaily(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(d.days).toHaveLength(7);
  });

  it("folds the first day: high from the day, low from the night, rain as the larger chance", async () => {
    const { fetchImpl } = happy();
    const d = (await getDaily(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(d.days[0]).toEqual({
      date: "2026-11-27",
      high: 56,
      low: 41,
      precipProbabilityMax: 59,
      dayCondition: "rain",
      nightCondition: "light-rain",
      windy: false,
    });
  });

  it("folds the second day", async () => {
    const { fetchImpl } = happy();
    const d = (await getDaily(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(d.days[1]).toEqual({
      date: "2026-11-28",
      high: 53,
      low: 36,
      precipProbabilityMax: 3,
      dayCondition: "mostly-cloudy",
      nightCondition: "mostly-clear",
      windy: false,
    });
  });

  it("labels the stamp as a forecast from NWS, not stale, fetched at now", async () => {
    const { fetchImpl } = happy();
    const d = (await getDaily(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(d.stamp).toMatchObject({
      kind: "forecast",
      source: "nws-forecast",
      stale: false,
      fetchedAt: NOW,
      at: Date.parse("2026-11-27T09:02:58+00:00"),
    });
  });

  it("a list starting with the night period: that date has no high, and the night low is not a high", async () => {
    const clone = structuredClone(forecast) as { properties: { periods: unknown[] } };
    clone.properties.periods.shift();
    const { fetchImpl } = happy(clone);
    const d = (await getDaily(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(d.days[0]).toEqual({
      date: "2026-11-27",
      high: null,
      low: 41,
      precipProbabilityMax: 32,
      dayCondition: null,
      nightCondition: "light-rain",
      windy: false,
    });
  });
});

describe("getDaily — the overnight rule", () => {
  const overnight = period({
    startTime: "2026-11-28T00:00:00-05:00",
    isDaytime: false,
    temperature: 40,
    icon: "https://api.weather.gov/icons/land/night/few?size=medium",
  });
  const day = period({ startTime: "2026-11-28T06:00:00-05:00", temperature: 53 });
  const evening = period({
    startTime: "2026-11-28T18:00:00-05:00",
    isDaytime: false,
    temperature: 36,
    icon: "https://api.weather.gov/icons/land/night/few?size=medium",
  });

  it("the evening night period wins over an earlier Overnight one", async () => {
    const { fetchImpl } = happy(bodyOf([overnight, day, evening]));
    const d = (await getDaily(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(d.days[0]).toMatchObject({ date: "2026-11-28", high: 53, low: 36 });
  });

  it("an Overnight period is used when it is the only night period", async () => {
    const { fetchImpl } = happy(bodyOf([overnight, day]));
    const d = (await getDaily(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(d.days[0]).toMatchObject({ date: "2026-11-28", high: 53, low: 40 });
  });
});

describe("getDaily — folding rules", () => {
  it("both rain chances null gives precipProbabilityMax null, not 0", async () => {
    const body = bodyOf([
      period({ probabilityOfPrecipitation: { value: null } }),
      period({
        startTime: "2026-11-28T18:00:00-05:00",
        isDaytime: false,
        probabilityOfPrecipitation: { value: null },
      }),
    ]);
    const { fetchImpl } = happy(body);
    const d = (await getDaily(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(d.days[0]!.precipProbabilityMax).toBeNull();
  });

  it("one rain chance null and one 20 gives 20", async () => {
    const body = bodyOf([
      period({ probabilityOfPrecipitation: { value: null } }),
      period({
        startTime: "2026-11-28T18:00:00-05:00",
        isDaytime: false,
        probabilityOfPrecipitation: { value: 20 },
      }),
    ]);
    const { fetchImpl } = happy(body);
    const d = (await getDaily(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(d.days[0]!.precipProbabilityMax).toBe(20);
  });

  it("a Celsius day temperature of 10 gives a high of 50", async () => {
    const body = bodyOf([period({ temperatureUnit: "C", temperature: 10 })]);
    const { fetchImpl } = happy(body);
    const d = (await getDaily(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(d.days[0]!.high).toBe(50);
  });

  it("a wind_ icon on the day period gives windy true", async () => {
    const body = bodyOf([
      period({ icon: "https://api.weather.gov/icons/land/day/wind_few?size=medium" }),
    ]);
    const { fetchImpl } = happy(body);
    const d = (await getDaily(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(d.days[0]!.windy).toBe(true);
  });

  it("a wind_ icon on the night period gives windy true", async () => {
    const body = bodyOf([
      period({
        startTime: "2026-11-28T18:00:00-05:00",
        isDaytime: false,
        icon: "https://api.weather.gov/icons/land/night/wind_few?size=medium",
      }),
    ]);
    const { fetchImpl } = happy(body);
    const d = (await getDaily(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(d.days[0]!.windy).toBe(true);
  });

  it("a period whose startTime is not a date is skipped", async () => {
    const body = bodyOf([period({ startTime: "soon" }), period({})]);
    const { fetchImpl } = happy(body);
    const d = (await getDaily(COORDS, { fetchImpl, now: () => NOW }))!;
    expect(d.days).toHaveLength(1);
    expect(d.days[0]!.high).toBe(53);
  });
});

describe("getDaily — a re-gridded point", () => {
  it("a 404 on the forecast URL evicts the point, looks it up again and retries once", async () => {
    const { calls, fetchImpl } = happy(forecast, { [FORECAST_URL]: [fail(404), ok(forecast)] });
    const onError = vi.fn();
    const d = await getDaily(COORDS, { fetchImpl, onError, now: () => NOW });
    expect(d!.days).toHaveLength(7);
    expect(calls.filter((u) => u === POINT_URL)).toHaveLength(2);
    expect(calls.filter((u) => u === FORECAST_URL)).toHaveLength(2);
    expect(onError.mock.calls.some((c) => c[1].call === "getDaily")).toBe(false);
  });

  it("a 404 on the forecast URL every time gives null and exactly one getDaily onError", async () => {
    vi.useFakeTimers();
    const { fetchImpl } = happy(forecast, { [FORECAST_URL]: fail(404) });
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const pending = getDaily(COORDS, { fetchImpl, onError, now: () => NOW });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
    const dailyErrors = onError.mock.calls.filter((c) => c[1].call === "getDaily");
    expect(dailyErrors).toHaveLength(1);
    expect(dailyErrors[0]![1]).toMatchObject({ call: "getDaily", lat: 41.03, lon: -73.76 });
  });
});

describe("getDaily — outside coverage", () => {
  it("a /points 404 gives null and never calls onError", async () => {
    const { fetchImpl } = router({ [POINT_URL]: fail(404) });
    const onError = vi.fn();
    expect(await getDaily(COORDS, { fetchImpl, onError, now: () => NOW })).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("getDaily — last-good store", () => {
  it("writes a successful load under the daily key", async () => {
    const store = memoryStore();
    const { fetchImpl } = happy();
    await getDaily(COORDS, { fetchImpl, store, now: () => NOW });
    expect(store.data.has(STORE_KEY)).toBe(true);
  });

  it("serves a 23-hour-old stored reading as stale when every forecast request fails", async () => {
    const store = memoryStore();
    await getDaily(COORDS, { fetchImpl: happy().fetchImpl, store, now: () => NOW });
    clearDailyCache();
    clearPointCache();
    vi.useFakeTimers();
    const later = NOW + 23 * HOUR;
    const { fetchImpl } = happy(forecast, { [FORECAST_URL]: fail(500) });
    const pending = getDaily(COORDS, { fetchImpl, store, now: () => later });
    await vi.advanceTimersByTimeAsync(1000);
    const d = (await pending)!;
    expect(d.stamp.stale).toBe(true);
    expect(d.stamp.fetchedAt).toBe(NOW);
    expect(d.days).toHaveLength(7);
  });

  it("gives null for a stored reading 25 hours old", async () => {
    const store = memoryStore();
    await getDaily(COORDS, { fetchImpl: happy().fetchImpl, store, now: () => NOW });
    clearDailyCache();
    clearPointCache();
    vi.useFakeTimers();
    const later = NOW + 25 * HOUR;
    const { fetchImpl } = happy(forecast, { [FORECAST_URL]: fail(500) });
    const pending = getDaily(COORDS, { fetchImpl, store, now: () => later });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
  });
});

describe("getDaily — a failed point lookup serves the stored forecast", () => {
  beforeEach(() => {
    setRetrySleep(async () => {});
    clearPointCache();
    clearDailyCache();
  });
  afterEach(() => setRetrySleep(null));

  /** A good forecast stored at `at`; then the caches are cleared so the next call starts cold. */
  async function storeAt(store: WeatherStore, at: number) {
    const r = await getDaily(COORDS, { fetchImpl: happy().fetchImpl, store, now: () => at });
    expect(r).not.toBeNull();
    clearPointCache();
    clearDailyCache();
    return r!;
  }

  it("cold cache, points 500, a one-hour-old stored forecast: served stale with its own fetchedAt, and only the points URL is asked", async () => {
    const store = memoryStore();
    const stored = await storeAt(store, NOW - HOUR);
    const f = router({ [POINT_URL]: fail(500) });
    const r = await getDaily(COORDS, { fetchImpl: f.fetchImpl, store, now: () => NOW });
    expect(r).not.toBeNull();
    expect(r!.stamp.stale).toBe(true);
    expect(r!.stamp.fetchedAt).toBe(NOW - HOUR);
    expect(r!.days).toEqual(stored.days);
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
    expect(f.calls).toHaveLength(2);
  });

  it("points 500 with no store: null, and only the points URL is asked", async () => {
    const f = router({ [POINT_URL]: fail(500) });
    expect(await getDaily(COORDS, { fetchImpl: f.fetchImpl, now: () => NOW })).toBeNull();
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
  });

  it("points 500 with a stored forecast older than its bound: null", async () => {
    const store = memoryStore();
    await storeAt(store, NOW - 25 * HOUR);
    const f = router({ [POINT_URL]: fail(500) });
    expect(await getDaily(COORDS, { fetchImpl: f.fetchImpl, store, now: () => NOW })).toBeNull();
  });

  it("points 500 with radar on: the stored forecast is served with no radar request and no rainSource", async () => {
    const store = memoryStore();
    await storeAt(store, NOW - HOUR);
    const f = router({ [POINT_URL]: fail(500) });
    const r = await getDaily(COORDS, { fetchImpl: f.fetchImpl, store, now: () => NOW, radar: true });
    expect(r).not.toBeNull();
    expect(r!.days.some((d) => d.rainSource !== undefined)).toBe(false);
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
  });

  it("points 404 with a stored forecast: null, and the store is not read", async () => {
    const store = memoryStore();
    await storeAt(store, NOW - HOUR);
    const get = vi.spyOn(store, "get");
    const f = router({ [POINT_URL]: fail(404) });
    expect(await getDaily(COORDS, { fetchImpl: f.fetchImpl, store, now: () => NOW })).toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(1);
  });
});
