import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WeatherCache } from "../cache.js";
import {
  fetchForecast,
  getWeatherForEvent,
  clearForecastCache,
  type FetchImpl,
} from "../index.js";

const COORDS = { lat: 41.13, lon: -73.72 };

function okHourly(startSec: number, count: number, over: Record<string, unknown> = {}): FetchImpl {
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
        wind_gusts_10m: time.map(() => 12.0),
        is_day: time.map(() => 1),
        ...over,
      },
    }),
  });
}

describe("WX-P1-1 — missing readings stay null, never fabricated as 0", () => {
  beforeEach(() => clearForecastCache());
  it("maps null precip/temp/wind to null (not 0)", async () => {
    const startSec = Math.floor(Date.now() / 1000);
    const hours = await fetchForecast(COORDS, {
      fetchImpl: okHourly(startSec, 3, {
        precipitation_probability: [null, null, null],
        temperature_2m: [null, null, null],
        wind_speed_10m: [null, null, null],
        wind_gusts_10m: [null, null, null],
      }),
    });
    expect(hours[0].precipitationProbability).toBeNull();
    expect(hours[0].temperature).toBeNull();
    expect(hours[0].windSpeed).toBeNull();
    expect(hours[0].windGusts).toBeNull();
  });
  it("does not fire rain/severe warnings off a null reading", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const eventISO = new Date((nowSec + 2 * 3600) * 1000).toISOString();
    const ew = await getWeatherForEvent(COORDS, eventISO, {
      fetchImpl: okHourly(nowSec, 8, {
        precipitation_probability: Array(8).fill(null),
        temperature_2m: Array(8).fill(null),
        wind_speed_10m: Array(8).fill(null),
        wind_gusts_10m: Array(8).fill(null),
      }),
    });
    expect(ew).not.toBeNull();
    expect(ew!.temperature).toBeNull();
    expect(ew!.isRainWarning).toBe(false);
    expect(ew!.isSevereWarning).toBe(false);
  });
});

describe("WX-P2-4/25 — severe flags fire on a gust and on thresholds", () => {
  beforeEach(() => clearForecastCache());
  it("gust > 45 mph is severe even when sustained wind is calm", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const eventISO = new Date((nowSec + 2 * 3600) * 1000).toISOString();
    const ew = await getWeatherForEvent(COORDS, eventISO, {
      fetchImpl: okHourly(nowSec, 8, {
        wind_speed_10m: Array(8).fill(12),
        wind_gusts_10m: Array(8).fill(48),
      }),
    });
    expect(ew!.windGusts).toBe(48);
    expect(ew!.isSevereWarning).toBe(true);
  });
});

describe("WX-P1-5 — stale-cache-on-error", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearForecastCache();
  });
  afterEach(() => vi.useRealTimers());
  it("serves the last-known-good value when a later fetch fails past the TTL", async () => {
    const startSec = Math.floor(Date.now() / 1000);
    let fail = false;
    const impl: FetchImpl = async (url, init) =>
      fail
        ? { ok: false, status: 503, json: async () => ({}) }
        : okHourly(startSec, 4)(url, init);
    const fresh = await fetchForecast(COORDS, { fetchImpl: impl });
    expect(fresh).toHaveLength(4);
    // Past the 60-min TTL, next call refetches — and it fails.
    vi.advanceTimersByTime(61 * 60 * 1000);
    fail = true;
    const stale = await fetchForecast(COORDS, { fetchImpl: impl });
    expect(stale).toEqual(fresh); // stale served, not []
  });
});

