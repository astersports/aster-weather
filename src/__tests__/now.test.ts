import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { getNow, clearNowCache, MAX_OBSERVATION_AGE_MS } from "../now.js";
import { clearStationsCache } from "../nws/observations.js";
import { clearPointCache } from "../nws/point.js";
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
