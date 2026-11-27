import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  getPoint,
  evictPoint,
  clearPointCache,
  lookupPoint,
  POINT_RETRY_AFTER_MS,
} from "../nws/point.js";
import { nwsJson, NWS_API } from "../nws/http.js";
import { setRetrySleep } from "../helpers.js";
import type { FetchImpl, WeatherErrorContext } from "../types.js";

const points = JSON.parse(
  readFileSync(new URL("./fixtures/nws/points.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

const COORDS = { lat: 41.03, lon: -73.76 };

interface Call {
  url: string;
  init?: { signal?: AbortSignal; headers?: Record<string, string> };
}

/** A stub fetch that records every URL and init it receives. */
function stub(status: number, body: unknown = points) {
  const calls: Call[] = [];
  const fetchImpl: FetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { calls, fetchImpl };
}

function bodyWithout(key: string): Record<string, unknown> {
  const clone = structuredClone(points) as { properties: Record<string, unknown> };
  delete clone.properties[key];
  return clone as Record<string, unknown>;
}

beforeEach(() => clearPointCache());
afterEach(() => vi.useRealTimers());

describe("getPoint — the recorded fixture", () => {
  it("returns the forecast URLs, place, zone, radar station and sun data", async () => {
    const { fetchImpl } = stub(200);
    const p = await getPoint(COORDS, { fetchImpl });
    expect(p).not.toBeNull();
    expect(p!.forecastHourly).toBe("https://api.weather.gov/gridpoints/OKX/39,58/forecast/hourly");
    expect(p!.timeZone).toBe("America/New_York");
    expect(p!.city).toBe("White Plains");
    expect(p!.state).toBe("NY");
    expect(p!.radarStation).toBe("KOKX");
    expect(p!.sun).toEqual({
      sunrise: 1795780591000,
      sunset: 1795814934000,
      firstLight: Date.parse("2026-11-27T06:26:18-05:00"),
      lastLight: Date.parse("2026-11-27T16:59:07-05:00"),
    });
  });

  it("requests the points URL with at most four decimals and no trailing zeros", async () => {
    const { calls, fetchImpl } = stub(200);
    await getPoint({ lat: 41.03000001, lon: -73.7599999 }, { fetchImpl });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${NWS_API}/points/41.03,-73.76`);
  });

  it("shares one request between concurrent calls and serves the third from cache", async () => {
    const { calls, fetchImpl } = stub(200);
    const [a, b] = await Promise.all([
      getPoint(COORDS, { fetchImpl }),
      getPoint(COORDS, { fetchImpl }),
    ]);
    const c = await getPoint(COORDS, { fetchImpl });
    expect(calls).toHaveLength(1);
    expect(a).toEqual(b);
    expect(c).toEqual(a);
  });

  it("sends the User-Agent only when one is given", async () => {
    const { calls, fetchImpl } = stub(200);
    await getPoint(COORDS, { fetchImpl, userAgent: "x (y)" });
    await getPoint({ lat: 40.7, lon: -74.0 }, { fetchImpl });
    expect(calls[0].init?.headers?.["User-Agent"]).toBe("x (y)");
    expect(calls[0].init?.headers?.["Accept"]).toBe("application/geo+json");
    expect(calls[1].init?.headers?.["User-Agent"]).toBeUndefined();
    expect(calls[1].init?.headers?.["Accept"]).toBe("application/geo+json");
  });

  it("returns null without any request for invalid coordinates", async () => {
    const { calls, fetchImpl } = stub(200);
    const p = await getPoint({ lat: 91, lon: -73.76 }, { fetchImpl });
    expect(p).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("builds sun data as null when astronomicalData is absent, and still returns the point", async () => {
    const body = bodyWithout("astronomicalData");
    const { fetchImpl } = stub(200, body);
    const p = await getPoint(COORDS, { fetchImpl });
    expect(p).not.toBeNull();
    expect(p!.sun).toBeNull();
    expect(p!.forecastHourly).toBe("https://api.weather.gov/gridpoints/OKX/39,58/forecast/hourly");
  });

  it("evicts a cached point so the next call makes a new request", async () => {
    const { calls, fetchImpl } = stub(200);
    await getPoint(COORDS, { fetchImpl });
    await getPoint(COORDS, { fetchImpl });
    expect(calls).toHaveLength(1);
    evictPoint(COORDS);
    await getPoint(COORDS, { fetchImpl });
    expect(calls).toHaveLength(2);
  });
});

describe("getPoint — outside coverage and failures", () => {
  it("a 404 is a normal answer: null, cached, and onError does not fire", async () => {
    const { calls, fetchImpl } = stub(404, {});
    const onError = vi.fn();
    expect(await getPoint(COORDS, { fetchImpl, onError })).toBeNull();
    expect(await getPoint(COORDS, { fetchImpl, onError })).toBeNull();
    expect(calls).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("two 500s give null and exactly one onError with the getPoint context", async () => {
    vi.useFakeTimers();
    const { calls, fetchImpl } = stub(500, {});
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const pending = getPoint(COORDS, { fetchImpl, onError });
    await vi.advanceTimersByTimeAsync(1000); // past the 500 ms retry backoff
    expect(await pending).toBeNull();
    expect(calls).toHaveLength(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toEqual({ call: "getPoint", lat: 41.03, lon: -73.76 });
  });

  it("a forecast URL on another host gives null and one onError", async () => {
    vi.useFakeTimers();
    const body = structuredClone(points) as { properties: Record<string, unknown> };
    body.properties.forecastHourly = "https://evil.example/gridpoints/OKX/39,58/forecast/hourly";
    const { calls, fetchImpl } = stub(200, body);
    const onError = vi.fn();
    const pending = getPoint(COORDS, { fetchImpl, onError });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
    expect(calls).toHaveLength(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it.each(["forecast", "forecastHourly", "forecastGridData", "observationStations"])(
    "a body missing %s gives null and one onError",
    async (key) => {
      vi.useFakeTimers();
      const { fetchImpl } = stub(200, bodyWithout(key));
      const onError = vi.fn();
      const pending = getPoint(COORDS, { fetchImpl, onError });
      await vi.advanceTimersByTimeAsync(1000);
      expect(await pending).toBeNull();
      expect(onError).toHaveBeenCalledTimes(1);
    },
  );
});

describe("nwsJson — transport", () => {
  it("refuses a URL outside the two fixed hosts before any request", async () => {
    const { calls, fetchImpl } = stub(200);
    await expect(nwsJson("https://example.com/x", { fetchImpl })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("returns null for 404 and the parsed body for 2xx", async () => {
    expect(await nwsJson(`${NWS_API}/x`, { fetchImpl: stub(404).fetchImpl })).toBeNull();
    expect(await nwsJson(`${NWS_API}/x`, { fetchImpl: stub(200, { a: 1 }).fetchImpl })).toEqual({
      a: 1,
    });
  });

  it("throws HTTP <status> for any other failure status", async () => {
    await expect(nwsJson(`${NWS_API}/x`, { fetchImpl: stub(503).fetchImpl })).rejects.toThrow(
      "HTTP 503",
    );
  });
});

/**
 * A stub whose status depends on the URL. `ok` answers the fixture; the status
 * for each URL is read at call time, so a test can change it between calls.
 */
function byUrl(statusOf: (url: string) => number) {
  const calls: string[] = [];
  const fetchImpl: FetchImpl = async (url) => {
    calls.push(url);
    const status = statusOf(url);
    return { ok: status >= 200 && status < 300, status, json: async () => points };
  };
  return { calls, fetchImpl };
}

const POINT_URL = `${NWS_API}/points/41.03,-73.76`;
const OTHER = { lat: 40.7, lon: -74.0 };
const OTHER_URL = `${NWS_API}/points/40.7,-74`;
const T0 = Date.parse("2026-11-27T13:55:00Z");
const DAY = 24 * 3600_000;

describe("lookupPoint — outside, failed and ok are told apart", () => {
  beforeEach(() => setRetrySleep(async () => {}));
  afterEach(() => setRetrySleep(null));

  it("is ok with the point for a good answer", async () => {
    const { fetchImpl } = stub(200);
    const r = await lookupPoint(COORDS, { fetchImpl });
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.point.timeZone).toBe("America/New_York");
  });

  it("is outside for a 404, caches it, and reports nothing", async () => {
    const { calls, fetchImpl } = stub(404);
    const onError = vi.fn();
    expect(await lookupPoint(COORDS, { fetchImpl, onError })).toEqual({ status: "outside" });
    expect(await lookupPoint(COORDS, { fetchImpl, onError })).toEqual({ status: "outside" });
    expect(calls).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("is failed for a 500 after one retry, reported once as getPoint, and not cached", async () => {
    const { calls, fetchImpl } = stub(500);
    const onError = vi.fn();
    expect(await lookupPoint(COORDS, { fetchImpl, onError })).toEqual({ status: "failed" });
    expect(calls.map((c) => c.url)).toEqual([POINT_URL, POINT_URL]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![1]).toMatchObject({ call: "getPoint", lat: 41.03, lon: -73.76 });
  });

  it("is outside for invalid coordinates, with no request", async () => {
    const { calls, fetchImpl } = stub(200);
    expect(await lookupPoint({ lat: 91, lon: -73.76 }, { fetchImpl })).toEqual({ status: "outside" });
    expect(calls).toHaveLength(0);
  });

  it("getPoint is null for both outside and failed", async () => {
    expect(await getPoint(COORDS, { fetchImpl: stub(404).fetchImpl })).toBeNull();
    expect(await getPoint(COORDS, { fetchImpl: stub(500).fetchImpl })).toBeNull();
  });
});

describe("the hold after a failed lookup", () => {
  beforeEach(() => {
    clearPointCache();
    setRetrySleep(async () => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    setRetrySleep(null);
    vi.useRealTimers();
  });

  it("answers failed at once, with no request and no onError, within thirty seconds", async () => {
    const s = { status: 500 };
    const { calls, fetchImpl } = byUrl(() => s.status);
    const onError = vi.fn();
    await lookupPoint(COORDS, { fetchImpl, onError });
    expect(calls).toHaveLength(2);

    vi.setSystemTime(T0 + 10_000);
    expect(await lookupPoint(COORDS, { fetchImpl, onError })).toEqual({ status: "failed" });
    expect(calls).toHaveLength(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("still holds at 29.999 s, and at exactly 30 s asks again", async () => {
    const s = { status: 500 };
    const { calls, fetchImpl } = byUrl(() => s.status);
    await lookupPoint(COORDS, { fetchImpl });
    expect(calls).toHaveLength(2);

    vi.setSystemTime(T0 + POINT_RETRY_AFTER_MS - 1);
    expect(await lookupPoint(COORDS, { fetchImpl })).toEqual({ status: "failed" });
    expect(calls).toHaveLength(2);

    vi.setSystemTime(T0 + POINT_RETRY_AFTER_MS);
    s.status = 200;
    const r = await lookupPoint(COORDS, { fetchImpl });
    expect(r.status).toBe("ok");
    expect(calls).toHaveLength(3);
  });

  it("holds each coordinate separately", async () => {
    const { calls, fetchImpl } = byUrl((url) => (url === POINT_URL ? 500 : 200));
    await lookupPoint(COORDS, { fetchImpl });
    expect(calls).toHaveLength(2);

    expect((await lookupPoint(OTHER, { fetchImpl })).status).toBe("ok");
    expect(calls).toEqual([POINT_URL, POINT_URL, OTHER_URL]);

    expect(await lookupPoint(COORDS, { fetchImpl })).toEqual({ status: "failed" });
    expect(calls).toHaveLength(3);
  });

  it("clearPointCache lifts the hold", async () => {
    const { calls, fetchImpl } = byUrl(() => 500);
    await lookupPoint(COORDS, { fetchImpl });
    clearPointCache();
    await lookupPoint(COORDS, { fetchImpl });
    expect(calls).toHaveLength(4);
  });

  it("evictPoint does not lift the hold", async () => {
    const { calls, fetchImpl } = byUrl(() => 500);
    await lookupPoint(COORDS, { fetchImpl });
    evictPoint(COORDS);
    vi.setSystemTime(T0 + 10_000);
    expect(await lookupPoint(COORDS, { fetchImpl })).toEqual({ status: "failed" });
    expect(calls).toHaveLength(2);
  });

  it("a failed refresh of a cached point serves that point as ok, and holds without a request", async () => {
    const s = { status: 200 };
    const { calls, fetchImpl } = byUrl(() => s.status);
    const onError = vi.fn();
    await lookupPoint(COORDS, { fetchImpl, onError });
    expect(calls).toHaveLength(1);

    vi.setSystemTime(T0 + DAY + 3600_000);
    s.status = 500;
    const served = await lookupPoint(COORDS, { fetchImpl, onError });
    expect(served.status).toBe("ok");
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(calls).toHaveLength(3);

    const again = await lookupPoint(COORDS, { fetchImpl, onError });
    expect(again).toEqual(served);
    expect(calls).toHaveLength(3);
  });
});

describe("the hold after a failed lookup: clock steps, 404s and evictions (B-016)", () => {
  beforeEach(() => {
    clearPointCache();
    setRetrySleep(async () => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    setRetrySleep(null);
    vi.useRealTimers();
  });

  it("a clock that stepped back an hour is not held: the lookup asks again", async () => {
    const s = { status: 500 };
    const { calls, fetchImpl } = byUrl(() => s.status);
    await lookupPoint(COORDS, { fetchImpl });
    expect(calls).toHaveLength(2);

    vi.setSystemTime(T0 - 3600_000);
    s.status = 200;
    const r = await lookupPoint(COORDS, { fetchImpl });
    expect(r.status).toBe("ok");
    expect(calls).toHaveLength(3);
  });

  it("a 404 does not start a hold: after evictPoint the next lookup asks again and is outside", async () => {
    const { calls, fetchImpl } = byUrl(() => 404);
    expect(await lookupPoint(COORDS, { fetchImpl })).toEqual({ status: "outside" });
    expect(calls).toHaveLength(1);

    evictPoint(COORDS);
    expect(await lookupPoint(COORDS, { fetchImpl })).toEqual({ status: "outside" });
    expect(calls).toHaveLength(2);
  });

  it("an eviction drops the point a hold would serve: inside the hold, the lookup is failed with no request", async () => {
    const s = { status: 200 };
    const { calls, fetchImpl } = byUrl(() => s.status);
    const onError = vi.fn();
    await lookupPoint(COORDS, { fetchImpl, onError });
    expect(calls).toHaveLength(1);

    vi.setSystemTime(T0 + DAY + 3600_000);
    s.status = 500;
    expect((await lookupPoint(COORDS, { fetchImpl, onError })).status).toBe("ok");
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(calls).toHaveLength(3);

    evictPoint(COORDS);
    expect(await lookupPoint(COORDS, { fetchImpl, onError })).toEqual({ status: "failed" });
    expect(calls).toHaveLength(3);
  });
});
