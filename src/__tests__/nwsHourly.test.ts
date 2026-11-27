import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getHourly, clearHourlyCache } from "../nws/hourly.js";
import { clearPointCache, evictPoint } from "../nws/point.js";
import { clearGridCache } from "../nws/grid.js";
import { NWS_API } from "../nws/http.js";
import { getEventWeather } from "../event.js";
import { getNow } from "../now.js";
import { setRetrySleep } from "../helpers.js";
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

describe("getHourly — a failed grid is asked again after five minutes (B-003)", () => {
  const MIN = 60_000;

  // Failure tests never wait on the real retry backoff (B-006).
  beforeEach(() => setRetrySleep(async () => {}));
  afterEach(() => setRetrySleep(null));

  /** A stub whose grid (and optionally the hourly forecast) answers 500 until the test raises it. */
  function flaky() {
    const up = { grid: false, hourly: true };
    const calls: string[] = [];
    const fetchImpl: FetchImpl = async (url) => {
      calls.push(url);
      const body =
        url === POINT_URL ? points : url === HOURLY_URL ? hourly : url === GRID_URL ? grid : null;
      const down = (url === GRID_URL && !up.grid) || (url === HOURLY_URL && !up.hourly);
      const status = body === null ? 404 : down ? 500 : 200;
      return { ok: status === 200, status, json: async () => body };
    };
    return { up, calls, fetchImpl };
  }

  const gridErrors = (onError: ReturnType<typeof vi.fn>) =>
    onError.mock.calls.filter((c) => c[1].call === "getGrid");

  it("serves the hours at once, keeps the failed grid for five minutes, then fills it once the grid is back", async () => {
    const s = flaky();
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const at = (ms: number) => ({ fetchImpl: s.fetchImpl, onError, now: () => ms });

    const first = (await getHourly(COORDS, at(NOW)))!;
    expect(first.gridAvailable).toBe(false);
    expect(first.hours).toHaveLength(30);
    expect(first.hours[0].windGust).toBeNull();
    expect(gridErrors(onError)).toHaveLength(1);

    const beforeFour = s.calls.length;
    const four = (await getHourly(COORDS, at(NOW + 4 * MIN)))!;
    expect(four.gridAvailable).toBe(false);
    expect(s.calls).toHaveLength(beforeFour);

    s.up.grid = true;
    const five = (await getHourly(COORDS, at(NOW + 5 * MIN)))!;
    expect(s.calls.slice(beforeFour)).toEqual(expect.arrayContaining([HOURLY_URL, GRID_URL]));
    expect(five.gridAvailable).toBe(true);
    expect(five.hours[0].windGust).toBe(25);
  });

  it("reports the grid again once when it is still down at five minutes", async () => {
    const s = flaky();
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const at = (ms: number) => ({ fetchImpl: s.fetchImpl, onError, now: () => ms });

    await getHourly(COORDS, at(NOW));
    const beforeFive = s.calls.length;
    const again = (await getHourly(COORDS, at(NOW + 5 * MIN)))!;
    expect(again.hours).toHaveLength(30);
    expect(again.gridAvailable).toBe(false);
    expect(s.calls.slice(beforeFive)).toContain(GRID_URL);
    expect(gridErrors(onError)).toHaveLength(2);
  });

  it("a grid fine from the start is kept for the whole hour: no request at five or fifty-nine minutes", async () => {
    const s = flaky();
    s.up.grid = true;
    const at = (ms: number) => ({ fetchImpl: s.fetchImpl, now: () => ms });

    expect((await getHourly(COORDS, at(NOW)))!.gridAvailable).toBe(true);
    const before = s.calls.length;
    expect((await getHourly(COORDS, at(NOW + 5 * MIN)))!.gridAvailable).toBe(true);
    expect((await getHourly(COORDS, at(NOW + 59 * MIN)))!.gridAvailable).toBe(true);
    expect(s.calls).toHaveLength(before);
  });

  it("when the forecast also fails at five minutes, the first answer is served again as stale", async () => {
    const s = flaky();
    const at = (ms: number) => ({ fetchImpl: s.fetchImpl, now: () => ms });

    const first = (await getHourly(COORDS, at(NOW)))!;
    s.up.hourly = false;
    const later = (await getHourly(COORDS, at(NOW + 5 * MIN)))!;
    expect(later.stamp.stale).toBe(true);
    expect(later.stamp.fetchedAt).toBe(first.stamp.fetchedAt);
    expect(later.hours).toHaveLength(30);
    expect(later.gridAvailable).toBe(false);
  });

  it("getEventWeather and getNow read a result whose grid is missing", async () => {
    const s = flaky();
    const opts = { fetchImpl: s.fetchImpl, now: () => NOW };
    expect(await getEventWeather(COORDS, NOW + 60 * MIN, opts)).not.toBeNull();
    expect((await getNow(COORDS, opts))!.temperature).toBe(53);
  });
});

