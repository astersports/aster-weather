import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { getNow, clearNowCache, MAX_OBSERVATION_AGE_MS } from "../now.js";
import { clearStationsCache } from "../nws/observations.js";
import { clearPointCache, evictPoint } from "../nws/point.js";
import { clearGridCache } from "../nws/grid.js";
import { clearHourlyCache } from "../nws/hourly.js";
import { NWS_API } from "../nws/http.js";
import type { WeatherStore } from "../store.js";
import type { FetchImpl, WeatherErrorContext } from "../types.js";
import { setRetrySleep } from "../helpers.js";

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/nws/${name}`, import.meta.url), "utf8")) as Record<
    string,
    unknown
  >;
const points = load("points.json");
const stations = load("stations.json");
const observation = load("observation.json");
const hourly = load("hourly.json");
const grid = load("grid.json");

const COORDS = { lat: 41.03, lon: -73.76 };
const POINT_URL = `${NWS_API}/points/41.03,-73.76`;
const STATIONS_URL = "https://api.weather.gov/gridpoints/OKX/39,58/stations";
const HOURLY_URL = "https://api.weather.gov/gridpoints/OKX/39,58/forecast/hourly";
const GRID_URL = "https://api.weather.gov/gridpoints/OKX/39,58";
const OBS_KHPN = `${NWS_API}/stations/KHPN/observations/latest`;
const OBS_KLGA = `${NWS_API}/stations/KLGA/observations/latest`;
const NOW = 1795787700000; // 25 minutes after the KHPN reading
const MIN = 60_000;
const STORE_KEY = "aw:now:41.03,-73.76";

interface Reply {
  status: number;
  body: unknown;
}

/** A stub that answers by exact URL; an unknown URL answers 404. */
function router(script: Record<string, Reply>) {
  const calls: string[] = [];
  const fetchImpl: FetchImpl = async (url) => {
    calls.push(url);
    const r: Reply = script[url] ?? { status: 404, body: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { calls, fetchImpl };
}

const ok = (body: unknown): Reply => ({ status: 200, body });
const fail = (status: number): Reply => ({ status, body: {} });

/** The recorded observation, with its timestamp and/or fields edited. */
function obs(at: number, edit: (p: Record<string, any>) => void = () => {}) {
  const clone = structuredClone(observation) as { properties: Record<string, any> };
  clone.properties.timestamp = new Date(at).toISOString();
  edit(clone.properties);
  return clone;
}

/** Every URL a healthy engine asks: the point, stations, both observations, forecast and grid. */
function healthy(extra: Record<string, Reply> = {}) {
  return router({
    [POINT_URL]: ok(points),
    [STATIONS_URL]: ok(stations),
    [OBS_KHPN]: ok(observation),
    [OBS_KLGA]: ok(obs(NOW - 10 * MIN, (p) => (p.temperature.value = 15))),
    [HOURLY_URL]: ok(hourly),
    [GRID_URL]: ok(grid),
    ...extra,
  });
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

function callsFor(onError: ReturnType<typeof vi.fn>, call: WeatherErrorContext["call"]) {
  return onError.mock.calls.filter((c) => (c[1] as WeatherErrorContext).call === call);
}

beforeEach(() => {
  clearNowCache();
  clearStationsCache();
  clearPointCache();
  clearGridCache();
  clearHourlyCache();
});

// Failure tests never wait on the real retry backoff (B-006).
beforeEach(() => setRetrySleep(async () => {}));
afterEach(() => setRetrySleep(null));

describe("getNow — the observed rung", () => {
  it("reads the nearest station and returns the exact reading", async () => {
    const { fetchImpl } = healthy();
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW });
    expect(n).toEqual({
      stamp: { kind: "observed", at: 1795786200000, fetchedAt: 1795787700000, stale: false, source: "nws-station" },
      station: { id: "KHPN", name: "White Plains - Westchester County Airport" },
      temperature: 54,
      feelsLike: 54,
      dewPoint: 48,
      humidity: 82,
      windSpeed: 8,
      windDirection: 210,
      windGust: null,
      pressure: 29.53,
      visibility: 10,
      cloudBase: 2100,
      precipLastHour: null,
      condition: "mostly-cloudy",
      windy: false,
      isDay: true,
    });
  });

  it("a second call inside ten minutes makes no new request", async () => {
    let t = NOW;
    const { calls, fetchImpl } = healthy();
    const first = await getNow(COORDS, { fetchImpl, now: () => t });
    const after = calls.length;
    t = NOW + 5 * MIN;
    const second = await getNow(COORDS, { fetchImpl, now: () => t });
    expect(calls.length).toBe(after);
    expect(second!.temperature).toBe(first!.temperature);
    expect(second!.stamp.stale).toBe(false);
  });

  it("skips a station whose reading is 91 minutes old and uses the next one", async () => {
    const { fetchImpl } = healthy({
      [OBS_KHPN]: ok(obs(NOW - 91 * MIN)),
    });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW });
    expect(n!.station!.id).toBe("KLGA");
    expect(n!.temperature).toBe(59);
    expect(n!.stamp.kind).toBe("observed");
  });

  it("skips a station with a null temperature and uses the next one", async () => {
    const { fetchImpl } = healthy({
      [OBS_KHPN]: ok(obs(NOW - 25 * MIN, (p) => (p.temperature.value = null))),
    });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW });
    expect(n!.station!.id).toBe("KLGA");
  });

  it("skips a station whose request fails and does not report it as getNow", async () => {
    const onError = vi.fn();
    const { fetchImpl } = healthy({ [OBS_KHPN]: fail(500) });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW, onError });
    expect(n!.station!.id).toBe("KLGA");
    expect(callsFor(onError, "getNow")).toHaveLength(0);
  });

  it("an observation whose timestamp is not a date is skipped", async () => {
    const { fetchImpl } = healthy({
      [OBS_KHPN]: ok(obs(NOW, (p) => (p.timestamp = "not a date"))),
    });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW });
    expect(n!.station!.id).toBe("KLGA");
  });

  it("feelsLike is the heat index when one is given", async () => {
    const { fetchImpl } = healthy({
      [OBS_KHPN]: ok(obs(NOW - 25 * MIN, (p) => (p.heatIndex.value = 35))),
    });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW });
    expect(n!.feelsLike).toBe(95);
  });

  it("feelsLike is the wind chill when there is no heat index", async () => {
    const { fetchImpl } = healthy({
      [OBS_KHPN]: ok(obs(NOW - 25 * MIN, (p) => (p.windChill.value = -5))),
    });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW });
    expect(n!.feelsLike).toBe(23);
  });

  it("the max observation age is 90 minutes", () => {
    expect(MAX_OBSERVATION_AGE_MS).toBe(90 * MIN);
  });
});

describe("getNow — the forecast rung", () => {
  it("uses the forecast hour containing now when both stations are too old", async () => {
    const { fetchImpl } = healthy({
      [OBS_KHPN]: ok(obs(NOW - 91 * MIN)),
      [OBS_KLGA]: ok(obs(NOW - 91 * MIN, (p) => (p.temperature.value = 15))),
    });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW });
    expect(n).not.toBeNull();
    expect(n!.stamp).toEqual({ kind: "forecast", at: 1795784400000, fetchedAt: NOW, stale: false, source: "nws-forecast" });
    expect(n!.station).toBeNull();
    expect(n!.temperature).toBe(53);
    expect(n!.pressure).toBeNull();
    expect(n!.windDirection).toBeNull();
    expect(n!.cloudBase).toBeNull();
    expect(n!.precipLastHour).toBeNull();
  });

  it("uses the forecast when the stations request fails", async () => {
    const { fetchImpl } = healthy({ [STATIONS_URL]: fail(500) });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW });
    expect(n!.stamp.kind).toBe("forecast");
    expect(n!.stamp.source).toBe("nws-forecast");
    expect(n!.temperature).toBe(53);
  });

  it("stations and forecast both fail, no store: null, and onError fires once for getNow", async () => {
    const onError = vi.fn();
    const { fetchImpl } = healthy({ [STATIONS_URL]: fail(500), [HOURLY_URL]: fail(500) });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW, onError });
    expect(n).toBeNull();
    expect(callsFor(onError, "getNow")).toHaveLength(1);
  });

  it("the same failure with a store holding a reading 2 hours old: stale", async () => {
    const store = memoryStore();
    const reading = healthy();
    const seeded = await getNow(COORDS, { fetchImpl: reading.fetchImpl, now: () => NOW, store });
    expect(seeded!.stamp.kind).toBe("observed");
    clearNowCache();
    clearStationsCache();
    store.data.set(STORE_KEY, JSON.stringify({ fetchedAt: NOW - 2 * 60 * MIN, data: seeded }));
    const { fetchImpl } = healthy({ [STATIONS_URL]: fail(500), [HOURLY_URL]: fail(500) });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW, store });
    expect(n).not.toBeNull();
    expect(n!.stamp.stale).toBe(true);
    expect(n!.stamp.fetchedAt).toBe(NOW - 2 * 60 * MIN);
    expect(n!.temperature).toBe(54);
  });

  it("the same failure with a stored reading 4 hours old: null", async () => {
    const store = memoryStore();
    const seeded = await getNow(COORDS, { fetchImpl: healthy().fetchImpl, now: () => NOW, store });
    clearNowCache();
    clearStationsCache();
    store.data.set(STORE_KEY, JSON.stringify({ fetchedAt: NOW - 4 * 60 * MIN, data: seeded }));
    const { fetchImpl } = healthy({ [STATIONS_URL]: fail(500), [HOURLY_URL]: fail(500) });
    expect(await getNow(COORDS, { fetchImpl, now: () => NOW, store })).toBeNull();
  });

  it("writes an observed reading to the store, and not a forecast one", async () => {
    const store = memoryStore();
    await getNow(COORDS, { fetchImpl: healthy().fetchImpl, now: () => NOW, store });
    expect(store.data.has(STORE_KEY)).toBe(true);

    clearNowCache();
    clearStationsCache();
    clearHourlyCache();
    const forecastStore = memoryStore();
    const { fetchImpl } = healthy({
      [OBS_KHPN]: ok(obs(NOW - 91 * MIN)),
      [OBS_KLGA]: ok(obs(NOW - 91 * MIN)),
    });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW, store: forecastStore });
    expect(n!.stamp.kind).toBe("forecast");
    expect(forecastStore.data.has(STORE_KEY)).toBe(false);
  });
});

describe("getNow — no coverage", () => {
  it("a /points 404 gives null and never calls onError", async () => {
    const onError = vi.fn();
    const { calls, fetchImpl } = healthy({ [POINT_URL]: fail(404) });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW, onError });
    expect(n).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(calls.some((u) => u.includes("/stations/"))).toBe(false);
  });
});

describe("getNow — every failed request is reported once (B-012, B-007)", () => {
  it("a stations list that fails is reported once as getStations, and the forecast still answers", async () => {
    const onError = vi.fn();
    const { fetchImpl } = healthy({ [STATIONS_URL]: fail(500) });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW, onError });
    expect(n!.stamp.kind).toBe("forecast");
    expect(callsFor(onError, "getStations")).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("a station observation that fails is reported once as getLatestObservation, and the next station answers", async () => {
    const onError = vi.fn();
    const { fetchImpl } = healthy({ [OBS_KHPN]: fail(500) });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW, onError });
    expect(n!.stamp.kind).toBe("observed");
    expect(n!.station!.id).toBe("KLGA");
    expect(callsFor(onError, "getLatestObservation")).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("a station observation that answers 404 is not an error and is not reported", async () => {
    const onError = vi.fn();
    const { fetchImpl } = healthy({ [OBS_KHPN]: fail(404) });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW, onError });
    expect(n!.station!.id).toBe("KLGA");
    expect(onError).not.toHaveBeenCalled();
  });

  it("when every request succeeds, onError is never called", async () => {
    const onError = vi.fn();
    const { fetchImpl } = healthy();
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW, onError });
    expect(n!.stamp.kind).toBe("observed");
    expect(onError).not.toHaveBeenCalled();
  });

  it("on a cold cache, stations and hourly both failing reports each once, and hourly is asked twice (one try and its retry)", async () => {
    const onError = vi.fn();
    const { calls, fetchImpl } = healthy({ [STATIONS_URL]: fail(500), [HOURLY_URL]: fail(500) });
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW, onError });
    expect(n).toBeNull();
    const labels = onError.mock.calls.map((c) => (c[1] as WeatherErrorContext).call).sort();
    expect(labels).toEqual(["getHourly", "getNow", "getStations"]);
    expect(calls.filter((u) => u === HOURLY_URL)).toHaveLength(2);
  });
});

describe("getNow — a failed point lookup serves the stored reading", () => {
  /** A good observed reading stored at `at`; the caches are then cleared so the next call starts cold. */
  async function storeAt(store: WeatherStore, at: number) {
    const r = await getNow(COORDS, { fetchImpl: healthy().fetchImpl, store, now: () => at });
    expect(r).not.toBeNull();
    clearNowCache();
    clearStationsCache();
    clearPointCache();
    clearGridCache();
    clearHourlyCache();
    return r!;
  }

  it("cold cache, points 500, a one-hour-old stored reading: served stale with its own fetchedAt, and only the points URL is asked", async () => {
    const store = memoryStore();
    const stored = await storeAt(store, NOW - 3600_000);
    const f = router({ [POINT_URL]: fail(500) });
    const r = await getNow(COORDS, { fetchImpl: f.fetchImpl, store, now: () => NOW });
    expect(r).not.toBeNull();
    expect(r!.stamp.stale).toBe(true);
    expect(r!.stamp.fetchedAt).toBe(NOW - 3600_000);
    expect(r!.temperature).toBe(stored.temperature);
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
    expect(f.calls).toHaveLength(2);
  });

  it("points 500 with no store: null, and only the points URL is asked", async () => {
    const f = router({ [POINT_URL]: fail(500) });
    expect(await getNow(COORDS, { fetchImpl: f.fetchImpl, now: () => NOW })).toBeNull();
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
  });

  it("points 500 with a stored reading older than its bound: null", async () => {
    const store = memoryStore();
    await storeAt(store, NOW - 4 * 3600_000);
    const f = router({ [POINT_URL]: fail(500) });
    expect(await getNow(COORDS, { fetchImpl: f.fetchImpl, store, now: () => NOW })).toBeNull();
  });

  it("points 500 with radar on: the stored reading is served with no radar request and no rainSource", async () => {
    const store = memoryStore();
    await storeAt(store, NOW - 3600_000);
    const f = router({ [POINT_URL]: fail(500) });
    const r = await getNow(COORDS, { fetchImpl: f.fetchImpl, store, now: () => NOW, radar: true });
    expect(r).not.toBeNull();
    expect(r!.rainSource).toBeUndefined();
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
  });

  it("points 404 with a stored reading: null, and the store is not read", async () => {
    const store = memoryStore();
    await storeAt(store, NOW - 3600_000);
    const get = vi.spyOn(store, "get");
    const f = router({ [POINT_URL]: fail(404) });
    expect(await getNow(COORDS, { fetchImpl: f.fetchImpl, store, now: () => NOW })).toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(1);
  });
});

describe("getNow — a failed point lookup uses the reading already in memory (B-015)", () => {
  const HOUR = 3600_000;

  /** A good observed reading at `at`, then the point evicted so the next lookup has to ask. */
  async function warmAt(at: number, store?: WeatherStore) {
    const r = await getNow(COORDS, { fetchImpl: healthy().fetchImpl, store, now: () => at });
    expect(r).not.toBeNull();
    evictPoint(COORDS);
    return r!;
  }

  it("fresh in memory, points 500, no store: the same reading, not stale, and only the points URL is asked", async () => {
    const warm = await warmAt(NOW);
    const f = router({ [POINT_URL]: fail(500) });
    const onError = vi.fn();
    const r = await getNow(COORDS, { fetchImpl: f.fetchImpl, onError, now: () => NOW + 5 * MIN });
    expect(r).toEqual(warm);
    expect(r!.stamp.fetchedAt).toBe(NOW);
    expect(r!.stamp.stale).toBe(false);
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
    expect(f.calls).toHaveLength(2);
    expect(onError.mock.calls.map((c) => (c[1] as WeatherErrorContext).call)).toEqual(["getPoint"]);
  });

  it("past its fresh window inside 3 h, points 500: the in-memory reading, stale, with its own fetchedAt", async () => {
    const warm = await warmAt(NOW);
    const f = router({ [POINT_URL]: fail(500) });
    const onError = vi.fn();
    const r = await getNow(COORDS, { fetchImpl: f.fetchImpl, onError, now: () => NOW + 20 * MIN });
    expect(r!.stamp.stale).toBe(true);
    expect(r!.stamp.fetchedAt).toBe(NOW);
    expect(r!.temperature).toBe(warm.temperature);
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
    expect(onError.mock.calls.map((c) => (c[1] as WeatherErrorContext).call)).toEqual(["getPoint"]);
  });

  it("past 3 h, points 500, no store: null, and only the points URL is asked", async () => {
    await warmAt(NOW);
    const f = router({ [POINT_URL]: fail(500) });
    expect(await getNow(COORDS, { fetchImpl: f.fetchImpl, now: () => NOW + 4 * HOUR })).toBeNull();
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
  });

  it("in memory and in the store, points 500: the in-memory reading wins over an older stored copy", async () => {
    const store = memoryStore();
    const warm = await warmAt(NOW, store);
    const raw = JSON.parse(store.data.get(STORE_KEY)!) as { fetchedAt: number; data: unknown };
    store.data.set(STORE_KEY, JSON.stringify({ ...raw, fetchedAt: NOW - HOUR }));
    const f = router({ [POINT_URL]: fail(500) });
    const r = await getNow(COORDS, { fetchImpl: f.fetchImpl, store, now: () => NOW + 5 * MIN });
    expect(r).toEqual(warm);
    expect(r!.stamp.fetchedAt).toBe(NOW);
    expect(r!.stamp.stale).toBe(false);
  });

  it("radar on, fresh in memory, points 500: no radar request and no rainSource", async () => {
    const warm = await warmAt(NOW);
    const f = router({ [POINT_URL]: fail(500) });
    const r = await getNow(COORDS, { fetchImpl: f.fetchImpl, now: () => NOW + 5 * MIN, radar: true });
    expect(r).toEqual(warm);
    expect(r!.rainSource).toBeUndefined();
    expect(f.calls.every((u) => u === POINT_URL)).toBe(true);
  });

  it("no waiting on the failed path: a stale in-memory reading is served with no retry sleep", async () => {
    const warm = await warmAt(NOW);
    const at = NOW + 2 * HOUR;
    const f = router({ [POINT_URL]: fail(500) });
    // This lookup fails once and starts the hold.
    await getNow(COORDS, { fetchImpl: f.fetchImpl, now: () => at });
    const sleeps: number[] = [];
    setRetrySleep(async (ms) => {
      sleeps.push(ms);
    });
    const held = await getNow(COORDS, { fetchImpl: f.fetchImpl, now: () => at + 1 });
    expect(held!.stamp.stale).toBe(true);
    expect(held!.stamp.fetchedAt).toBe(NOW);
    expect(held!.temperature).toBe(warm.temperature);
    expect(sleeps).toEqual([]);
  });

  it("no waiting on the failed path: a cold cache with a stored copy is read with no retry sleep", async () => {
    const store = memoryStore();
    const warm = await warmAt(NOW, store);
    const at = NOW + 2 * HOUR;
    const f = router({ [POINT_URL]: fail(500) });
    await getNow(COORDS, { fetchImpl: f.fetchImpl, store, now: () => at });
    clearNowCache();
    const sleeps: number[] = [];
    setRetrySleep(async (ms) => {
      sleeps.push(ms);
    });
    const stored = await getNow(COORDS, { fetchImpl: f.fetchImpl, store, now: () => at + 1 });
    expect(stored!.stamp.stale).toBe(true);
    expect(stored!.temperature).toBe(warm.temperature);
    expect(sleeps).toEqual([]);
  });

  it("a held call does not wait for another call's read: it settles null while the first read is still in flight, and the first still gets its reading", async () => {
    // Cold cache, point ok. Call A's stations request is held open by a gate this test controls.
    let releaseStations!: () => void;
    const stationsGate = new Promise<void>((resolve) => (releaseStations = resolve));
    let stationsAsked!: () => void;
    const stationsStarted = new Promise<void>((resolve) => (stationsAsked = resolve));
    const base = healthy();
    const gated: FetchImpl = async (url, init) => {
      if (url === STATIONS_URL) {
        stationsAsked();
        await stationsGate;
      }
      return base.fetchImpl(url, init);
    };
    const a = getNow(COORDS, { fetchImpl: gated, now: () => NOW });
    await stationsStarted; // A's read is now in flight and unresolved.

    // Call B: the point is evicted and its lookup fails, with no store. It must not join A's read.
    evictPoint(COORDS);
    const f = router({ [POINT_URL]: fail(500) });
    const b = getNow(COORDS, { fetchImpl: f.fetchImpl, now: () => NOW });
    // A real 200 ms timer, not a microtask flush: a fetch hop may use a macrotask, so a flush could
    // end before B finishes. If B waited on A, B could never settle while A is gated, so the timer
    // always wins and the test fails; a correct B settles in milliseconds, far inside the window.
    const STILL = "still waiting";
    let guardTimer: ReturnType<typeof setTimeout> | undefined;
    const guard = new Promise<string>((resolve) => {
      guardTimer = setTimeout(() => resolve(STILL), 200);
    });
    const first = await Promise.race([b, guard]);
    clearTimeout(guardTimer);
    expect(first, "B waited for A's in-flight read").toBeNull();

    let aSettled = false;
    void a.then(() => {
      aSettled = true;
    });
    expect(aSettled, "A should still be pending while its stations request is gated").toBe(false);

    releaseStations();
    const ra = await a;
    expect(ra).not.toBeNull();
    expect(ra!.stamp.stale).toBe(false);
    expect(ra!.stamp.fetchedAt).toBe(NOW);
    expect(ra!.station?.id).toBe("KHPN");
    expect(ra!.temperature).toBe(54);
  });
});
