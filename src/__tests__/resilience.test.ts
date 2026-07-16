import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
