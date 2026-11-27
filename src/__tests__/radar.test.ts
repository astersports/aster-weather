import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  classifyEcho,
  parseRadarFrames,
  resolveRadar,
  getRadarRain,
  applyRadarToNow,
  applyRadarToToday,
  clearRadarCache,
  radarCondition,
  rainClaimFrom,
  radarWmoCode,
  BRIDGE_FRAMES,
  type EchoIntensity,
  type RadarFrame,
  type RadarRain,
} from "../radar.js";
import { getNow, clearNowCache, type NowReading } from "../now.js";
import { getDaily, clearDailyCache } from "../nws/daily.js";
import { clearStationsCache } from "../nws/observations.js";
import { clearPointCache } from "../nws/point.js";
import { clearGridCache } from "../nws/grid.js";
import { clearHourlyCache } from "../nws/hourly.js";
import { NWS_API, NOAA_MAPS } from "../nws/http.js";
import type { DayReading } from "../nws/daily.js";
import type { WeatherStore } from "../store.js";
import type { FetchImpl, WeatherErrorContext } from "../types.js";

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/nws/${name}`, import.meta.url), "utf8")) as Record<
    string,
    unknown
  >;
const radarFixture = load("radar-identify.json");
const points = load("points.json");
const stations = load("stations.json");
const observation = load("observation.json");
const hourly = load("hourly.json");
const grid = load("grid.json");
const forecast = load("forecast.json");

const COORDS = { lat: 41.03, lon: -73.76 };
const RADAR_PREFIX = `${NOAA_MAPS}/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer/identify?`;
const POINT_URL = `${NWS_API}/points/41.03,-73.76`;
const STATIONS_URL = "https://api.weather.gov/gridpoints/OKX/39,58/stations";
const HOURLY_URL = "https://api.weather.gov/gridpoints/OKX/39,58/forecast/hourly";
const GRID_URL = "https://api.weather.gov/gridpoints/OKX/39,58";
const FORECAST_URL = "https://api.weather.gov/gridpoints/OKX/39,58/forecast";
const OBS_KHPN = `${NWS_API}/stations/KHPN/observations/latest`;
const OBS_KLGA = `${NWS_API}/stations/KLGA/observations/latest`;
const NOW = 1795787700000; // 2026-11-27 13:55 UTC, the recording time
const MIN = 60_000;
const STORE_KEY = "aw:now:41.03,-73.76";
const DAILY_STORE_KEY = "aw:daily:41.03,-73.76";

/** An identify body with the given pixel colours and frame times (aligned by index). */
function identify(values: string[], times: number[]) {
  return {
    value: "NoData",
    properties: { Values: values },
    catalogItems: { features: times.map((t) => ({ attributes: { idp_validtime: t } })) },
  };
}

/** A hand-built RadarRain whose bridge is the given frames, newest first. */
function radarOf(bridge: RadarFrame[], checkedAt = NOW): RadarRain {
  return {
    rainingNow: bridge[0]?.intensity === "rain" || bridge[0]?.intensity === "heavy" || bridge[0]?.intensity === "storm",
    recentRain: bridge.some((f) => f.intensity === "rain" || f.intensity === "heavy" || f.intensity === "storm"),
    intensity: bridge[0]?.intensity ?? "none",
    latestFrameAt: bridge[0]?.at ?? null,
    checkedAt,
    bridgeFrames: bridge,
  };
}

/** A dry current reading, with fields the tests can override. */
function dry(over: Partial<NowReading> = {}): NowReading {
  return {
    stamp: { kind: "observed", at: NOW - 5 * MIN, fetchedAt: NOW, stale: false, source: "nws-station" },
    station: { id: "KHPN", name: "White Plains - Westchester County Airport" },
    temperature: 78,
    feelsLike: 80,
    dewPoint: 60,
    humidity: 60,
    windSpeed: 5,
    windDirection: null,
    windGust: null,
    pressure: null,
    visibility: null,
    cloudBase: null,
    precipLastHour: null,
    condition: "overcast",
    windy: false,
    isDay: true,
    ...over,
  };
}

/** A day of the seven-day strip, with fields the tests can override. */
function day(date: string, over: Partial<DayReading> = {}): DayReading {
  return {
    date,
    high: 78,
    low: 64,
    precipProbabilityMax: 17,
    dayCondition: "overcast",
    nightCondition: "overcast",
    windy: false,
    ...over,
  };
}

const TODAY = "2026-11-27";
const TOMORROW = "2026-11-28";

/** A stub that answers by URL prefix or exact URL. Unknown URLs answer 404. Records every call. */
interface Reply {
  status: number;
  body: unknown;
}
function router(script: Record<string, Reply>, radarReply?: Reply) {
  const calls: string[] = [];
  const fetchImpl: FetchImpl = async (url) => {
    calls.push(url);
    let r: Reply | undefined = script[url];
    if (!r && radarReply && url.startsWith(RADAR_PREFIX)) r = radarReply;
    if (!r) r = { status: 404, body: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { calls, fetchImpl };
}
const ok = (body: unknown): Reply => ({ status: 200, body });
const fail = (status: number): Reply => ({ status, body: {} });

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

/** The radar frames for the recorded point, parsed and resolved at NOW. */
const fixtureFrames = () => parseRadarFrames(radarFixture);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  clearRadarCache();
  clearNowCache();
  clearDailyCache();
  clearStationsCache();
  clearPointCache();
  clearGridCache();
  clearHourlyCache();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// classifyEcho: the palette, by hue family
// ---------------------------------------------------------------------------

describe("classifyEcho — hue families from live-sampled pixels", () => {
  it("transparent and NoData are 'none'", () => {
    expect(classifyEcho("0 0 0 0")).toBe("none");
    expect(classifyEcho("NoData")).toBe("none");
    expect(classifyEcho("")).toBe("none");
  });

  it("blue family is 'light', below the rain floor", () => {
    expect(classifyEcho("89 157 197 255")).toBe("light");
    expect(classifyEcho("83 141 188 255")).toBe("light");
    expect(classifyEcho("70 102 164 255")).toBe("light");
  });

  it("green family is 'rain', including the teal-tinted edge and the comma-separated form", () => {
    expect(classifyEcho("13 198 19 255")).toBe("rain");
    expect(classifyEcho("10 107 11 255")).toBe("rain");
    expect(classifyEcho("82 214 162 255")).toBe("rain");
    expect(classifyEcho("14, 206, 20, 255")).toBe("rain");
  });

  it("yellow/orange is 'heavy'", () => {
    expect(classifyEcho("255 211 0 255")).toBe("heavy");
    expect(classifyEcho("229 188 0 255")).toBe("heavy");
  });

  it("red through magenta/white extremes are 'storm'", () => {
    expect(classifyEcho("253 0 0 255")).toBe("storm");
    expect(classifyEcho("188 0 0 255")).toBe("storm");
    // Magenta has blue as its max channel. The check order keeps it a storm.
    expect(classifyEcho("248 0 253 255")).toBe("storm");
    expect(classifyEcho("253 253 253 255")).toBe("storm");
  });

  it("palette drift is 'unknown-echo', never 'none'", () => {
    for (const drifted of ["128 128 128 255", "0 200 200 255", "garbage"]) {
      const got = classifyEcho(drifted);
      expect(got).toBe("unknown-echo");
      expect(got, "an unrecognised colour must never read as dry").not.toBe("none");
    }
  });
});

// ---------------------------------------------------------------------------
// parseRadarFrames and resolveRadar: the time series
// ---------------------------------------------------------------------------

const MIN_ = 60 * 1000;

describe("the radar answer is a time series, not an instant", () => {
  const now = 1786470000000;

  it("frames align value[i] with validtime[i] and sort oldest first", () => {
    const frames = parseRadarFrames(identify(["13 198 19 255", "0 0 0 0"], [now - 4 * MIN_, now - 10 * MIN_]));
    expect(frames.map((f) => f.intensity)).toEqual(["none", "rain"]);
  });

  it("latest frame dry, rain 10 minutes ago: recentRain, not rainingNow", () => {
    const frames: RadarFrame[] = [
      { at: now - 10 * MIN_, intensity: "rain" },
      { at: now - 4 * MIN_, intensity: "none" },
    ];
    const r = resolveRadar(frames, now);
    expect(r?.rainingNow).toBe(false);
    expect(r?.recentRain).toBe(true);
  });

  it("rain 30 minutes ago is outside the 20-minute recent window", () => {
    const frames: RadarFrame[] = [
      { at: now - 30 * MIN_, intensity: "rain" },
      { at: now - 4 * MIN_, intensity: "none" },
    ];
    expect(resolveRadar(frames, now)?.recentRain).toBe(false);
  });

  it("'light' and 'unknown-echo' are below the rain floor, never claim rain, and stay reported", () => {
    for (const intensity of ["light", "unknown-echo"] as const) {
      const r = resolveRadar([{ at: now - 2 * MIN_, intensity }], now);
      expect(r?.rainingNow, `${intensity} fabricated a shower`).toBe(false);
      expect(r?.recentRain).toBe(false);
      expect(r?.intensity).toBe(intensity);
    }
  });

  it("no frames is no answer: null, never a 'dry' object", () => {
    expect(resolveRadar([], now)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The recorded fixture
// ---------------------------------------------------------------------------

describe("the recorded identify fixture", () => {
  it("parses 18 frames, sorted oldest first", () => {
    const frames = fixtureFrames();
    expect(frames).toHaveLength(18);
    expect(frames[0].at).toBe(1795780567000);
    expect(frames[17].at).toBe(1795787636000);
  });

  it("counts none / light / rain / heavy / storm as 12 / 5 / 1 / 0 / 0", () => {
    const frames = fixtureFrames();
    const count = (k: EchoIntensity) => frames.filter((f) => f.intensity === k).length;
    expect([count("none"), count("light"), count("rain"), count("heavy"), count("storm")]).toEqual([12, 5, 1, 0, 0]);
  });

  it("resolves at 1795787700000 to no rain, with the two newest frames newest first", () => {
    const r = resolveRadar(fixtureFrames(), 1795787700000)!;
    expect(r).toMatchObject({
      rainingNow: false,
      recentRain: false,
      intensity: "none",
      latestFrameAt: 1795787636000,
    });
    expect(r.bridgeFrames).toHaveLength(2);
    expect(r.bridgeFrames[0].at).toBe(1795787636000);
    expect(r.bridgeFrames[1].at).toBe(1795787277000);
  });
});

describe("parseRadarFrames — malformed input is no frames", () => {
  it("null and an empty object give []", () => {
    expect(parseRadarFrames(null)).toEqual([]);
    expect(parseRadarFrames({})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getRadarRain: a radar that cannot answer answers nothing
// ---------------------------------------------------------------------------

const radarUrlOf = (url: string) => new URL(url).searchParams;

describe("getRadarRain", () => {
  it("asks the identify URL with the parish point's parameters, and reads the recorded frames", async () => {
    const { calls, fetchImpl } = router({}, ok(radarFixture));
    const r = await getRadarRain(COORDS, { fetchImpl, now: () => 1795787700000 });
    expect(r).toMatchObject({ rainingNow: false, recentRain: false, intensity: "none" });
    expect(calls).toHaveLength(1);
    expect(calls[0].startsWith(RADAR_PREFIX)).toBe(true);
    expect(JSON.parse(radarUrlOf(calls[0]).get("geometry")!)).toEqual({
      x: -73.76,
      y: 41.03,
      spatialReference: { wkid: 4326 },
    });
  });

  it("a second call inside 4 minutes makes no new request", async () => {
    const { calls, fetchImpl } = router({}, ok(radarFixture));
    await getRadarRain(COORDS, { fetchImpl, now: () => NOW });
    await getRadarRain(COORDS, { fetchImpl, now: () => NOW + 3 * MIN });
    expect(calls).toHaveLength(1);
  });

  it("a 500 on a cold cache gives null and exactly one onError with call getRadarRain", async () => {
    const { fetchImpl } = router({}, fail(500));
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const pending = getRadarRain(COORDS, { fetchImpl, onError, now: () => NOW });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toEqual({ call: "getRadarRain", lat: 41.03, lon: -73.76 });
  });

  it("a 404 on a cold cache gives null and exactly one onError", async () => {
    const { fetchImpl } = router({}, fail(404));
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const pending = getRadarRain(COORDS, { fetchImpl, onError, now: () => NOW });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("a response with no frames gives null, never 'dry'", async () => {
    const { fetchImpl } = router({}, ok({ properties: { Values: [] }, catalogItems: { features: [] } }));
    const pending = getRadarRain(COORDS, { fetchImpl, now: () => NOW });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
  });

  it("a failing refresh 10 minutes after a good read returns the earlier read; 16 minutes after returns null", async () => {
    let body: Reply = ok(identify(["13 198 19 255"], [NOW - 2 * MIN]));
    const fetchImpl: FetchImpl = async () => ({
      ok: body.status < 300,
      status: body.status,
      json: async () => body.body,
    });
    const onError = vi.fn();
    const first = await getRadarRain(COORDS, { fetchImpl, onError, now: () => NOW });
    expect(first?.rainingNow).toBe(true);

    body = fail(500);
    const tenMin = getRadarRain(COORDS, { fetchImpl, onError, now: () => NOW + 10 * MIN });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await tenMin)?.rainingNow, "a recent radar read beats no read").toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);

    const sixteen = getRadarRain(COORDS, { fetchImpl, onError, now: () => NOW + 16 * MIN });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await sixteen, "too old to trust").toBeNull();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("keys the cache by coordinate: two points do not share one answer", async () => {
    const armonkBody = identify(["13 198 19 255"], [NOW]);
    const miamiBody = identify(["0 0 0 0"], [NOW]);
    const calls: string[] = [];
    const recording: FetchImpl = async (url) => {
      calls.push(url);
      const body = url.includes("41.1334") ? armonkBody : miamiBody;
      return { ok: true, status: 200, json: async () => body };
    };
    const armonk = await getRadarRain({ lat: 41.1334, lon: -73.7254 }, { fetchImpl: recording, now: () => NOW });
    const miami = await getRadarRain({ lat: 25.79, lon: -80.29 }, { fetchImpl: recording, now: () => NOW });
    expect(armonk?.rainingNow, "green echo at the parish").toBe(true);
    expect(miami?.rainingNow, "a second point inside the TTL must not inherit the first point's rain").toBe(false);
    expect(calls, "each coordinate is fetched").toHaveLength(2);
  });

  it("an invalid coordinate is null with no request", async () => {
    const { calls, fetchImpl } = router({}, ok(radarFixture));
    expect(await getRadarRain({ lat: 200, lon: 0 }, { fetchImpl, now: () => NOW })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The rain claim: the bridge, the floor, saturation
// ---------------------------------------------------------------------------

describe("rainClaimFrom — the bridge and the rain floor", () => {
  it("a rain frame in the bridge claims, stamped with its own frame", () => {
    const f = { at: NOW - 2 * MIN, intensity: "rain" as const };
    expect(rainClaimFrom(radarOf([f]), 60)).toEqual({ intensity: "rain", at: f.at });
  });

  it("blue echo claims only in saturated air (95% or more)", () => {
    const f = { at: NOW - 2 * MIN, intensity: "light" as const };
    expect(rainClaimFrom(radarOf([f]), 97)?.intensity).toBe("light");
    expect(rainClaimFrom(radarOf([f]), 94)).toBeNull();
    expect(rainClaimFrom(radarOf([f]), null)).toBeNull();
  });

  it("a rain frame a third back does not claim: the bridge is two frames", () => {
    expect(BRIDGE_FRAMES).toBe(2);
    const third = { at: NOW - 14 * MIN, intensity: "rain" as const };
    const radar = radarOf([
      { at: NOW, intensity: "none" },
      { at: NOW - 7 * MIN, intensity: "none" },
      third,
    ]);
    expect(rainClaimFrom(radar, 60)).toBeNull();
  });

  it("null radar gives no claim", () => {
    expect(rainClaimFrom(null, 60)).toBeNull();
  });
});

describe("radarCondition and radarWmoCode", () => {
  it("light showers become light-rain, heavier rain, storms thunderstorm", () => {
    expect(radarCondition("rain", 54)).toBe("light-rain");
    expect(radarCondition("heavy", 54)).toBe("rain");
    expect(radarCondition("storm", 54)).toBe("thunderstorm");
    expect(radarCondition("light", 54)).toBe("light-rain");
  });

  it("at or below 34 F the family is snow", () => {
    expect(radarCondition("rain", 30)).toBe("light-snow");
    expect(radarCondition("storm", 30)).toBe("snow");
    expect(radarCondition("rain", 34)).toBe("light-snow");
    expect(radarCondition("rain", 35)).toBe("light-rain");
  });

  it("a null temperature is not freezing", () => {
    expect(radarWmoCode("rain", null)).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// applyRadarToNow: radar may only ADD rain
// ---------------------------------------------------------------------------

describe("applyRadarToNow — the incident, and the add-only rule", () => {
  const FRAME_AT = NOW - 2 * MIN;
  const rainRadar = () => radarOf([{ at: FRAME_AT, intensity: "rain" }]);

  it("a dry overcast reading with a rain frame becomes precipitation, says so, and changes nothing else", () => {
    const before = dry();
    const after = applyRadarToNow(before, rainRadar());
    expect(after.condition).toBe(radarCondition("rain", 78));
    expect(after.condition).toBe("light-rain");
    expect(after).toEqual({
      ...before,
      condition: "light-rain",
      rainSource: "radar",
      radarAt: FRAME_AT,
    });
    expect(after.stamp.kind, "the upgrade does not relabel the reading kind").toBe("observed");
  });

  it("a reading already 'rain' is returned as the same object", () => {
    const reading = dry({ condition: "rain" });
    expect(applyRadarToNow(reading, rainRadar())).toBe(reading);
  });

  it("radar null returns the same object", () => {
    const reading = dry();
    expect(applyRadarToNow(reading, null)).toBe(reading);
  });

  it("a radar with intensity 'none' over a reading of 'rain' returns the same object: radar never removes rain", () => {
    const reading = dry({ condition: "rain" });
    expect(applyRadarToNow(reading, radarOf([{ at: FRAME_AT, intensity: "none" }]))).toBe(reading);
  });

  it("the model's own heavy rain is never rewritten by a storm echo", () => {
    const reading = dry({ condition: "heavy-rain" });
    expect(applyRadarToNow(reading, radarOf([{ at: FRAME_AT, intensity: "storm" }]))).toBe(reading);
  });

  it("at 30 F the upgraded condition is a snow condition", () => {
    const after = applyRadarToNow(dry({ temperature: 30 }), rainRadar());
    expect(after.condition).toBe("light-snow");
    expect(after.condition).toBe(radarCondition("rain", 30));
  });

  it("storm echo upgrades to thunderstorm; heavy echo to rain", () => {
    expect(applyRadarToNow(dry(), radarOf([{ at: FRAME_AT, intensity: "storm" }])).condition).toBe("thunderstorm");
    expect(applyRadarToNow(dry(), radarOf([{ at: FRAME_AT, intensity: "heavy" }])).condition).toBe("rain");
  });

  it("the morning: blue echo in saturated air becomes light rain", () => {
    const after = applyRadarToNow(dry({ humidity: 97 }), radarOf([{ at: FRAME_AT, intensity: "light" }]));
    expect(after.condition).toBe("light-rain");
    expect(after.rainSource).toBe("radar");
    expect(after.radarAt).toBe(FRAME_AT);
  });

  it("the same blue echo in dry air changes nothing: that is virga", () => {
    const reading = dry({ humidity: 60 });
    expect(applyRadarToNow(reading, radarOf([{ at: FRAME_AT, intensity: "light" }]))).toBe(reading);
  });

  it("a below-floor echo does not fabricate a shower", () => {
    const reading = dry();
    expect(applyRadarToNow(reading, radarOf([{ at: FRAME_AT, intensity: "light" }]))).toBe(reading);
    expect(applyRadarToNow(reading, radarOf([{ at: FRAME_AT, intensity: "unknown-echo" }]))).toBe(reading);
  });

  it("a cell that slipped between frames is stamped with the frame that saw it", () => {
    const older = FRAME_AT - 7 * MIN;
    const after = applyRadarToNow(
      dry(),
      radarOf([
        { at: FRAME_AT, intensity: "none" },
        { at: older, intensity: "rain" },
      ]),
    );
    expect(after.condition).toBe("light-rain");
    expect(after.radarAt, "not the newest frame, the one that saw it").toBe(older);
  });
});

// ---------------------------------------------------------------------------
// applyRadarToToday: only today, only dry days
// ---------------------------------------------------------------------------

describe("applyRadarToToday — only today, and only ADD rain", () => {
  const FRAME_AT = NOW - 2 * MIN;
  const rainRadar = () => radarOf([{ at: FRAME_AT, intensity: "rain" }]);

  it("only the entry whose date is today changes; other days are the same objects", () => {
    const days = [day(TODAY), day(TOMORROW)];
    const out = applyRadarToToday(days, rainRadar(), TODAY);
    expect(out[0]).not.toBe(days[0]);
    expect(out[0].dayCondition).toBe("light-rain");
    expect(out[0].rainSource).toBe("radar");
    expect(out[1]).toBe(days[1]);
    expect(out[0].precipProbabilityMax, "a forecast probability is not rewritten").toBe(17);
  });

  it("writes the claim to nightCondition when there is no day condition", () => {
    const out = applyRadarToToday([day(TODAY, { dayCondition: null, nightCondition: "overcast" })], rainRadar(), TODAY);
    expect(out[0].nightCondition).toBe("light-rain");
    expect(out[0].dayCondition).toBeNull();
  });

  it("an entry already showing precipitation is untouched", () => {
    const days = [day(TODAY, { dayCondition: "rain", nightCondition: "overcast" })];
    expect(applyRadarToToday(days, radarOf([{ at: FRAME_AT, intensity: "storm" }]), TODAY)).toBe(days);
  });

  it("radar null, or no entry for today, returns the same array", () => {
    const days = [day(TOMORROW)];
    expect(applyRadarToToday(days, rainRadar(), TODAY)).toBe(days);
    expect(applyRadarToToday(days, null, TOMORROW)).toBe(days);
    expect(applyRadarToToday([], rainRadar(), TODAY)).toEqual([]);
  });

  it("storm echo upgrades to thunderstorm; heavy echo to rain", () => {
    expect(applyRadarToToday([day(TODAY)], radarOf([{ at: FRAME_AT, intensity: "storm" }]), TODAY)[0].dayCondition).toBe(
      "thunderstorm",
    );
    expect(applyRadarToToday([day(TODAY)], radarOf([{ at: FRAME_AT, intensity: "heavy" }]), TODAY)[0].dayCondition).toBe(
      "rain",
    );
  });

  it("a day that never rises above freezing reads as snow", () => {
    const out = applyRadarToToday([day(TODAY, { high: 30 })], rainRadar(), TODAY);
    expect(out[0].dayCondition).toBe("light-snow");
  });

  it("blue echo never claims on the daily path: a day carries no humidity", () => {
    const days = [day(TODAY)];
    expect(applyRadarToToday(days, radarOf([{ at: FRAME_AT, intensity: "light" }]), TODAY)).toBe(days);
  });

  it("a cell that slipped between frames still reaches the strip", () => {
    const out = applyRadarToToday(
      [day(TODAY)],
      radarOf([
        { at: FRAME_AT, intensity: "none" },
        { at: FRAME_AT - 7 * MIN, intensity: "rain" },
      ]),
      TODAY,
    );
    expect(out[0].dayCondition).toBe("light-rain");
  });
});

// ---------------------------------------------------------------------------
// getNow with radar: the integration
// ---------------------------------------------------------------------------

function healthy(extra: Record<string, Reply> = {}, radarReply?: Reply) {
  return router(
    {
      [POINT_URL]: ok(points),
      [STATIONS_URL]: ok(stations),
      [OBS_KHPN]: ok(observation),
      [OBS_KLGA]: ok({ ...(structuredClone(observation) as object) }),
      [HOURLY_URL]: ok(hourly),
      [GRID_URL]: ok(grid),
      ...extra,
    },
    radarReply,
  );
}

describe("getNow with the radar", () => {
  it("the recorded radar (no rain) gives the same reading as without it, and no rainSource key", async () => {
    const plain = healthy({}, ok(radarFixture));
    const without = await getNow(COORDS, { fetchImpl: plain.fetchImpl, now: () => NOW });
    clearNowCache();
    clearRadarCache();
    const withRadar = await getNow(COORDS, { fetchImpl: healthy({}, ok(radarFixture)).fetchImpl, now: () => NOW, radar: true });
    expect(withRadar).toEqual(without);
    expect(withRadar).not.toHaveProperty("rainSource");
  });

  it("a green newest frame upgrades the reading to precipitation, and the store keeps the un-upgraded reading", async () => {
    const radarBody = identify(["30 200 30 255"], [NOW - 2 * MIN]);
    const store = memoryStore();
    const { fetchImpl } = healthy({}, ok(radarBody));
    const n = await getNow(COORDS, { fetchImpl, now: () => NOW, radar: true, store });
    expect(n!.condition).toBe("light-rain");
    expect(n!.rainSource).toBe("radar");
    expect(n!.radarAt).toBe(NOW - 2 * MIN);

    const stored = JSON.parse(store.data.get(STORE_KEY)!) as { data: Record<string, unknown> };
    expect(stored.data).not.toHaveProperty("rainSource");
    expect(stored.data).not.toHaveProperty("radarAt");
    expect(stored.data.condition).toBe("mostly-cloudy");
  });

  it("a second call inside the cache TTL is still upgraded: the radar is re-asked, the cache is not upgraded", async () => {
    const radarBody = identify(["30 200 30 255"], [NOW - 2 * MIN]);
    const { calls, fetchImpl } = healthy({}, ok(radarBody));
    const first = await getNow(COORDS, { fetchImpl, now: () => NOW, radar: true });
    const second = await getNow(COORDS, { fetchImpl, now: () => NOW + 2 * MIN, radar: true });
    expect(first!.rainSource).toBe("radar");
    expect(second!.rainSource).toBe("radar");
    expect(calls.filter((u) => u.startsWith(RADAR_PREFIX))).toHaveLength(1);
  });

  it("without radar: true the radar URL is never requested", async () => {
    const { calls, fetchImpl } = healthy({}, ok(radarFixture));
    await getNow(COORDS, { fetchImpl, now: () => NOW });
    expect(calls.some((u) => u.startsWith(RADAR_PREFIX))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getDaily with the radar: today is the venue's date
// ---------------------------------------------------------------------------

function dailyRouter(radarReply?: Reply) {
  return router(
    {
      [POINT_URL]: ok(points),
      [FORECAST_URL]: ok(forecast),
    },
    radarReply,
  );
}

describe("getDaily with the radar", () => {
  it("upgrades only the venue's today, and never stores the upgrade", async () => {
    // 2026-11-28 14:00 UTC is 09:00 on 11-28 at the venue. Its day cell is "bkn".
    const at = Date.parse("2026-11-28T14:00:00Z");
    const radarBody = identify(["30 200 30 255"], [at - 2 * MIN]);
    const store = memoryStore();
    const { fetchImpl } = dailyRouter(ok(radarBody));
    const out = await getDaily(COORDS, { fetchImpl, now: () => at, radar: true, store });
    expect(out!.days[1].date).toBe(TOMORROW);
    expect(out!.days[1].dayCondition).toBe("light-rain");
    expect(out!.days[1].rainSource).toBe("radar");
    expect(out!.days[0].rainSource).toBeUndefined();
    const stored = JSON.parse(store.data.get(DAILY_STORE_KEY)!) as { data: { days: Array<Record<string, unknown>> } };
    expect(stored.data.days[1]).not.toHaveProperty("rainSource");
  });

  it("today is the venue's date, not the UTC date: 02:00 UTC on 11-28 is still 11-27 at the venue", async () => {
    // 21:00 on 11-27 at the venue. The UTC date is 11-28, which must not be used.
    const at = Date.parse("2026-11-28T02:00:00Z");
    const radarBody = identify(["30 200 30 255"], [at - 2 * MIN]);
    const { fetchImpl } = dailyRouter(ok(radarBody));
    const out = await getDaily(COORDS, { fetchImpl, now: () => at, radar: true });
    expect(out!.days[1].rainSource, "11-28 must not be upgraded").toBeUndefined();
    expect(out!.days[1].dayCondition).toBe("mostly-cloudy");
  });

  it("without radar: true no radar request is made", async () => {
    const { calls, fetchImpl } = dailyRouter(ok(radarFixture));
    await getDaily(COORDS, { fetchImpl, now: () => NOW });
    expect(calls.some((u) => u.startsWith(RADAR_PREFIX))).toBe(false);
  });
});
