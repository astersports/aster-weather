import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getPoint, evictPoint, clearPointCache } from "../nws/point.js";
import { nwsJson, NWS_API } from "../nws/http.js";
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
