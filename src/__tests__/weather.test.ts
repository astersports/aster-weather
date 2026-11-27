import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { getWeather } from "../weather.js";
import { localDay } from "../localDay.js";
import { isPrecipitation } from "../condition.js";
import { clearPointCache } from "../nws/point.js";
import { clearStationsCache } from "../nws/observations.js";
import { clearGridCache } from "../nws/grid.js";
import { clearHourlyCache } from "../nws/hourly.js";
import { clearDailyCache } from "../nws/daily.js";
import { clearAlertsCache } from "../nws/alerts.js";
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