describe("getHourly — a failed point lookup serves the stored reading", () => {
  beforeEach(() => {
    setRetrySleep(async () => {});
    clearPointCache();
    clearGridCache();
    clearHourlyCache();
  });
  afterEach(() => setRetrySleep(null));

  /** A good reading stored at `at`; then every cache is cleared so the next call starts cold. */
  async function storeAt(store: WeatherStore, at: number) {
    const r = await getHourly(COORDS, { fetchImpl: happy().fetchImpl, store, now: () => at });
    expect(r).not.toBeNull();
    clearPointCache();
    clearGridCache();
    clearHourlyCache();
    return r!;
  }

  it("cold cache, points 500, a one-hour-old stored reading: served stale with its own fetchedAt, and only the points URL is asked", async () => {
    const store = memoryStore();
    const stored = await storeAt(store, NOW - 3600_000);
    const f = router({ [POINT_URL]: fail(500) });
    const r = await getHourly(COORDS, { fetchImpl: f.fetchImpl, store, now: () => NOW });
    expect(r).not.toBeNull();
    expect(r!.stamp.stale).toBe(true);
    expect(r!.stamp.fetchedAt).toBe(NOW - 3600_000);
    expect(r!.hours).toEqual(stored.hours);
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
    expect(f.calls).toHaveLength(2);
  });

  it("points 500 with no store: null, and only the points URL is asked", async () => {
    const f = router({ [POINT_URL]: fail(500) });
    expect(await getHourly(COORDS, { fetchImpl: f.fetchImpl, now: () => NOW })).toBeNull();
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
  });

  it("points 500 with a stored reading older than its bound: null", async () => {
    const store = memoryStore();
    await storeAt(store, NOW - 13 * 3600_000);
    const f = router({ [POINT_URL]: fail(500) });
    expect(await getHourly(COORDS, { fetchImpl: f.fetchImpl, store, now: () => NOW })).toBeNull();
  });

  it("points 404 with a stored reading: null, and the store is not read", async () => {
    const store = memoryStore();
    await storeAt(store, NOW - 3600_000);
    const get = vi.spyOn(store, "get");
    const f = router({ [POINT_URL]: fail(404) });
    expect(await getHourly(COORDS, { fetchImpl: f.fetchImpl, store, now: () => NOW })).toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(1);
  });
});

describe("getHourly — a stored body without the gridAvailable field reads as no grid (B-003)", () => {
  // Failure tests never wait on the real retry backoff (B-006).
  beforeEach(() => setRetrySleep(async () => {}));
  afterEach(() => setRetrySleep(null));

  it("cold cache, hourly fails on every attempt, last-good body without the field: served stale with gridAvailable false", async () => {
    const store = memoryStore();
    await getHourly(COORDS, { fetchImpl: happy().fetchImpl, store, now: () => NOW - 3600_000 });

    // Remove the field from the stored body, as a build from before it existed would have written it.
    const raw = JSON.parse(store.data.get(STORE_KEY)!) as { data: Record<string, unknown> };
    expect(raw.data.gridAvailable).toBe(true);
    delete raw.data.gridAvailable;
    store.data.set(STORE_KEY, JSON.stringify(raw));

    clearPointCache();
    clearGridCache();
    clearHourlyCache();
    const broken = router({
      [POINT_URL]: ok(points),
      [HOURLY_URL]: fail(500),
      [GRID_URL]: ok(grid),
    });
    const r = await getHourly(COORDS, { fetchImpl: broken.fetchImpl, store, now: () => NOW });
    expect(r).not.toBeNull();
    expect(r!.stamp.stale).toBe(true);
    expect(r!.gridAvailable).toBe(false);
    expect(r!.hours).toHaveLength(30);
  });
});