describe("WX-P2-24 / M6 — cache re-fetches after TTL expiry (stale-while-revalidate)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearForecastCache();
  });
  afterEach(() => vi.useRealTimers());
  it("within TTL serves cache; past TTL serves stale immediately then refreshes behind", async () => {
    const startSec = Math.floor(Date.now() / 1000);
    let calls = 0;
    const impl: FetchImpl = async (url, init) => {
      calls += 1;
      return okHourly(startSec, 4)(url, init);
    };
    await fetchForecast(COORDS, { fetchImpl: impl });
    await fetchForecast(COORDS, { fetchImpl: impl });
    expect(calls).toBe(1); // within TTL — one fetch shared
    vi.advanceTimersByTime(61 * 60 * 1000);
    // SWR: the expired entry is returned to THIS caller without blocking on the
    // network; the refetch runs in the background (M6).
    const stale = await fetchForecast(COORDS, { fetchImpl: impl });
    expect(stale).toHaveLength(4);
    await vi.runAllTimersAsync(); // let the background refresh settle
    expect(calls).toBe(2); // past TTL — background refresh fired exactly once
  });
});

describe("WX-P2-21 — in-flight dedup (concurrent calls share one fetch)", () => {
  beforeEach(() => clearForecastCache());
  it("two concurrent misses on one key issue a single fetch", async () => {
    const startSec = Math.floor(Date.now() / 1000);
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const impl: FetchImpl = async (url, init) => {
      calls += 1;
      await gate;
      return okHourly(startSec, 4)(url, init);
    };
    const p1 = fetchForecast(COORDS, { fetchImpl: impl });
    const p2 = fetchForecast(COORDS, { fetchImpl: impl });
    release();
    const [a, b] = await Promise.all([p1, p2]);
    expect(calls).toBe(1);
    expect(a).toEqual(b);
  });
});

describe("WX-P2-16/23 — timeout aborts, passes a signal, never hangs", () => {
  beforeEach(() => clearForecastCache());
  it("passes an AbortSignal to the injected fetchImpl", async () => {
    const startSec = Math.floor(Date.now() / 1000);
    let seen: unknown;
    const impl: FetchImpl = async (url, init) => {
      seen = init?.signal;
      return okHourly(startSec, 2)(url, init);
    };
    await fetchForecast(COORDS, { fetchImpl: impl });
    expect(seen).toBeInstanceOf(AbortSignal);
  });
  it("a never-resolving impl still times out (no hang) → []", async () => {
    const impl: FetchImpl = () => new Promise(() => {}); // ignores signal, never settles
    const hours = await fetchForecast(COORDS, { fetchImpl: impl, timeoutMs: 10 });
    expect(hours).toEqual([]);
  });
  it("WX-R2 — a STALLED BODY (headers OK, json() never resolves) still times out → [] + onError once", async () => {
    // The WX-R2 hang: the impl returns headers immediately (ok:true) but the
    // body read never settles. Pre-fix, res.json() ran AFTER the timer cleared,
    // so it hung forever — and via the shared in-flight dedup, every concurrent
    // caller for the coord hung with it. The fix races json() under the same
    // single deadline, so the loader settles by timeoutMs → stale/empty. This
    // exercises the centralized fetchJsonWithTimeout (all four loaders inherit it).
    const onError = vi.fn();
    const impl: FetchImpl = async () => ({
      ok: true,
      status: 200,
      json: () => new Promise<unknown>(() => {}), // body never resolves
    });
    const start = Date.now();
    const hours = await fetchForecast(COORDS, {
      fetchImpl: impl,
      timeoutMs: 20,
      onError,
    });
    expect(hours).toEqual([]); // settled to empty, did NOT hang
    expect(Date.now() - start).toBeLessThan(3000); // bounded by timeout+one retry, not infinite
    expect(onError).toHaveBeenCalledTimes(1); // exactly one signal after retries exhausted
  });
});

