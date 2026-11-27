/**
 * Error reporting: a consumer's `onError` can never break the engine (B-001),
 * and the retry-backoff sleep is replaceable in tests (B-006).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { WeatherCache } from "../cache.js";
import { RESILIENT_CACHE, setRetrySleep } from "../helpers.js";
import { FETCH_RETRY_BACKOFF_MS, type FetchImpl } from "../types.js";
import { getCurrentWeather, clearCurrentCache } from "../current.js";
import { getPoint, clearPointCache } from "../nws/point.js";
import { getHourly, clearHourlyCache } from "../nws/hourly.js";
import { clearGridCache } from "../nws/grid.js";
import { getAlerts, clearAlertsCache } from "../nws/alerts.js";
import { NWS_API } from "../nws/http.js";
import { getRadarRain, clearRadarCache } from "../radar.js";

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/nws/${name}`, import.meta.url), "utf8")) as Record<
    string,
    unknown
  >;
const points = load("points.json");
const grid = load("grid.json");

const COORDS = { lat: 41.03, lon: -73.76 };
const POINT_URL = `${NWS_API}/points/41.03,-73.76`;
const GRID_URL = "https://api.weather.gov/gridpoints/OKX/39,58";

interface Reply {
  status: number;
  body: unknown;
}

/** Answers by exact URL; every other URL gets a 500 (a failure on every attempt). */
function stub(routes: Record<string, Reply>): FetchImpl {
  return async (url) => {
    const r = routes[url] ?? { status: 500, body: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
}

let hookCalls = 0;
/** A consumer hook that always throws, counting its calls. */
const throwingHook = (): never => {
  hookCalls += 1;
  throw new Error("hook");
};

/** Collects unhandled promise rejections while `body` runs, then gives them a tick to surface. */
async function unhandledDuring(body: () => Promise<void>): Promise<unknown[]> {
  const unhandled: unknown[] = [];
  const listener = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", listener);
  try {
    await body();
    await new Promise((resolve) => setTimeout(resolve, 20));
    return unhandled;
  } finally {
    process.off("unhandledRejection", listener);
  }
}

beforeEach(() => {
  hookCalls = 0;
  setRetrySleep(async () => {});
  clearPointCache();
  clearHourlyCache();
  clearGridCache();
  clearAlertsCache();
  clearRadarCache();
  clearCurrentCache();
});

afterEach(() => {
  setRetrySleep(null);
});

describe("B-001: a throwing onError hook never reaches the engine", () => {
  it("WeatherCache.get resolves to its empty answer", async () => {
    const cache = new WeatherCache<number>(1000, 10, RESILIENT_CACHE);
    const out = await cache.get("k", async () => { throw new Error("down"); }, -1, throwingHook);
    expect(out).toBe(-1);
    expect(hookCalls).toBe(1);
  });

  it("WeatherCache.getWithMeta resolves to its empty answer", async () => {
    const cache = new WeatherCache<number>(1000, 10, RESILIENT_CACHE);
    const meta = await cache.getWithMeta(
      "k",
      async () => { throw new Error("down"); },
      -1,
      throwingHook,
    );
    expect(meta).toMatchObject({ data: -1, stale: false });
    expect(hookCalls).toBe(1);
  });

  it("a stale value is still served when the hook throws (getWithMeta, within its bound)", async () => {
    const cache = new WeatherCache<number>(1000, 10, RESILIENT_CACHE);
    let t = 0;
    const clock = () => t;
    await cache.getWithMeta("k", async () => 7, -1, undefined, Infinity, clock);
    t = 5000; // expired: the TTL is 1000 ms
    const meta = await cache.getWithMeta(
      "k",
      async () => { throw new Error("down"); },
      -1,
      throwingHook,
      Infinity,
      clock,
    );
    expect(meta).toEqual({ data: 7, fetchedAt: 0, stale: true });
    expect(hookCalls).toBe(1);
  });

  it("a stale value is still served when the hook throws (get, stale-while-revalidate)", async () => {
    const cache = new WeatherCache<number>(0, 10, { swr: true });
    await cache.get("k", async () => 1, -1);
    const unhandled = await unhandledDuring(async () => {
      const served = await cache.get(
        "k",
        async () => { throw new Error("down"); },
        -1,
        throwingHook,
      );
      expect(served).toBe(1);
    });
    expect(hookCalls).toBe(1); // the background refresh reported, and its throw was contained
    expect(unhandled).toEqual([]);
  });

  it("getPoint resolves to null", async () => {
    const out = await getPoint(COORDS, { fetchImpl: stub({}), onError: throwingHook });
    expect(out).toBeNull();
    expect(hookCalls).toBe(1);
  });

  it("getHourly resolves to null", async () => {
    const out = await getHourly(COORDS, {
      fetchImpl: stub({ [POINT_URL]: { status: 200, body: points }, [GRID_URL]: { status: 200, body: grid } }),
      onError: throwingHook,
    });
    expect(out).toBeNull();
    expect(hookCalls).toBeGreaterThan(0);
  });

  it("getAlerts resolves to null", async () => {
    const out = await getAlerts(COORDS, {
      fetchImpl: stub({ [POINT_URL]: { status: 200, body: points } }),
      onError: throwingHook,
    });
    expect(out).toBeNull();
    expect(hookCalls).toBeGreaterThan(0);
  });

  it("getRadarRain resolves to null", async () => {
    const out = await getRadarRain(COORDS, { fetchImpl: stub({}), onError: throwingHook });
    expect(out).toBeNull();
    expect(hookCalls).toBe(1);
  });

  it("getCurrentWeather (an old Open-Meteo fetcher) resolves to null", async () => {
    const out = await getCurrentWeather(COORDS, { fetchImpl: stub({}), onError: throwingHook });
    expect(out).toBeNull();
    expect(hookCalls).toBe(1);
  });

  it("an async hook that rejects causes no unhandled rejection", async () => {
    const unhandled = await unhandledDuring(async () => {
      const out = await getCurrentWeather(COORDS, {
        fetchImpl: stub({}),
        onError: async () => {
          throw new Error("async hook");
        },
      });
      expect(out).toBeNull();
    });
    expect(unhandled).toEqual([]);
  });
});

describe("B-006: the retry backoff sleep is replaceable", () => {
  it("a recording sleep sees one backoff; setRetrySleep(null) restores the real sleep", async () => {
    const slept: number[] = [];
    setRetrySleep(async (ms) => {
      slept.push(ms);
    });
    const cache = new WeatherCache<number>(1000, 10, RESILIENT_CACHE);
    const out = await cache.get("a", async () => { throw new Error("x"); }, -1);
    expect(out).toBe(-1);
    expect(slept).toEqual([FETCH_RETRY_BACKOFF_MS]);

    setRetrySleep(null);
    vi.useFakeTimers();
    try {
      let settled = false;
      const pending = cache.get("b", async () => { throw new Error("x"); }, -1).then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(FETCH_RETRY_BACKOFF_MS - 1);
      expect(settled).toBe(false); // the real 500 ms timer is in effect
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
    expect(slept).toEqual([FETCH_RETRY_BACKOFF_MS]); // the recording sleep was not called again
  });
});
