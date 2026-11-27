import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { getEventWeather } from "../event.js";
import { clearPointCache } from "../nws/point.js";
import { clearGridCache } from "../nws/grid.js";
import { clearHourlyCache } from "../nws/hourly.js";
import { NWS_API } from "../nws/http.js";
import type { FetchImpl } from "../types.js";
import { setRetrySleep } from "../helpers.js";

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/nws/${name}`, import.meta.url), "utf8")) as any;
const points = load("points.json");
const hourly = load("hourly.json");
const grid = load("grid.json");

const C = { lat: 41.03, lon: -73.76 };
const POINT_URL = `${NWS_API}/points/41.03,-73.76`;
const HOURLY_URL = "https://api.weather.gov/gridpoints/OKX/39,58/forecast/hourly";
const GRID_URL = "https://api.weather.gov/gridpoints/OKX/39,58";
const NOW = 1795787700000;
const EVENT = "2026-11-27T13:10:00-05:00";
const at = (iso: string) => Date.parse(iso);
/** The grid block that covers 13:00 EST (18:00 UTC): the PT4H block starting 17:00 UTC. */
const GUST_BLOCK = "2026-11-27T17:00:00+00:00";
const KMH_PER_MPH = 1 / 0.621371192237334;

interface Reply {
  status: number;
  body: unknown;
}

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

/**
 * A stub of the point, hourly and grid answers. `hours` edits fixture periods by
 * index (5 is the 13:00 EST hour, 6 is 14:00). `gustMph` sets that hour's gust
 * (null for a missing value); omitted leaves the fixture's gust.
 */
function world(
  opts: { hours?: Record<number, (p: any) => void>; gustMph?: number | null } = {},
) {
  const h = structuredClone(hourly);
  for (const [i, edit] of Object.entries(opts.hours ?? {})) edit(h.properties.periods[Number(i)]);
  const g = structuredClone(grid);
  if (opts.gustMph !== undefined) {
    const block = g.properties.windGust.values.find((b: any) => b.validTime.startsWith(GUST_BLOCK));
    block.value = opts.gustMph === null ? null : opts.gustMph * KMH_PER_MPH;
  }
  return router({ [POINT_URL]: ok(points), [HOURLY_URL]: ok(h), [GRID_URL]: ok(g) });
}

const run = (event: string | number | Date, w: ReturnType<typeof world>, now = NOW) =>
  getEventWeather(C, event, { fetchImpl: w.fetchImpl, now: () => now });

/** Every cache the event path reads, so each case starts cold and counts its own requests. */
function clearAll() {
  clearPointCache();
  clearGridCache();
  clearHourlyCache();
}

beforeEach(clearAll);

// Failure tests never wait on the real retry backoff (B-006).
beforeEach(() => setRetrySleep(async () => {}));
afterEach(() => setRetrySleep(null));

describe("getEventWeather: the nearest hour", () => {
  it("reads the 13:00 EST hour for a 13:10 EST event", async () => {
    const e = (await run(EVENT, world()))!;
    expect(e.hour.timestamp).toBe(at("2026-11-27T13:00:00-05:00"));
    expect(e.hour.precipProbability).toBe(44);
    expect(e.hour.temperature).toBe(51);
    expect(e.isRainWarning).toBe(true);
    expect(e.isSevereWarning).toBe(false);
  });

  it("returns the four-hour strip from two hours before to four hours after the event", async () => {
    const e = (await run(EVENT, world()))!;
    // Window 11:10 to 17:10 EST holds 12:00 through 17:00; the first four are kept.
    expect(e.strip.map((h) => h.timestamp)).toEqual([
      at("2026-11-27T12:00:00-05:00"),
      at("2026-11-27T13:00:00-05:00"),
      at("2026-11-27T14:00:00-05:00"),
      at("2026-11-27T15:00:00-05:00"),
    ]);
    expect(e.strip.length).toBeLessThanOrEqual(4);
  });

  it("gives the same answer for a Date and for epoch milliseconds", async () => {
    const fromString = await run(EVENT, world());
    const fromDate = await run(new Date(EVENT), world());
    const fromNumber = await run(at(EVENT), world());
    expect(fromDate).toEqual(fromString);
    expect(fromNumber).toEqual(fromString);
  });

  it("picks the earlier hour on a tie", async () => {
    const e = (await run("2026-11-27T13:30:00-05:00", world({ hours: { 6: (p) => { p.probabilityOfPrecipitation.value = 10; } } })))!;
    expect(e.hour.timestamp).toBe(at("2026-11-27T13:00:00-05:00"));
    expect(e.hour.precipProbability).toBe(44);
  });

  it("returns null for an event nine days out, with no hour within six hours", async () => {
    expect(await run("2026-12-06T13:10:00-05:00", world())).toBeNull();
  });

  it("returns null with zero requests for an event more than 7 days ahead or more than 1 day past", async () => {
    const DAY = 86_400_000;
    for (const t of [NOW + 9 * DAY, NOW - 2 * DAY]) {
      clearAll();
      const w = world();
      expect(await run(t, w)).toBeNull();
      expect(w.calls).toHaveLength(0);
    }
  });

  it("makes the request for an event exactly 7 days ahead or exactly 1 day past", async () => {
    const DAY = 86_400_000;
    for (const t of [NOW + 7 * DAY, NOW - 1 * DAY]) {
      clearAll();
      const w = world();
      await run(t, w);
      expect(w.calls.length).toBeGreaterThan(0);
    }
  });

  it("says so when it serves a stale forecast, and keeps the first fetch time", async () => {
    const first = (await run(EVENT, world()))!;
    expect(first.stamp.stale).toBe(false);

    // Two hours on: past the one-hour fresh window, and the hourly request now fails every attempt.
    const later = NOW + 2 * 3_600_000;
    const failing = router({
      [POINT_URL]: ok(points),
      [GRID_URL]: ok(grid),
      [HOURLY_URL]: { status: 500, body: {} },
    });
    const second = (await run(EVENT, failing, later))!;
    expect(second).not.toBeNull();
    expect(second.stamp.stale).toBe(true);
    expect(second.stamp.fetchedAt).toBe(first.stamp.fetchedAt);
    expect(second.hour.timestamp).toBe(first.hour.timestamp);
  });

  it("returns null for an unusable date without making a request", async () => {
    for (const bad of ["not a date", Number.NaN, new Date("nope")] as const) {
      const w = world();
      expect(await run(bad, w)).toBeNull();
      expect(w.calls).toHaveLength(0);
    }
  });

  it("returns null when the forecast is unavailable (points 404)", async () => {
    const w = router({ [POINT_URL]: { status: 404, body: {} } });
    expect(await run(EVENT, w)).toBeNull();
  });

  it("takes the stamp from the hourly forecast", async () => {
    const e = (await run(EVENT, world()))!;
    expect(e.stamp.kind).toBe("forecast");
    expect(e.stamp.source).toBe("nws-forecast");
    expect(e.stamp.at).toBe(at(hourly.properties.updateTime));
    expect(e.stamp.fetchedAt).toBe(NOW);
    expect(e.stamp.stale).toBe(false);
  });
});

describe("getEventWeather: warning flags", () => {
  const flags = async (opts: Parameters<typeof world>[0]) => {
    // Each case is its own world: the hourly cache must not carry the last one across.
    clearPointCache();
    clearGridCache();
    clearHourlyCache();
    const e = (await run(EVENT, world(opts)))!;
    return { rain: e.isRainWarning, severe: e.isSevereWarning };
  };
  // The fixture's 13:00 hour has 44% rain, which raises the rain warning on its own;
  // every case that is not about rain first sets it to 10%.
  const quiet = (p: any) => { p.probabilityOfPrecipitation.value = 10; };
  const rainAt = (v: number) => ({ hours: { 5: (p: any) => { p.probabilityOfPrecipitation.value = v; } } });
  const tempAt = (v: number) => ({ hours: { 5: (p: any) => { quiet(p); p.temperature = v; } } });
  const windAt = (v: string) => ({ hours: { 5: (p: any) => { quiet(p); p.windSpeed = v; } } });
  const gustAt = (mph: number) => ({ hours: { 5: quiet }, gustMph: mph });

  it("rain above 70 is a severe warning", async () => {
    expect(await flags(rainAt(71))).toEqual({ rain: true, severe: true });
  });

  it("temperature below 20 is a severe warning", async () => {
    expect(await flags(tempAt(19))).toEqual({ rain: false, severe: true });
  });

  it("temperature above 100 is a severe warning", async () => {
    expect(await flags(tempAt(101))).toEqual({ rain: false, severe: true });
  });

  it("wind above 40 mph is a severe warning", async () => {
    expect(await flags(windAt("41 mph"))).toEqual({ rain: false, severe: true });
  });

  it("gust above 45 mph is a severe warning", async () => {
    expect(await flags(gustAt(46))).toEqual({ rain: false, severe: true });
  });

  it("rain exactly 40 does not raise the rain warning", async () => {
    expect(await flags(rainAt(40))).toEqual({ rain: false, severe: false });
  });

  it("rain exactly 70, temperature 20 and 100, wind 40 and gust 45 do not raise the severe flag", async () => {
    expect(await flags(rainAt(70))).toEqual({ rain: true, severe: false });
    expect(await flags(tempAt(20))).toEqual({ rain: false, severe: false });
    expect(await flags(tempAt(100))).toEqual({ rain: false, severe: false });
    expect(await flags(windAt("40 mph"))).toEqual({ rain: false, severe: false });
    expect(await flags(gustAt(45))).toEqual({ rain: false, severe: false });
  });

  it("missing values never raise a flag", async () => {
    const allNull = {
      hours: {
        5: (p: any) => {
          p.probabilityOfPrecipitation.value = null;
          p.temperature = null;
          p.windSpeed = null;
        },
      },
      gustMph: null,
    };
    expect(await flags(allNull)).toEqual({ rain: false, severe: false });
  });
});

describe("getEventWeather: the grid is down (B-003)", () => {
  it("the hours stand; the gust is null, no severe flag, and the rain flag follows the hour's chance", async () => {
    const w = router({
      [POINT_URL]: ok(points),
      [HOURLY_URL]: ok(hourly),
      [GRID_URL]: { status: 500, body: {} },
    });
    const e = (await run(EVENT, w))!;
    expect(e.hour.windGust).toBeNull();
    expect(e.isSevereWarning).toBe(false);
    expect(e.hour.precipProbability).toBe(44);
    expect(e.isRainWarning).toBe(true);
  });
});
