import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getWeather } from "../weather.js";
import { localDay } from "../localDay.js";
import { isPrecipitation } from "../condition.js";
import { clearPointCache } from "../nws/point.js";
import { clearStationsCache } from "../nws/observations.js";
import { clearGridCache } from "../nws/grid.js";
import { clearHourlyCache } from "../nws/hourly.js";
import { clearDailyCache } from "../nws/daily.js";
import { clearAlertsCache, getAlertsReading } from "../nws/alerts.js";
import { clearNowCache } from "../now.js";
import { clearRadarCache } from "../radar.js";
import { NWS_API } from "../nws/http.js";
import type { WeatherStore } from "../store.js";
import type { FetchImpl, WeatherErrorContext } from "../types.js";
import { setRetrySleep } from "../helpers.js";

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/nws/${name}`, import.meta.url), "utf8")) as any;
const points = load("points.json");
const stations = load("stations.json");
const observation = load("observation.json");
const hourly = load("hourly.json");
const grid = load("grid.json");
const forecast = load("forecast.json");
const alerts = load("alerts.json");
const radar = load("radar-identify.json");

const C = { lat: 41.03, lon: -73.76 };
const POINT_URL = `${NWS_API}/points/41.03,-73.76`;
const STATIONS_URL = "https://api.weather.gov/gridpoints/OKX/39,58/stations";
const HOURLY_URL = "https://api.weather.gov/gridpoints/OKX/39,58/forecast/hourly";
const GRID_URL = "https://api.weather.gov/gridpoints/OKX/39,58";
const FORECAST_URL = "https://api.weather.gov/gridpoints/OKX/39,58/forecast";
const OBS_KHPN = `${NWS_API}/stations/KHPN/observations/latest`;
const ALERTS = `${NWS_API}/alerts/active*`;
const RADAR = "https://mapservices.weather.noaa.gov/*";
const NOW = 1795787700000;
const KEY = "aw:now:41.03,-73.76";
const DRY_DAY = "https://api.weather.gov/icons/land/day/bkn?size=medium";
const DRY_NIGHT = "https://api.weather.gov/icons/land/night/bkn?size=medium";

interface Reply {
  status: number;
  body: unknown;
}

/** A stub by exact URL; a key ending in `*` matches any URL with that prefix. */
function router(script: Record<string, Reply>) {
  const calls: string[] = [];
  const fetchImpl: FetchImpl = async (url) => {
    calls.push(url);
    const key = Object.keys(script).find((k) =>
      k.endsWith("*") ? url.startsWith(k.slice(0, -1)) : url === k,
    );
    const r: Reply = key === undefined ? { status: 404, body: {} } : script[key]!;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { calls, fetchImpl };
}

const ok = (body: unknown): Reply => ({ status: 200, body });
const fail = (status: number): Reply => ({ status, body: {} });

/** Every NWS and NOAA answer a healthy engine asks, with overrides. */
function healthy(extra: Record<string, Reply> = {}, forecastBody: unknown = forecast, radarBody: unknown = radar) {
  return router({
    [POINT_URL]: ok(points),
    [STATIONS_URL]: ok(stations),
    [OBS_KHPN]: ok(observation),
    [HOURLY_URL]: ok(hourly),
    [GRID_URL]: ok(grid),
    [FORECAST_URL]: ok(forecastBody),
    [ALERTS]: ok(alerts),
    [RADAR]: ok(radarBody),
    ...extra,
  });
}

/** The forecast with today's day and night both dry, so a radar claim has something to change. */
function dryForecast() {
  const f = structuredClone(forecast);
  f.properties.periods[0].icon = DRY_DAY;
  f.properties.periods[1].icon = DRY_NIGHT;
  return f;
}

/** A radar answer whose newest frame (index 8, 13:53:56 UTC) reads as green rain. */
function claimingRadar() {
  const r = structuredClone(radar);
  r.properties.Values[8] = "86 202 176 255";
  return r;
}

function resetCaches() {
  clearPointCache();
  clearStationsCache();
  clearGridCache();
  clearHourlyCache();
  clearDailyCache();
  clearAlertsCache();
  clearNowCache();
  clearRadarCache();
}

beforeEach(resetCaches);

const isRadar = (u: string) => u.startsWith("https://mapservices.weather.noaa.gov/");

// Failure tests never wait on the real retry backoff (B-006).
beforeEach(() => setRetrySleep(async () => {}));
afterEach(() => setRetrySleep(null));

describe("getWeather: the one-call report", () => {
  it("gives every part for the fixture point", async () => {
    const w = (await getWeather(C, { fetchImpl: healthy().fetchImpl, now: () => NOW }))!;
    expect(w.place).toEqual({ lat: 41.03, lon: -73.76, timeZone: "America/New_York", city: "White Plains", state: "NY" });
    expect(w.now!.temperature).toBe(54);
    expect(w.alerts).toHaveLength(1);
    const reading = await getAlertsReading(C, { fetchImpl: healthy().fetchImpl, now: () => NOW, radar: false });
    expect(w.alertsReading).toEqual(reading);
    expect(w.alerts).toEqual(w.alertsReading!.alerts);
    expect(w.moon!.name).toBe("Waning gibbous");
    expect(w.hourly!.hours).toHaveLength(30);
    expect(w.daily!.days[0]!.date).toBe("2026-11-27");
    expect(w.sun!.sunrise).toBe(1795780591000);
    expect(w.radar!.latestFrameAt).toBe(1795787636000);
    expect(w.fetchedAt).toBe(NOW);
  });

  it("asks the radar exactly once per call", async () => {
    const h = healthy();
    await getWeather(C, { fetchImpl: h.fetchImpl, now: () => NOW });
    expect(h.calls.filter(isRadar)).toHaveLength(1);
  });

  it("does not ask the radar at all with radar: false", async () => {
    const h = healthy();
    const w = (await getWeather(C, { fetchImpl: h.fetchImpl, now: () => NOW, radar: false }))!;
    expect(h.calls.filter(isRadar)).toHaveLength(0);
    expect(w.radar).toBeNull();
    expect(w.now).not.toBeNull();
    expect(w.hourly).not.toBeNull();
    expect(w.daily).not.toBeNull();
    expect(w.alerts).not.toBeNull();
    expect(w.sun).not.toBeNull();
    expect(w.moon).not.toBeNull();
  });

  it("nulls only the alerts when the alerts request fails, and reports it once", async () => {
    const errors: { err: unknown; ctx: WeatherErrorContext }[] = [];
    const h = healthy({ [ALERTS]: fail(500) });
    const w = (await getWeather(C, {
      fetchImpl: h.fetchImpl,
      now: () => NOW,
      onError: (err, ctx) => errors.push({ err, ctx }),
    }))!;
    expect(w.alerts).toBeNull();
    expect(w.alertsReading).toBeNull();
    expect(w.now).not.toBeNull();
    expect(w.hourly).not.toBeNull();
    expect(w.daily).not.toBeNull();
    expect(w.sun).not.toBeNull();
    expect(w.radar).not.toBeNull();
    expect(errors.map((e) => e.ctx.call)).toEqual(["getAlerts"]);
  });

  it("a throwing onError hook costs only the part it fires for", async () => {
    const h = healthy({ [ALERTS]: fail(500) });
    const w = (await getWeather(C, {
      fetchImpl: h.fetchImpl,
      now: () => NOW,
      onError: (_err, ctx) => {
        if (ctx.call === "getAlerts") throw new Error("consumer hook broke");
      },
    }))!;
    expect(w.alerts).toBeNull();
    expect(w.now).not.toBeNull();
    expect(w.hourly).not.toBeNull();
    expect(w.daily).not.toBeNull();
    expect(w.radar).not.toBeNull();
  });

  it("nulls only the radar when the radar request fails; now and daily match a run without radar", async () => {
    const errors: string[] = [];
    const onError = (_err: unknown, ctx: WeatherErrorContext) => errors.push(ctx.call);
    const failing = (await getWeather(C, {
      fetchImpl: healthy({ [RADAR]: fail(500) }).fetchImpl,
      now: () => NOW,
      onError,
    }))!;
    expect(failing.radar).toBeNull();
    expect(errors).toEqual(["getRadarRain"]);

    resetCaches();
    const without = (await getWeather(C, { fetchImpl: healthy().fetchImpl, now: () => NOW, radar: false }))!;
    expect(failing.now).toEqual(without.now);
    expect(failing.daily).toEqual(without.daily);
  });

  it("returns null without calling onError when the point is outside coverage", async () => {
    const errors: string[] = [];
    const h = healthy({ [POINT_URL]: fail(404) });
    const w = await getWeather(C, {
      fetchImpl: h.fetchImpl,
      now: () => NOW,
      onError: (_e, ctx) => errors.push(ctx.call),
    });
    expect(w).toBeNull();
    expect(errors).toEqual([]);
    expect(h.calls).toEqual([POINT_URL]);
  });

  it("returns null with zero requests for invalid coordinates", async () => {
    const h = healthy();
    expect(await getWeather({ lat: 91, lon: -73.76 }, { fetchImpl: h.fetchImpl, now: () => NOW })).toBeNull();
    expect(h.calls).toHaveLength(0);
  });

  it("a radar that claims rain makes a dry now and today wet, and leaves tomorrow alone", async () => {
    const dry = (await getWeather(C, {
      fetchImpl: healthy({}, dryForecast(), radar).fetchImpl,
      now: () => NOW,
      radar: false,
    }))!;
    resetCaches();
    const wet = (await getWeather(C, {
      fetchImpl: healthy({}, dryForecast(), claimingRadar()).fetchImpl,
      now: () => NOW,
    }))!;
    expect(isPrecipitation(dry.now!.condition)).toBe(false);
    expect(wet.now!.rainSource).toBe("radar");
    expect(wet.now!.radarAt).toBe(1795787636000);
    expect(isPrecipitation(wet.now!.condition)).toBe(true);

    expect(dry.daily!.days[0]!.rainSource).toBeUndefined();
    expect(wet.daily!.days[0]!.rainSource).toBe("radar");
    expect(isPrecipitation(wet.daily!.days[0]!.dayCondition)).toBe(true);
    expect(wet.daily!.days[1]).toEqual(dry.daily!.days[1]);
  });

  it("the stored last-good reading does not carry the radar claim", async () => {
    const data = new Map<string, string>();
    const store: WeatherStore = {
      async get(k) { return data.has(k) ? data.get(k)! : null; },
      async set(k, v) { data.set(k, v); },
    };
    const w = (await getWeather(C, {
      fetchImpl: healthy({}, dryForecast(), claimingRadar()).fetchImpl,
      now: () => NOW,
      store,
    }))!;
    expect(w.now!.rainSource).toBe("radar");
    const stored = JSON.parse(data.get(KEY)!);
    expect(stored.data.rainSource).toBeUndefined();
    expect(stored.data.radarAt).toBeUndefined();
    expect(stored.data.condition).not.toBe(w.now!.condition);
  });

  it("uses the venue's date for radar, not UTC's: 21:00 in New York on the 27th is still the 27th", async () => {
    // 02:00 UTC on the 28th is 21:00 on the 27th in New York: the venue's "today" is the 27th.
    const clock = Date.parse("2026-11-28T02:00:00Z");
    const radarNow = structuredClone(claimingRadar());
    // Shift every frame so the newest is one minute before this clock, and it stays green.
    const newest = Math.max(...radarNow.catalogItems.features.map((f: any) => f.attributes.idp_validtime));
    const shift = clock - 60_000 - newest;
    for (const f of radarNow.catalogItems.features) f.attributes.idp_validtime += shift;

    const dryRun = (await getWeather(C, {
      fetchImpl: healthy({}, dryForecast(), radarNow).fetchImpl,
      now: () => clock,
      radar: false,
    }))!;
    resetCaches();
    const wet = (await getWeather(C, {
      fetchImpl: healthy({}, dryForecast(), radarNow).fetchImpl,
      now: () => clock,
    }))!;

    const day = (w: typeof wet, date: string) => w.daily!.days.find((d) => d.date === date)!;
    expect(wet.radar).not.toBeNull();
    expect(day(dryRun, "2026-11-27").rainSource).toBeUndefined();
    expect(isPrecipitation(day(dryRun, "2026-11-27").dayCondition)).toBe(false);
    expect(day(wet, "2026-11-27").rainSource).toBe("radar");
    expect(isPrecipitation(day(wet, "2026-11-27").dayCondition)).toBe(true);
    expect(day(wet, "2026-11-28")).toEqual(day(dryRun, "2026-11-28"));
    expect(day(wet, "2026-11-28").rainSource).toBeUndefined();
  });

  it("localDay gives the venue's calendar date, and null for an unusable zone", () => {
    expect(localDay(NOW, "America/New_York")).toBe("2026-11-27");
    expect(localDay(NOW, "Not/AZone")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B-013 through getWeather: the report's now and today take the same clock
// ---------------------------------------------------------------------------

/** A green newest frame whose validtime is `ageMin` minutes before `t`, as a radar reply. */
function greenFrameAgeReply(t: number, ageMin: number) {
  return ok({
    value: "NoData",
    properties: { Values: ["30 200 30 255"] },
    catalogItems: { features: [{ attributes: { idp_validtime: t - ageMin * 60_000 } }] },
  });
}

/** Route the radar's calls to `radar()` (read at each call) and every other URL to the healthy engine. */
function feedRadarWeather(radarReply: () => Reply) {
  const base = healthy({}, dryForecast());
  const fetchImpl: FetchImpl = async (url, init) => {
    if (!isRadar(url)) return base.fetchImpl(url, init);
    base.calls.push(url);
    const r = radarReply();
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
  };
  return { calls: base.calls, fetchImpl };
}

describe("B-013 through getWeather: now and today take the clock of the call", () => {
  it("wet at 19 minutes; a refresh fails at 14 minutes later and both now and today are dry again", async () => {
    let at = NOW;
    const feed = feedRadarWeather(() => (at === NOW + 14 * 60_000 ? fail(500) : greenFrameAgeReply(at, 19)));
    const first = (await getWeather(C, { fetchImpl: feed.fetchImpl, now: () => at }))!;
    expect(first.now!.rainSource).toBe("radar");
    expect(first.daily!.days[0]!.rainSource).toBe("radar");

    at = NOW + 30_000; // 19.5 minutes old: the cached answer still claims
    const thirtySeconds = (await getWeather(C, { fetchImpl: feed.fetchImpl, now: () => at }))!;
    expect(thirtySeconds.now!.rainSource).toBe("radar");
    expect(thirtySeconds.daily!.days[0]!.rainSource).toBe("radar");

    at = NOW + 14 * 60_000; // 33 minutes old: the refresh fails and the stale answer carries no claim
    const later = (await getWeather(C, { fetchImpl: feed.fetchImpl, now: () => at }))!;
    expect(feed.calls.filter(isRadar)).toHaveLength(2);
    expect(later.now).not.toHaveProperty("rainSource");
    expect(later.now).not.toHaveProperty("radarAt");
    expect(later.daily!.days[0]).not.toHaveProperty("rainSource");
    expect(later.daily!.days[0]).not.toHaveProperty("radarAt");
    expect(isPrecipitation(later.daily!.days[0]!.dayCondition)).toBe(false);
  });

  it("control: a radar that keeps answering with a frame one minute old is wet at T and at T + 14 minutes", async () => {
    let at = NOW;
    const feed = feedRadarWeather(() => greenFrameAgeReply(at, 1));
    const t0 = (await getWeather(C, { fetchImpl: feed.fetchImpl, now: () => at }))!;
    at = NOW + 14 * 60_000;
    const t14 = (await getWeather(C, { fetchImpl: feed.fetchImpl, now: () => at }))!;
    expect(t0.now!.rainSource).toBe("radar");
    expect(t14.now!.rainSource).toBe("radar");
    expect(t14.daily!.days[0]!.rainSource).toBe("radar");
    expect(feed.calls.filter(isRadar)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// B-013 through getWeather: the clock is read when the claim is made, not at the start
// ---------------------------------------------------------------------------

/** A green newest frame whose validtime is `ageMs` before `t`, as a radar reply. */
function greenFrameMsReply(t: number, ageMs: number) {
  return ok({
    value: "NoData",
    properties: { Values: ["30 200 30 255"] },
    catalogItems: { features: [{ attributes: { idp_validtime: t - ageMs } }] },
  });
}

/**
 * The radar is read with the clock at the start (a frame 20 minutes less 1 s old
 * then). The hourly forecast waits until that read has happened, then moves the
 * clock by `advanceMs` and answers. Every other URL is the healthy engine.
 */
function agingWeather(clock: { at: number }, advanceMs: number) {
  const base = healthy({}, dryForecast());
  const read = { at: null as number | null };
  const radarReply = greenFrameMsReply(NOW, 20 * 60_000 - 1000);
  const fetchImpl: FetchImpl = async (url, init) => {
    if (isRadar(url)) {
      base.calls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => {
          read.at = clock.at;
          return radarReply.body;
        },
      };
    }
    if (url === HOURLY_URL) {
      for (let i = 0; i < 500 && read.at === null; i += 1) await Promise.resolve();
      for (let i = 0; i < 50; i += 1) await Promise.resolve();
      clock.at += advanceMs;
    }
    return base.fetchImpl(url, init);
  };
  return { fetchImpl, calls: base.calls, read };
}

describe("B-013 through getWeather: a frame that ages out while the report loads", () => {
  it("live when read, aged out 5 s later: now and today take no claim, and fetchedAt is the clock at the start", async () => {
    const clock = { at: NOW };
    const w = agingWeather(clock, 5000);
    const out = (await getWeather(C, { fetchImpl: w.fetchImpl, now: () => clock.at }))!;
    expect(w.read.at).toBe(NOW);
    expect(clock.at).toBe(NOW + 5000);
    expect(out.fetchedAt).toBe(NOW);
    expect(out.now).not.toHaveProperty("rainSource");
    expect(out.now).not.toHaveProperty("radarAt");
    expect(out.daily!.days[0]).not.toHaveProperty("rainSource");
    expect(out.daily!.days[0]).not.toHaveProperty("radarAt");
    expect(isPrecipitation(out.daily!.days[0]!.dayCondition)).toBe(false);
    // The radar kept the frame at its read, and that read ran at the start clock, before the advance.
    expect(out.radar, "the radar kept the frame at the read").not.toBeNull();
    expect(out.radar!.rainingNow).toBe(true);
    expect(out.radar!.checkedAt, "the read ran at the start clock").toBe(NOW);
    expect(out.radar!.latestFrameAt).toBe(NOW - (20 * 60_000 - 1000));
  });

  it("control: the same frame with the clock still at the start makes now and today wet", async () => {
    const clock = { at: NOW };
    const w = agingWeather(clock, 0);
    const out = (await getWeather(C, { fetchImpl: w.fetchImpl, now: () => clock.at }))!;
    expect(w.read.at).toBe(NOW);
    expect(out.fetchedAt).toBe(NOW);
    expect(out.now).toMatchObject({ rainSource: "radar", radarAt: NOW - (20 * 60_000 - 1000) });
    expect(out.daily!.days[0]).toMatchObject({ rainSource: "radar" });
    expect(out.radar, "the radar kept the frame at the read").not.toBeNull();
    expect(out.radar!.rainingNow).toBe(true);
    expect(out.radar!.checkedAt, "the read ran at the start clock").toBe(NOW);
    expect(out.radar!.latestFrameAt).toBe(NOW - (20 * 60_000 - 1000));
  });
});

/** A store that keeps every write, so a healthy report can seed the last-good readings. */
function lastGoodStore(): WeatherStore {
  const data = new Map<string, string>();
  return {
    async get(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    async set(key, value) {
      data.set(key, value);
    },
  };
}

const NWS_FORECAST_CALLS = [STATIONS_URL, OBS_KHPN, HOURLY_URL, GRID_URL, FORECAST_URL];

describe("getWeather — a failed point lookup still gives a report", () => {
  it("points 500 with a stored report: the stored parts come back stale, the place is empty, the sun is null, and only the points URL and alerts and radar are asked", async () => {
    const store = lastGoodStore();
    await getWeather(C, { fetchImpl: healthy().fetchImpl, store, now: () => NOW });
    resetCaches();

    const h = healthy({ [POINT_URL]: fail(500) });
    const onError = vi.fn();
    const w = (await getWeather(C, { fetchImpl: h.fetchImpl, store, now: () => NOW, onError }))!;
    expect(w).not.toBeNull();
    expect(w.place).toEqual({ lat: 41.03, lon: -73.76, timeZone: null, city: null, state: null });
    expect(w.now!.stamp.stale).toBe(true);
    expect(w.now!.stamp.fetchedAt).toBe(NOW);
    expect(w.hourly!.stamp.stale).toBe(true);
    expect(w.daily!.stamp.stale).toBe(true);
    expect(w.alerts).toHaveLength(1);
    expect(w.sun).toBeNull();
    expect(w.moon).not.toBeNull();

    expect(h.calls.filter((u) => u === POINT_URL)).toHaveLength(2);
    expect(h.calls.filter((u) => NWS_FORECAST_CALLS.includes(u))).toHaveLength(0);
    expect(h.calls.filter(isRadar)).toHaveLength(1);
    expect(onError.mock.calls.map((c) => (c[1] as WeatherErrorContext).call)).toEqual(["getPoint"]);
  });

  it("points 500 with no store: a report with now, hourly and daily all null, and alerts still given", async () => {
    const h = healthy({ [POINT_URL]: fail(500) });
    const w = (await getWeather(C, { fetchImpl: h.fetchImpl, now: () => NOW }))!;
    expect(w).not.toBeNull();
    expect(w.now).toBeNull();
    expect(w.hourly).toBeNull();
    expect(w.daily).toBeNull();
    expect(w.alerts).toHaveLength(1);
    expect(w.sun).toBeNull();
  });

  it("points 404: null, and the points URL is the only request", async () => {
    const h = healthy({ [POINT_URL]: fail(404) });
    expect(await getWeather(C, { fetchImpl: h.fetchImpl, now: () => NOW })).toBeNull();
    expect(h.calls).toEqual([POINT_URL]);
  });
});