describe("WX-P2-20 — venue-local strip label uses the UTC offset (DL-13 lock)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearForecastCache();
  });
  afterEach(() => vi.useRealTimers());
  it("18:00 venue-local (22:00 UTC at offset -4h) labels 'Evening', not 'Night'", async () => {
    // System time just before the event so it's ~2h out (within horizon).
    vi.setSystemTime(new Date(Date.UTC(2026, 5, 15, 20, 0, 0)));
    const eventMs = Date.UTC(2026, 5, 15, 22, 0, 0); // 22:00 UTC = 18:00 local
    const startSec = Math.floor(eventMs / 1000);
    const ew = await getWeatherForEvent(
      COORDS,
      new Date(eventMs).toISOString(),
      { fetchImpl: okHourly(startSec, 6) },
    );
    expect(ew).not.toBeNull();
    // Dropping the utc_offset term would read UTC hour 22 → "Night".
    expect(ew!.forecastStrip[0].label).toBe("Evening");
  });
});

describe("v0.8.0 Task 3 — getWithMeta: age-bounded stale readings", () => {
  const TTL = 1000;

  it("(a) a fresh entry is returned with stale:false and the loader runs once", async () => {
    const cache = new WeatherCache<number>(TTL);
    let runs = 0;
    const loader = async () => {
      runs += 1;
      return 1;
    };
    const first = await cache.getWithMeta("k", loader, -1, undefined, Infinity, () => 0);
    const second = await cache.getWithMeta("k", loader, -1, undefined, Infinity, () => 500);
    expect(first).toEqual({ data: 1, fetchedAt: 0, stale: false });
    expect(second).toEqual({ data: 1, fetchedAt: 0, stale: false });
    expect(runs).toBe(1);
  });

  it("(b) loader fails with an entry younger than maxStaleMs: that entry, stale:true, timestamp unchanged, onError once", async () => {
    const cache = new WeatherCache<number>(TTL);
    await cache.getWithMeta("k", async () => 1, -1, undefined, Infinity, () => 0);
    const onError = vi.fn();
    const meta = await cache.getWithMeta(
      "k",
      async () => {
        throw new Error("down");
      },
      -1,
      onError,
      5000,
      () => 2000, // expired by TTL, age 2000 <= 5000
    );
    expect(meta).toEqual({ data: 1, fetchedAt: 0, stale: true });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("(c) loader fails with an entry older than maxStaleMs: empty, stale:false, the entry is dropped so the next call runs the loader", async () => {
    const cache = new WeatherCache<number>(TTL);
    await cache.getWithMeta("k", async () => 1, -1, undefined, Infinity, () => 0);
    const onError = vi.fn();
    const failed = await cache.getWithMeta(
      "k",
      async () => {
        throw new Error("down");
      },
      -1,
      onError,
      1000,
      () => 2000, // age 2000 > 1000
    );
    expect(failed).toEqual({ data: -1, fetchedAt: 2000, stale: false });
    expect(onError).toHaveBeenCalledTimes(1);

    let runs = 0;
    const next = await cache.getWithMeta(
      "k",
      async () => {
        runs += 1;
        return 9;
      },
      -1,
      undefined,
      1000,
      () => 2100,
    );
    expect(runs).toBe(1); // the old entry is gone, so the loader ran
    expect(next).toEqual({ data: 9, fetchedAt: 2100, stale: false });
  });

  it("(d) loader fails with no entry: empty, stale:false, onError once", async () => {
    const cache = new WeatherCache<number>(TTL);
    const onError = vi.fn();
    const meta = await cache.getWithMeta(
      "k",
      async () => {
        throw new Error("down");
      },
      -1,
      onError,
      Infinity,
      () => 300,
    );
    expect(meta).toEqual({ data: -1, fetchedAt: 300, stale: false });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("(e) two concurrent calls on a cold key share one loader run", async () => {
    const cache = new WeatherCache<number>(TTL);
    let runs = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const loader = async () => {
      runs += 1;
      await gate;
      return 4;
    };
    const p1 = cache.getWithMeta("k", loader, -1, undefined, Infinity, () => 0);
    const p2 = cache.getWithMeta("k", loader, -1, undefined, Infinity, () => 0);
    release();
    const [a, b] = await Promise.all([p1, p2]);
    expect(runs).toBe(1);
    expect(a).toEqual(b);
    expect(a).toEqual({ data: 4, fetchedAt: 0, stale: false });
  });

  it("(f) an expired entry is not returned while the loader succeeds: the fresh value comes back", async () => {
    const cache = new WeatherCache<number>(TTL);
    await cache.getWithMeta("k", async () => 1, -1, undefined, Infinity, () => 0);
    let runs = 0;
    const meta = await cache.getWithMeta(
      "k",
      async () => {
        runs += 1;
        return 2;
      },
      -1,
      undefined,
      Infinity,
      () => 5000, // expired
    );
    expect(runs).toBe(1);
    expect(meta).toEqual({ data: 2, fetchedAt: 5000, stale: false });
  });
});

describe("B-003 — getWithMeta freshFor: a value can shorten its own freshness", () => {
  const TTL = 1000;

  it("reuses an entry inside the shorter freshFor time and reloads it after", async () => {
    const cache = new WeatherCache<number>(TTL);
    let runs = 0;
    const loader = async () => {
      runs += 1;
      return runs;
    };
    const freshFor = () => 200;
    const first = await cache.getWithMeta("k", loader, -1, undefined, Infinity, () => 0, freshFor);
    const inside = await cache.getWithMeta("k", loader, -1, undefined, Infinity, () => 199, freshFor);
    expect(inside).toEqual({ data: 1, fetchedAt: 0, stale: false });
    expect(runs).toBe(1);
    const after = await cache.getWithMeta("k", loader, -1, undefined, Infinity, () => 200, freshFor);
    expect(first.data).toBe(1);
    expect(after).toEqual({ data: 2, fetchedAt: 200, stale: false });
    expect(runs).toBe(2);
  });

  it("a freshFor longer than the cache's ttl does not outlive the ttl", async () => {
    const cache = new WeatherCache<number>(TTL);
    let runs = 0;
    const loader = async () => {
      runs += 1;
      return runs;
    };
    const freshFor = () => 10 * TTL;
    await cache.getWithMeta("k", loader, -1, undefined, Infinity, () => 0, freshFor);
    const expired = await cache.getWithMeta("k", loader, -1, undefined, Infinity, () => TTL, freshFor);
    expect(expired).toEqual({ data: 2, fetchedAt: TTL, stale: false });
    expect(runs).toBe(2);
  });

  it("without freshFor the cache's own ttl decides, as before", async () => {
    const cache = new WeatherCache<number>(TTL);
    let runs = 0;
    const loader = async () => {
      runs += 1;
      return runs;
    };
    await cache.getWithMeta("k", loader, -1, undefined, Infinity, () => 0);
    const inside = await cache.getWithMeta("k", loader, -1, undefined, Infinity, () => TTL - 1);
    expect(inside).toEqual({ data: 1, fetchedAt: 0, stale: false });
    expect(runs).toBe(1);
  });

  it("a failed reload past the shorter freshFor serves the entry as stale, with its original fetchedAt", async () => {
    const cache = new WeatherCache<number>(TTL);
    await cache.getWithMeta("k", async () => 7, -1, undefined, Infinity, () => 0, () => 200);
    const onError = vi.fn();
    const meta = await cache.getWithMeta(
      "k",
      async () => {
        throw new Error("down");
      },
      -1,
      onError,
      5000,
      () => 300,
      () => 200,
    );
    expect(meta).toEqual({ data: 7, fetchedAt: 0, stale: true });
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("the engine never throws: a freshFor that throws falls back to the cache's ttl", () => {
  const TTL = 1000;

  it("getWithMeta resolves, and the entry is fresh for the cache's own ttl", async () => {
    const cache = new WeatherCache<number>(TTL);
    let runs = 0;
    const loader = async () => {
      runs += 1;
      return runs;
    };
    const throwing = (): number => {
      throw new Error("boom");
    };
    const first = await cache.getWithMeta("k", loader, -1, undefined, Infinity, () => 0, throwing);
    expect(first).toEqual({ data: 1, fetchedAt: 0, stale: false });

    const inside = await cache.getWithMeta("k", loader, -1, undefined, Infinity, () => TTL - 1, throwing);
    expect(inside).toEqual({ data: 1, fetchedAt: 0, stale: false });
    expect(runs).toBe(1);

    const after = await cache.getWithMeta("k", loader, -1, undefined, Infinity, () => TTL, throwing);
    expect(after).toEqual({ data: 2, fetchedAt: TTL, stale: false });
    expect(runs).toBe(2);
  });
});

describe("peek — read the cache with no loader, no wait (B-015 held path)", () => {
  const TTL = 1000;

  it("an absent key is null", () => {
    const cache = new WeatherCache<number>(TTL);
    expect(cache.peek("k", Infinity, () => 0)).toBeNull();
  });

  it("a fresh entry is returned with stale:false and its original fetchedAt", async () => {
    const cache = new WeatherCache<number>(TTL);
    await cache.getWithMeta("k", async () => 7, -1, undefined, Infinity, () => 100);
    expect(cache.peek("k", Infinity, () => 500)).toEqual({ data: 7, fetchedAt: 100, stale: false });
  });

  it("past the ttl but inside maxStaleMs: stale:true with the original fetchedAt", async () => {
    const cache = new WeatherCache<number>(TTL);
    await cache.getWithMeta("k", async () => 7, -1, undefined, Infinity, () => 100);
    expect(cache.peek("k", 5000, () => 100 + TTL)).toEqual({ data: 7, fetchedAt: 100, stale: true });
  });

  it("older than maxStaleMs is null, and the entry is kept (a later peek with a larger bound still finds it)", async () => {
    const cache = new WeatherCache<number>(TTL);
    await cache.getWithMeta("k", async () => 7, -1, undefined, Infinity, () => 0);
    expect(cache.peek("k", 100, () => 2000)).toBeNull();
    expect(cache.peek("k", 5000, () => 2000)).toEqual({ data: 7, fetchedAt: 0, stale: true });
  });

  it("an entry aged exactly maxStaleMs is stale:true with its original fetchedAt; one millisecond older is null", async () => {
    const cache = new WeatherCache<number>(TTL);
    await cache.getWithMeta("k", async () => 7, -1, undefined, Infinity, () => 100);
    // Age is exactly maxStaleMs (5000): still inside the bound.
    expect(cache.peek("k", 5000, () => 5100)).toEqual({ data: 7, fetchedAt: 100, stale: true });
    // One millisecond older: outside the bound, so null.
    expect(cache.peek("k", 5000, () => 5101)).toBeNull();
  });

  it("a freshFor shorter than the ttl makes the entry stale sooner", async () => {
    const cache = new WeatherCache<number>(TTL);
    const freshFor = () => 200;
    await cache.getWithMeta("k", async () => 7, -1, undefined, Infinity, () => 0, freshFor);
    expect(cache.peek("k", 5000, () => 199, freshFor)).toEqual({ data: 7, fetchedAt: 0, stale: false });
    expect(cache.peek("k", 5000, () => 200, freshFor)).toEqual({ data: 7, fetchedAt: 0, stale: true });
    // Without freshFor the ttl decides again.
    expect(cache.peek("k", 5000, () => 200)).toEqual({ data: 7, fetchedAt: 0, stale: false });
  });

  it("a freshFor that throws falls back to the cache's ttl and does not throw", async () => {
    const cache = new WeatherCache<number>(TTL);
    await cache.getWithMeta("k", async () => 7, -1, undefined, Infinity, () => 0);
    const throwing = (): number => {
      throw new Error("boom");
    };
    expect(cache.peek("k", 5000, () => TTL - 1, throwing)).toEqual({ data: 7, fetchedAt: 0, stale: false });
    expect(cache.peek("k", 5000, () => TTL, throwing)).toEqual({ data: 7, fetchedAt: 0, stale: true });
  });

  it("never waits and never retries: a recording sleep on a retrying cache is never called", async () => {
    const sleeps: number[] = [];
    const cache = new WeatherCache<number>(TTL, 200, {
      retries: 2,
      retryBackoffMs: 500,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await cache.getWithMeta("k", async () => 7, -1, undefined, Infinity, () => 0);
    expect(cache.peek("k", 5000, () => 2 * TTL)).toEqual({ data: 7, fetchedAt: 0, stale: true });
    expect(cache.peek("missing", 5000, () => 0)).toBeNull();
    expect(sleeps).toEqual([]);
  });

  it("does not change the LRU order: a peeked key is still the least recently used", async () => {
    const cache = new WeatherCache<number>(TTL, 2);
    await cache.getWithMeta("a", async () => 1, -1, undefined, Infinity, () => 0);
    await cache.getWithMeta("b", async () => 2, -1, undefined, Infinity, () => 0);
    expect(cache.peek("a", Infinity, () => 0)).toEqual({ data: 1, fetchedAt: 0, stale: false });
    await cache.getWithMeta("c", async () => 3, -1, undefined, Infinity, () => 0);
    // "a" was peeked, not touched, so it is evicted, not "b".
    expect(cache.peek("a", Infinity, () => 0)).toBeNull();
    expect(cache.peek("b", Infinity, () => 0)).toEqual({ data: 2, fetchedAt: 0, stale: false });
  });
});

describe("B-017: a clock that stepped back", () => {
  const TTL = 1000;
  const HOUR = 3600_000;
  const T = 10 * HOUR;

  async function seeded(): Promise<WeatherCache<number>> {
    const cache = new WeatherCache<number>(TTL);
    await cache.getWithMeta("k", async () => 7, -1, undefined, Infinity, () => T);
    return cache;
  }

  it("control: inside the ttl after the fetch, the entry is fresh and nothing loads", async () => {
    const cache = await seeded();
    let calls = 0;
    const r = await cache.getWithMeta("k", async () => (++calls, 8), -1, undefined, Infinity, () => T + TTL / 2);
    expect(calls).toBe(0);
    expect(r).toEqual({ data: 7, fetchedAt: T, stale: false });
  });

  it("getWithMeta with the clock an hour before the fetch calls the loader again", async () => {
    const cache = await seeded();
    let calls = 0;
    const r = await cache.getWithMeta("k", async () => (++calls, 8), -1, undefined, Infinity, () => T - HOUR);
    expect(calls).toBe(1);
    expect(r.data).toBe(8);
  });

  it("if that load fails, the cached value comes back stale:true with its original fetchedAt", async () => {
    const cache = await seeded();
    const r = await cache.getWithMeta(
      "k",
      async () => {
        throw new Error("down");
      },
      -1,
      undefined,
      Infinity,
      () => T - HOUR,
    );
    expect(r).toEqual({ data: 7, fetchedAt: T, stale: true });
  });

  it("peek with the clock an hour before the fetch is stale:true, never fresh", async () => {
    const cache = await seeded();
    expect(cache.peek("k", Infinity, () => T - HOUR)).toEqual({ data: 7, fetchedAt: T, stale: true });
  });

  it("get with the injected clock an hour before the fetch calls the loader", async () => {
    const cache = await seeded();
    let calls = 0;
    await cache.get("k", async () => (++calls, 8), -1, undefined, () => T - HOUR);
    expect(calls).toBe(1);
  });

  it("control: get inside the ttl serves the cache with no load", async () => {
    const cache = await seeded();
    let calls = 0;
    const v = await cache.get("k", async () => (++calls, 8), -1, undefined, () => T + TTL / 2);
    expect(calls).toBe(0);
    expect(v).toBe(7);
  });
});
