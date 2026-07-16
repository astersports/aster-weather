import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WeatherCache } from "../cache.js";
import { fetchForecast, clearForecastCache, type WeatherErrorContext } from "../index.js";

// Instant sleep so retry-backoff tests don't wait real time.
const noSleep = async (): Promise<void> => {};

describe("M1 — onError fires once on ultimate failure, never on success", () => {
  it("cold failure calls onError once (after retries) and returns empty", async () => {
    const cache = new WeatherCache<number>(1000, 200, {
      retries: 1,
      retryBackoffMs: 10,
      sleep: noSleep,
    });
    let loaderCalls = 0;
    const errs: unknown[] = [];
    const out = await cache.get(
      "k",
      async () => {
        loaderCalls += 1;
        throw new Error(`boom ${loaderCalls}`);
      },
      -1,
      (err) => errs.push(err),
    );
    expect(out).toBe(-1); // empty fallback (no stale to serve)
    expect(loaderCalls).toBe(2); // 1 initial + 1 retry
    expect(errs).toHaveLength(1); // ONE signal, not one-per-attempt
    expect((errs[0] as Error).message).toBe("boom 2"); // the last error
  });

  it("does not call onError when the loader succeeds", async () => {
    const cache = new WeatherCache<number>(1000, 200, { retries: 1, sleep: noSleep });
    let called = false;
    const out = await cache.get("k", async () => 42, -1, () => (called = true));
    expect(out).toBe(42);
    expect(called).toBe(false);
  });
});

describe("M5 — bounded retry absorbs a single transient failure", () => {
  it("fail-once-then-succeed returns the value with no error signal", async () => {
    const cache = new WeatherCache<number>(1000, 200, {
      retries: 1,
      retryBackoffMs: 10,
      sleep: noSleep,
    });
    let attempt = 0;
    const errs: unknown[] = [];
    const out = await cache.get(
      "k",
      async () => {
        attempt += 1;
        if (attempt === 1) throw new Error("transient");
        return 7;
      },
      -1,
      (err) => errs.push(err),
    );
    expect(out).toBe(7);
    expect(attempt).toBe(2);
    expect(errs).toHaveLength(0); // recovered — no signal
  });

  it("with retries=0 there is no second attempt", async () => {
    const cache = new WeatherCache<number>(1000, 200, { retries: 0, sleep: noSleep });
    let attempt = 0;
    await cache.get(
      "k",
      async () => {
        attempt += 1;
        throw new Error("x");
      },
      -1,
    );
    expect(attempt).toBe(1);
  });
});

describe("M6 — stale-while-revalidate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("expired entry is served immediately, then refreshed in the background", async () => {
    const cache = new WeatherCache<number>(1000, 200, { swr: true, sleep: noSleep });
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return calls; // 1 on the first load, 2 on the background refresh
    };
    expect(await cache.get("k", loader, -1)).toBe(1);
    vi.advanceTimersByTime(1500); // past the 1s TTL

    // SWR: this caller gets the stale value synchronously (no cold block)...
    expect(await cache.get("k", loader, -1)).toBe(1);
    // ...and a single background refresh runs.
    await vi.runAllTimersAsync();
    expect(calls).toBe(2);
    // The refreshed value is now what subsequent in-TTL callers see.
    expect(await cache.get("k", loader, -1)).toBe(2);
  });

  it("a failed background refresh keeps the stale value AND fires onError", async () => {
    const cache = new WeatherCache<number>(1000, 200, { swr: true, sleep: noSleep });
    let mode: "ok" | "fail" = "ok";
    const loader = async () => {
      if (mode === "fail") throw new Error("bg down");
      return 5;
    };
    const errs: unknown[] = [];
    expect(await cache.get("k", loader, -1, (e) => errs.push(e))).toBe(5);
    vi.advanceTimersByTime(1500);
    mode = "fail";
    // Stale still served to the caller...
    expect(await cache.get("k", loader, -1, (e) => errs.push(e))).toBe(5);
    await vi.runAllTimersAsync();
    // ...and the background failure surfaced exactly one signal.
    expect(errs).toHaveLength(1);
    expect((errs[0] as Error).message).toBe("bg down");
  });
});

describe("M1 integration — fetchForecast routes context to onError", () => {
  beforeEach(() => clearForecastCache());
  it("tags the failure with { call, lat, lon } and emits one signal despite the retry", async () => {
    const ctxs: WeatherErrorContext[] = [];
    const hours = await fetchForecast(
      { lat: 41.13, lon: -73.72 },
      {
        fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
        onError: (_err, ctx) => ctxs.push(ctx),
        timeoutMs: 50,
      },
    );
    expect(hours).toEqual([]); // never throws
    expect(ctxs).toEqual([{ call: "fetchForecast", lat: 41.13, lon: -73.72 }]);
  });
});