describe("getHourly — a failed point lookup uses the reading already in memory (B-015)", () => {
  const MIN = 60_000;
  const HOUR = 3600_000;

  beforeEach(() => {
    setRetrySleep(async () => {});
    clearPointCache();
    clearGridCache();
    clearHourlyCache();
  });
  afterEach(() => setRetrySleep(null));

  /** A good reading at `at`, then the point evicted so the next lookup has to ask. */
  async function warmAt(at: number, store?: WeatherStore) {
    const r = await getHourly(COORDS, { fetchImpl: happy().fetchImpl, store, now: () => at });
    expect(r).not.toBeNull();
    evictPoint(COORDS);
    return r!;
  }

  it("fresh in memory, points 500, no store: the same reading, not stale, and only the points URL is asked", async () => {
    const warm = await warmAt(NOW);
    const f = router({ [POINT_URL]: fail(500) });
    const onError = vi.fn();
    const r = await getHourly(COORDS, { fetchImpl: f.fetchImpl, onError, now: () => NOW + 10 * MIN });
    expect(r).toEqual(warm);
    expect(r!.stamp.fetchedAt).toBe(NOW);
    expect(r!.stamp.stale).toBe(false);
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
    expect(f.calls).toHaveLength(2);
    expect(onError.mock.calls.map((c) => (c[1] as WeatherErrorContext).call)).toEqual(["getPoint"]);
  });

  it("past its fresh window inside the maximum age, points 500: the in-memory reading, stale, with its own fetchedAt", async () => {
    const warm = await warmAt(NOW);
    const f = router({ [POINT_URL]: fail(500) });
    const onError = vi.fn();
    const r = await getHourly(COORDS, { fetchImpl: f.fetchImpl, onError, now: () => NOW + 2 * HOUR });
    expect(r!.stamp.stale).toBe(true);
    expect(r!.stamp.fetchedAt).toBe(NOW);
    expect(r!.hours).toEqual(warm.hours);
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
    // The point's own failure is reported once; the held read reports nothing.
    expect(onError.mock.calls.map((c) => (c[1] as WeatherErrorContext).call)).toEqual(["getPoint"]);
  });

  it("past the maximum age, points 500, no store: null, and only the points URL is asked", async () => {
    await warmAt(NOW);
    const f = router({ [POINT_URL]: fail(500) });
    expect(await getHourly(COORDS, { fetchImpl: f.fetchImpl, now: () => NOW + 13 * HOUR })).toBeNull();
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
  });

  it("in memory and in the store, points 500: the in-memory reading wins over an older stored copy", async () => {
    const store = memoryStore();
    const warm = await warmAt(NOW, store);
    const raw = JSON.parse(store.data.get(STORE_KEY)!) as { fetchedAt: number; data: unknown };
    store.data.set(STORE_KEY, JSON.stringify({ ...raw, fetchedAt: NOW - 3 * HOUR }));
    const f = router({ [POINT_URL]: fail(500) });
    const r = await getHourly(COORDS, { fetchImpl: f.fetchImpl, store, now: () => NOW + 10 * MIN });
    expect(r).toEqual(warm);
    expect(r!.stamp.fetchedAt).toBe(NOW);
    expect(r!.stamp.stale).toBe(false);
  });

  it("a reading without its grid is fresh for five minutes only: at ten minutes it is served stale", async () => {
    const grid500 = happy({ [GRID_URL]: fail(500) });
    const warm = await getHourly(COORDS, { fetchImpl: grid500.fetchImpl, now: () => NOW });
    expect(warm!.gridAvailable).toBe(false);
    evictPoint(COORDS);
    const f = router({ [POINT_URL]: fail(500) });
    const r = await getHourly(COORDS, { fetchImpl: f.fetchImpl, now: () => NOW + 10 * MIN });
    expect(r!.stamp.stale).toBe(true);
    expect(r!.stamp.fetchedAt).toBe(NOW);
    expect(r!.gridAvailable).toBe(false);
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
  });

  it("no waiting on the failed path: a stale in-memory reading is served with no retry sleep", async () => {
    const warm = await warmAt(NOW);
    const at = NOW + 2 * HOUR;
    const f = router({ [POINT_URL]: fail(500) });
    // This lookup fails once (its own point retry is not counted) and starts the hold.
    await getHourly(COORDS, { fetchImpl: f.fetchImpl, now: () => at });
    const sleeps: number[] = [];
    setRetrySleep(async (ms) => {
      sleeps.push(ms);
    });
    const held = await getHourly(COORDS, { fetchImpl: f.fetchImpl, now: () => at + 1 });
    expect(held!.stamp.stale).toBe(true);
    expect(held!.stamp.fetchedAt).toBe(NOW);
    expect(held!.hours).toEqual(warm.hours);
    expect(sleeps).toEqual([]);
  });

  it("no waiting on the failed path: a cold cache with a stored copy is read with no retry sleep", async () => {
    const store = memoryStore();
    const warm = await warmAt(NOW, store);
    const at = NOW + 2 * HOUR;
    const f = router({ [POINT_URL]: fail(500) });
    await getHourly(COORDS, { fetchImpl: f.fetchImpl, store, now: () => at });
    clearHourlyCache();
    const sleeps: number[] = [];
    setRetrySleep(async (ms) => {
      sleeps.push(ms);
    });
    const stored = await getHourly(COORDS, { fetchImpl: f.fetchImpl, store, now: () => at + 1 });
    expect(stored!.stamp.stale).toBe(true);
    expect(stored!.hours).toEqual(warm.hours);
    expect(sleeps).toEqual([]);
  });
});
