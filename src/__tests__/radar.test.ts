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
  radarTimeoutMs,
  RADAR_TIMEOUT_MS,
  BRIDGE_FRAMES,
  MAX_FRAME_AGE_MS,
  RADAR_RETRY_AFTER_MS,
  type EchoIntensity,
  type RadarFrame,
  type RadarRain,
} from "../radar.js";
import type { Condition } from "../condition.js";
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

describe("radarCondition — the direct mapping, every intensity at every temperature", () => {
  // Rows: [intensity, temperature F, expected Condition]. `none` and `unknown-echo` are
  // never passed in by a claim (rainClaimFrom filters them); the rows pin the fallthrough.
  it.each<[EchoIntensity, number | null, Condition]>([
    ["none", 70, "light-rain"],
    ["none", 35, "light-rain"],
    ["none", 34, "light-snow"],
    ["none", 20, "light-snow"],
    ["none", null, "light-rain"],
    ["light", 70, "light-rain"],
    ["light", 35, "light-rain"],
    ["light", 34, "light-snow"],
    ["light", 20, "light-snow"],
    ["light", null, "light-rain"],
    ["rain", 70, "light-rain"],
    ["rain", 35, "light-rain"],
    ["rain", 34, "light-snow"],
    ["rain", 20, "light-snow"],
    ["rain", null, "light-rain"],
    ["heavy", 70, "rain"],
    ["heavy", 35, "rain"],
    ["heavy", 34, "snow"],
    ["heavy", 20, "snow"],
    ["heavy", null, "rain"],
    ["storm", 70, "thunderstorm"],
    ["storm", 35, "thunderstorm"],
    ["storm", 34, "snow"],
    ["storm", 20, "snow"],
    ["storm", null, "thunderstorm"],
    ["unknown-echo", 70, "light-rain"],
    ["unknown-echo", 35, "light-rain"],
    ["unknown-echo", 34, "light-snow"],
    ["unknown-echo", 20, "light-snow"],
    ["unknown-echo", null, "light-rain"],
  ])("radarCondition(%s, %s) is %s", (intensity, temperatureF, expected) => {
    expect(radarCondition(intensity, temperatureF)).toBe(expected);
  });

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
    // Was radarWmoCode("rain", null) === 80, which is Light showers, icon light-rain.
    expect(radarCondition("rain", null)).toBe("light-rain");
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

describe("getDaily asks no radar without a usable time zone, and a failed radar changes nothing", () => {
  /** The recorded point with its time zone set to `zone`, or removed when `zone` is undefined. */
  function pointWithZone(zone: string | null | undefined) {
    const body = structuredClone(points) as { properties: Record<string, unknown> };
    if (zone === undefined) delete body.properties.timeZone;
    else body.properties.timeZone = zone;
    return body;
  }
  const radarHits = (calls: string[]) => calls.filter((u) => u.startsWith(RADAR_PREFIX)).length;
  const noClaim = (days: DayReading[]) => days.every((d) => !("rainSource" in d));

  it("a point with a null time zone: the forecast is still given, and zero radar requests are made", async () => {
    const plain = router({ [POINT_URL]: ok(pointWithZone(null)), [FORECAST_URL]: ok(forecast) });
    const base = await getDaily(COORDS, { fetchImpl: plain.fetchImpl, now: () => DAY_AT });
    clearDailyCache();
    clearPointCache();
    const { calls, fetchImpl } = router(
      { [POINT_URL]: ok(pointWithZone(null)), [FORECAST_URL]: ok(forecast) },
      greenAt(DAY_AT),
    );
    const out = await getDaily(COORDS, { fetchImpl, now: () => DAY_AT, radar: true });
    expect(out).not.toBeNull();
    expect(out!.days.length).toBeGreaterThan(0);
    expect(out!.days).toEqual(base!.days);
    expect(noClaim(out!.days)).toBe(true);
    expect(radarHits(calls)).toBe(0);
  });

  it("a point with an unusable time zone (Not/AZone): the forecast is still given, and zero radar requests are made", async () => {
    const plain = router({ [POINT_URL]: ok(pointWithZone("Not/AZone")), [FORECAST_URL]: ok(forecast) });
    const base = await getDaily(COORDS, { fetchImpl: plain.fetchImpl, now: () => DAY_AT });
    clearDailyCache();
    clearPointCache();
    const { calls, fetchImpl } = router(
      { [POINT_URL]: ok(pointWithZone("Not/AZone")), [FORECAST_URL]: ok(forecast) },
      greenAt(DAY_AT),
    );
    const out = await getDaily(COORDS, { fetchImpl, now: () => DAY_AT, radar: true });
    expect(out).not.toBeNull();
    expect(out!.days.length).toBeGreaterThan(0);
    expect(out!.days).toEqual(base!.days);
    expect(noClaim(out!.days)).toBe(true);
    expect(radarHits(calls)).toBe(0);
  });

  it("a radar that fails (500): the daily forecast equals the radar-off reading, one radar request, one onError", async () => {
    const plain = await getDaily(COORDS, { fetchImpl: dailyRouter().fetchImpl, now: () => DAY_AT });
    clearDailyCache();
    clearPointCache();
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const { calls, fetchImpl } = router({ [POINT_URL]: ok(points), [FORECAST_URL]: ok(forecast) }, fail(500));
    const out = await settle(getDaily(COORDS, { fetchImpl, now: () => DAY_AT, radar: true, onError }));
    expect(out!.days).toEqual(plain!.days);
    expect(noClaim(out!.days)).toBe(true);
    expect(radarHits(calls)).toBe(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toEqual({ call: "getRadarRain", lat: 41.03, lon: -73.76 });
  });

  it("control: a usable zone and a claiming radar make exactly one radar request and claim venue today", async () => {
    const { calls, fetchImpl } = router(
      { [POINT_URL]: ok(points), [FORECAST_URL]: ok(forecast) },
      greenAt(DAY_AT),
    );
    const out = await settle(getDaily(COORDS, { fetchImpl, now: () => DAY_AT, radar: true }));
    expect(radarHits(calls)).toBe(1);
    expect(out!.days.find((d) => d.date === VENUE_TODAY)).toMatchObject({ rainSource: "radar" });
  });
});

// ---------------------------------------------------------------------------
// Latency: one attempt, four seconds at most, alongside the reading
// ---------------------------------------------------------------------------

const isRadarCall = (u: string) => u.startsWith(RADAR_PREFIX);
const VENUE_TODAY = "2026-11-28"; // the venue's date at 14:00 UTC on 11-28
const NEXT_DAY = "2026-11-29";
const DAY_AT = Date.parse("2026-11-28T14:00:00Z");

/** A green newest frame, two minutes before `t`: the radar claims rain at `t`. */
const greenAt = (t: number) => ok(identify(["30 200 30 255"], [t - 2 * MIN]));

/** A promise the test settles by hand, so the order of requests can be proven. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Let ready microtasks run until `cond` holds. Bounded, so a missing request fails rather than hangs. */
async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 500 && !cond(); i += 1) await Promise.resolve();
  expect(cond(), "the condition was never reached").toBe(true);
}

/**
 * Await a call under fake timers. A failing upstream is retried after a backoff
 * timer, so advance the clock until the call settles (bounded).
 */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  const tracked = p.finally(() => {
    done = true;
  });
  for (let i = 0; i < 100 && !done; i += 1) await vi.advanceTimersByTimeAsync(100);
  expect(done, "the call never settled").toBe(true);
  return tracked;
}

/** A router where one URL waits for `gate` before it answers. */
function gatedRouter(script: Record<string, Reply>, gateUrl: string, gate: Promise<Reply>, radarReply?: Reply) {
  const calls: string[] = [];
  const fetchImpl: FetchImpl = async (url) => {
    calls.push(url);
    let r: Reply | undefined = url === gateUrl ? await gate : script[url];
    if (!r && radarReply && isRadarCall(url)) r = radarReply;
    if (!r) r = { status: 404, body: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { calls, fetchImpl };
}

/** A radar that never answers, and gives up only when its abort signal fires. */
function hungRadar(calls: string[]): FetchImpl {
  return (url, init) => {
    calls.push(url);
    return new Promise<never>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  };
}

describe("radarTimeoutMs — the caller can shorten the radar budget, never lengthen it", () => {
  it("the radar's own budget is four seconds", () => {
    expect(RADAR_TIMEOUT_MS).toBe(4000);
  });

  it.each([
    [undefined, 4000],
    [100, 100],
    [9000, 4000],
    [0, 4000],
    [-5, 4000],
    [NaN, 4000],
    [Infinity, 4000],
  ])("radarTimeoutMs(%s) is %s", (input, expected) => {
    expect(radarTimeoutMs(input)).toBe(expected);
  });
});

describe("getRadarRain — one attempt, four seconds at most", () => {
  it("a 500 is asked once, never retried: one radar request, one onError, null", async () => {
    const { calls, fetchImpl } = router({}, fail(500));
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const pending = getRadarRain(COORDS, { fetchImpl, onError, now: () => NOW });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull();
    expect(calls.filter(isRadarCall)).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("a hung radar with a 20 ms caller budget: null, one request, one onError, back in well under a second", async () => {
    vi.useRealTimers();
    const calls: string[] = [];
    const onError = vi.fn();
    const started = Date.now();
    const result = await getRadarRain(COORDS, {
      fetchImpl: hungRadar(calls),
      onError,
      timeoutMs: 20,
      now: () => NOW,
    });
    const elapsed = Date.now() - started;
    expect(result).toBeNull();
    expect(calls.filter(isRadarCall)).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(1000);
  });

  it("with no caller budget a hung radar settles at four seconds, not later, after one request", async () => {
    const calls: string[] = [];
    const onError = vi.fn();
    let settled = false;
    const pending = getRadarRain(COORDS, { fetchImpl: hungRadar(calls), onError, now: () => NOW }).then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(3_999);
    expect(settled, "still waiting at 3999 ms").toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();
    expect(calls.filter(isRadarCall)).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("the radar is asked alongside the reading, not after it", () => {
  it("getNow sends the radar request while the station observation is still unanswered", async () => {
    const gate = deferred<Reply>();
    const { calls, fetchImpl } = gatedRouter(
      { [POINT_URL]: ok(points), [STATIONS_URL]: ok(stations) },
      OBS_KHPN,
      gate.promise,
      greenAt(NOW),
    );
    const pending = getNow(COORDS, { fetchImpl, now: () => NOW, radar: true });
    await until(() => calls.includes(OBS_KHPN) && calls.some(isRadarCall));
    gate.resolve(ok(observation));
    const n = await pending;
    expect(n).toMatchObject({ stamp: { kind: "observed" }, condition: "light-rain", rainSource: "radar" });
  });

  it("getDaily sends the radar request while the seven-day forecast is still unanswered", async () => {
    const gate = deferred<Reply>();
    const { calls, fetchImpl } = gatedRouter(
      { [POINT_URL]: ok(points) },
      FORECAST_URL,
      gate.promise,
      greenAt(DAY_AT),
    );
    const pending = getDaily(COORDS, { fetchImpl, now: () => DAY_AT, radar: true });
    await until(() => calls.includes(FORECAST_URL) && calls.some(isRadarCall));
    gate.resolve(ok(forecast));
    const out = await pending;
    expect(out!.days.find((d) => d.date === VENUE_TODAY)).toMatchObject({ rainSource: "radar", dayCondition: "light-rain" });
    expect(out!.days.find((d) => d.date === NEXT_DAY)).not.toHaveProperty("rainSource");
  });
});

// ---------------------------------------------------------------------------
// Radar is applied on every path that returns a reading (getNow)
// ---------------------------------------------------------------------------

describe("getNow with the radar: every path that returns a reading takes the claim", () => {
  it("the forecast hour, when the stations fail: wet, from the hour's own dry reading", async () => {
    const at = Date.parse("2026-11-28T01:30:00Z"); // the 20:00 hour at the venue, mostly cloudy
    const { fetchImpl } = healthy({ [STATIONS_URL]: fail(500) }, greenAt(at));
    const plain = await settle(getNow(COORDS, { fetchImpl, now: () => at }));
    expect(plain!.stamp.kind).toBe("forecast");
    expect(plain!.condition).toBe("mostly-cloudy");
    const wet = await settle(getNow(COORDS, { fetchImpl, now: () => at, radar: true }));
    expect(wet).toMatchObject({ condition: "light-rain", rainSource: "radar", stamp: { kind: "forecast" } });
    expect(plain, "the cached copy carries no claim").not.toHaveProperty("rainSource");
  });

  it("a stale cached reading after a failed refresh: wet, and the cached copy carries no claim", async () => {
    const store = memoryStore();
    const seeded = await getNow(COORDS, { fetchImpl: healthy().fetchImpl, now: () => NOW, store });
    expect(seeded!.stamp.kind).toBe("observed");
    const later = NOW + 30 * MIN; // past the 10-minute freshness, inside the 3-hour bound
    const failing = { [OBS_KHPN]: fail(500), [OBS_KLGA]: fail(500), [HOURLY_URL]: fail(500) };
    const onError = vi.fn();
    const n = await settle(
      getNow(COORDS, {
        fetchImpl: healthy(failing, greenAt(later)).fetchImpl,
        now: () => later,
        radar: true,
        store,
        onError,
      }),
    );
    const getNowErrors = onError.mock.calls.filter(([, ctx]) => ctx.call === "getNow");
    expect(getNowErrors, "one onError for the failed getNow").toHaveLength(1);
    expect(n).toMatchObject({ stamp: { stale: true }, condition: "light-rain", rainSource: "radar" });

    const plain = await settle(getNow(COORDS, { fetchImpl: healthy(failing).fetchImpl, now: () => later, store }));
    expect(plain).not.toHaveProperty("rainSource");
    expect(plain!.condition).toBe("mostly-cloudy");
    expect(JSON.parse(store.data.get(STORE_KEY)!).data).not.toHaveProperty("rainSource");
  });

  it("a last-good reading from the store on a cold cache: wet, and the stored copy carries no claim", async () => {
    const store = memoryStore();
    await getNow(COORDS, { fetchImpl: healthy().fetchImpl, now: () => NOW, store });
    clearNowCache();
    clearStationsCache();
    const later = NOW + 30 * MIN;
    const failing = { [OBS_KHPN]: fail(500), [OBS_KLGA]: fail(500), [HOURLY_URL]: fail(500) };
    const n = await settle(
      getNow(COORDS, {
        fetchImpl: healthy(failing, greenAt(later)).fetchImpl,
        now: () => later,
        radar: true,
        store,
      }),
    );
    expect(n).toMatchObject({ stamp: { stale: true }, condition: "light-rain", rainSource: "radar" });
    expect(JSON.parse(store.data.get(STORE_KEY)!).data).not.toHaveProperty("rainSource");
  });
});

// ---------------------------------------------------------------------------
// Radar is applied on every path that returns a reading (getDaily)
// ---------------------------------------------------------------------------

describe("getDaily with the radar: stale and stored paths take the claim on today only", () => {
  it("a stale cached forecast after a failed refresh: today wet, tomorrow untouched, the cached copy clean", async () => {
    const store = memoryStore();
    const seeded = await getDaily(COORDS, { fetchImpl: dailyRouter().fetchImpl, now: () => DAY_AT, store });
    expect(seeded!.days.find((d) => d.date === VENUE_TODAY)!.dayCondition).toBe("mostly-cloudy");
    const later = DAY_AT + 70 * MIN; // past the hour's freshness, inside 24 hours
    const failing = router({ [POINT_URL]: ok(points), [FORECAST_URL]: fail(500) }, greenAt(later));
    const n = await settle(getDaily(COORDS, { fetchImpl: failing.fetchImpl, now: () => later, radar: true, store }));
    expect(n!.stamp.stale).toBe(true);
    expect(n!.days.find((d) => d.date === VENUE_TODAY)).toMatchObject({ dayCondition: "light-rain", rainSource: "radar" });
    expect(n!.days.find((d) => d.date === NEXT_DAY)).not.toHaveProperty("rainSource");

    const plain = await settle(getDaily(COORDS, { fetchImpl: failing.fetchImpl, now: () => later, store }));
    expect(plain!.days.find((d) => d.date === VENUE_TODAY)).not.toHaveProperty("rainSource");
    expect(plain!.days.find((d) => d.date === VENUE_TODAY)!.dayCondition).toBe("mostly-cloudy");
  });

  it("a last-good forecast from the store on a cold cache: today wet, and the stored copy clean", async () => {
    const store = memoryStore();
    await getDaily(COORDS, { fetchImpl: dailyRouter().fetchImpl, now: () => DAY_AT, store });
    clearDailyCache();
    const later = DAY_AT + 70 * MIN;
    const failing = router({ [POINT_URL]: ok(points), [FORECAST_URL]: fail(500) }, greenAt(later));
    const n = await settle(getDaily(COORDS, { fetchImpl: failing.fetchImpl, now: () => later, radar: true, store }));
    expect(n!.stamp.stale).toBe(true);
    expect(n!.days.find((d) => d.date === VENUE_TODAY)).toMatchObject({ dayCondition: "light-rain", rainSource: "radar" });
    expect(n!.days.find((d) => d.date === NEXT_DAY)).not.toHaveProperty("rainSource");
    const stored = JSON.parse(store.data.get(DAILY_STORE_KEY)!) as { data: { days: Array<Record<string, unknown>> } };
    expect(stored.data.days.find((d) => d.date === VENUE_TODAY)).not.toHaveProperty("rainSource");
  });
});

// ---------------------------------------------------------------------------
// The bridge below the rain floor, with two frames
// ---------------------------------------------------------------------------

describe("the two newest frames below the floor claim nothing", () => {
  const frameAt = NOW - 2 * MIN;

  it("two unknown-echo frames claim nothing on either path, even with rain a third frame back", () => {
    const radar = radarOf([
      { at: frameAt, intensity: "unknown-echo" },
      { at: frameAt - 7 * MIN, intensity: "unknown-echo" },
      { at: frameAt - 14 * MIN, intensity: "rain" },
    ]);
    const reading = dry({ humidity: 97 });
    expect(applyRadarToNow(reading, radar)).toBe(reading);
    const days = [day(TODAY)];
    expect(applyRadarToToday(days, radar, TODAY)).toBe(days);
  });

  it("two light frames claim nothing on the daily path, which carries no humidity", () => {
    const radar = radarOf([
      { at: frameAt, intensity: "light" },
      { at: frameAt - 7 * MIN, intensity: "light" },
    ]);
    const days = [day(TODAY)];
    expect(applyRadarToToday(days, radar, TODAY)).toBe(days);
  });
});

// ---------------------------------------------------------------------------
// A point outside coverage asks the radar nothing
// ---------------------------------------------------------------------------

describe("a point outside coverage makes no radar request", () => {
  it("getNow and getDaily are null with radar: true, and the radar is never asked", async () => {
    const { calls, fetchImpl } = healthy({ [POINT_URL]: fail(404) }, greenAt(NOW));
    expect(await getNow(COORDS, { fetchImpl, now: () => NOW, radar: true })).toBeNull();
    expect(await getDaily(COORDS, { fetchImpl, now: () => NOW, radar: true })).toBeNull();
    expect(calls.filter(isRadarCall)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B-009: a radar frame has an age limit of its own
// ---------------------------------------------------------------------------

describe("B-009 — a radar frame has an age limit of its own", () => {
  const now = NOW;

  it("the frame age limit is 20 minutes", () => {
    expect(MAX_FRAME_AGE_MS).toBe(20 * MIN);
  });

  it("two green frames three hours old: no answer, and a dry reading stays dry", () => {
    const old: RadarFrame[] = [
      { at: now - 180 * MIN, intensity: "rain" },
      { at: now - 179 * MIN, intensity: "rain" },
    ];
    expect(resolveRadar(old, now)).toBeNull();
    const reading = dry();
    expect(applyRadarToNow(reading, resolveRadar(old, now))).toBe(reading);
  });

  it("the newest frame 21 minutes old is no answer", () => {
    expect(resolveRadar([{ at: now - 21 * MIN, intensity: "rain" }], now)).toBeNull();
  });

  it("the newest frame exactly 20 minutes old is an answer", () => {
    const r = resolveRadar([{ at: now - 20 * MIN, intensity: "rain" }], now);
    expect(r).toMatchObject({ rainingNow: true, latestFrameAt: now - 20 * MIN });
  });

  it("old green frames plus two recent dry frames: the old ones are ignored and the bridge holds only the recent ones", () => {
    const frames: RadarFrame[] = [
      { at: now - 180 * MIN, intensity: "rain" },
      { at: now - 120 * MIN, intensity: "storm" },
      { at: now - 8 * MIN, intensity: "none" },
      { at: now - 2 * MIN, intensity: "none" },
    ];
    const r = resolveRadar(frames, now)!;
    expect(r.rainingNow).toBe(false);
    expect(r.recentRain).toBe(false);
    expect(r.bridgeFrames.map((f) => f.at)).toEqual([now - 2 * MIN, now - 8 * MIN]);
  });

  it("a frame dated after now is kept (the device clock may run behind the radar's)", () => {
    const r = resolveRadar([{ at: now + 3 * MIN, intensity: "rain" }], now);
    expect(r).toMatchObject({ rainingNow: true, latestFrameAt: now + 3 * MIN });
  });

  it("getRadarRain on a payload whose frames are all old: null, and onError once", async () => {
    const { fetchImpl } = router({}, ok(identify(["13 198 19 255"], [NOW - 180 * MIN])));
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const out = await settle(getRadarRain(COORDS, { fetchImpl, onError, now: () => now }));
    expect(out).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// B-011: a failed radar read is remembered for one minute
// ---------------------------------------------------------------------------

/** A fetch whose reply can be changed between calls. Records every URL it is asked. */
function switchable(initial: Reply) {
  let reply = initial;
  const calls: string[] = [];
  const fetchImpl: FetchImpl = async (url) => {
    calls.push(url);
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body };
  };
  return {
    calls,
    fetchImpl,
    set(next: Reply) {
      reply = next;
    },
    radarCalls: () => calls.filter(isRadarCall),
  };
}

describe("B-011 — a failed radar read is remembered for one minute", () => {
  it("the hold is one minute", () => {
    expect(RADAR_RETRY_AFTER_MS).toBe(60_000);
  });

  it("a 500 on a cold cache: one request, onError once, null; 30 s later no request and no onError; 61 s later one request", async () => {
    const s = switchable(fail(500));
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    expect(await settle(getRadarRain(COORDS, { fetchImpl: s.fetchImpl, onError, now: () => NOW }))).toBeNull();
    expect(s.radarCalls()).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);

    expect(await getRadarRain(COORDS, { fetchImpl: s.fetchImpl, onError, now: () => NOW + 30_000 })).toBeNull();
    expect(s.radarCalls(), "held: no new request").toHaveLength(1);
    expect(onError, "held: no onError").toHaveBeenCalledTimes(1);

    s.set(greenAt(NOW + 61_000));
    const later = await settle(getRadarRain(COORDS, { fetchImpl: s.fetchImpl, onError, now: () => NOW + 61_000 }));
    expect(s.radarCalls()).toHaveLength(2);
    expect(later?.rainingNow).toBe(true);
  });

  it("with an earlier good answer: a failed refresh serves it, and 30 s later the same answer with zero requests", async () => {
    const s = switchable(greenAt(NOW));
    const good = await getRadarRain(COORDS, { fetchImpl: s.fetchImpl, now: () => NOW });
    expect(good?.rainingNow).toBe(true);

    s.set(fail(500));
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const refresh = await settle(getRadarRain(COORDS, { fetchImpl: s.fetchImpl, onError, now: () => NOW + 5 * MIN }));
    expect(refresh).toEqual(good);
    expect(onError).toHaveBeenCalledTimes(1);

    const held = await getRadarRain(COORDS, { fetchImpl: s.fetchImpl, onError, now: () => NOW + 5 * MIN + 30_000 });
    expect(held).toEqual(good);
    expect(s.radarCalls(), "the held call made no request").toHaveLength(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("a held call more than 15 minutes after the good answer's fetch returns null", async () => {
    const s = switchable(greenAt(NOW));
    await getRadarRain(COORDS, { fetchImpl: s.fetchImpl, now: () => NOW });

    // The refresh at 14 min 48 s fails: the stale answer is still inside 15 minutes, and the hold starts.
    s.set(fail(500));
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const refresh = await settle(getRadarRain(COORDS, { fetchImpl: s.fetchImpl, onError, now: () => NOW + 14 * MIN + 48_000 }));
    expect(refresh).not.toBeNull();

    // At 15 min 12 s the hold is still in force, and the stored answer is past 15 minutes of its own fetch.
    expect(await getRadarRain(COORDS, { fetchImpl: s.fetchImpl, onError, now: () => NOW + 15 * MIN + 12_000 })).toBeNull();
    expect(s.radarCalls()).toHaveLength(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("a success after the hold clears it: the next call inside the fresh window makes no request and returns the new answer", async () => {
    const s = switchable(fail(500));
    const onError = vi.fn();
    await settle(getRadarRain(COORDS, { fetchImpl: s.fetchImpl, onError, now: () => NOW }));
    s.set(greenAt(NOW + 61_000));
    const after = await settle(getRadarRain(COORDS, { fetchImpl: s.fetchImpl, onError, now: () => NOW + 61_000 }));
    expect(after?.rainingNow).toBe(true);

    const inside = await getRadarRain(COORDS, { fetchImpl: s.fetchImpl, onError, now: () => NOW + 62_000 });
    expect(inside).toEqual(after);
    expect(s.radarCalls()).toHaveLength(2);
  });

  it("two coordinates hold separately: a hold on one does not hold the other", async () => {
    const s = switchable(fail(500));
    await settle(getRadarRain(COORDS, { fetchImpl: s.fetchImpl, now: () => NOW }));

    const other = { lat: 25.79, lon: -80.29 };
    s.set(ok(identify(["0 0 0 0"], [NOW])));
    const b = await settle(getRadarRain(other, { fetchImpl: s.fetchImpl, now: () => NOW + 1000 }));
    expect(b, "the other point is asked").toMatchObject({ rainingNow: false });
    expect(s.radarCalls()).toHaveLength(2);

    expect(await getRadarRain(COORDS, { fetchImpl: s.fetchImpl, now: () => NOW + 1000 })).toBeNull();
    expect(s.radarCalls(), "the first point is still held").toHaveLength(2);
  });

  it("clearRadarCache lifts the hold", async () => {
    const s = switchable(fail(500));
    await settle(getRadarRain(COORDS, { fetchImpl: s.fetchImpl, now: () => NOW }));
    s.set(greenAt(NOW + 1000));
    clearRadarCache();
    const r = await settle(getRadarRain(COORDS, { fetchImpl: s.fetchImpl, now: () => NOW + 1000 }));
    expect(r?.rainingNow).toBe(true);
    expect(s.radarCalls()).toHaveLength(2);
  });

  it("getNow with radar: true during a hold makes no radar request and the reading comes back unchanged", async () => {
    const withoutRadar = await getNow(COORDS, { fetchImpl: healthy().fetchImpl, now: () => NOW });
    clearNowCache();
    const h = healthy({}, fail(500));
    await settle(getRadarRain(COORDS, { fetchImpl: h.fetchImpl, now: () => NOW }));
    expect(h.calls.filter(isRadarCall)).toHaveLength(1);

    const n = await settle(getNow(COORDS, { fetchImpl: h.fetchImpl, now: () => NOW, radar: true }));
    expect(h.calls.filter(isRadarCall), "held: no new radar request").toHaveLength(1);
    expect(n).toEqual(withoutRadar);
    expect(n).not.toHaveProperty("rainSource");
  });
});

// ---------------------------------------------------------------------------
// B-013: a radar claim checks the frame's age when the claim is made
// ---------------------------------------------------------------------------

/** A green newest frame whose validtime is `ageMin` minutes before `t`. */
const greenFrameAge = (t: number, ageMin: number) => ok(identify(["30 200 30 255"], [t - ageMin * MIN]));

/**
 * Route the radar's identify calls to `radar()` (read at each call), and every
 * other URL to the healthy engine. Returns the fetch to hand to the caller.
 */
function feedRadar(base: { fetchImpl: FetchImpl; calls: string[] }, radar: () => Reply): FetchImpl {
  return async (url, init) => {
    if (!url.startsWith(RADAR_PREFIX)) return base.fetchImpl(url, init);
    base.calls.push(url);
    const r = radar();
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
  };
}
const radarCallsIn = (calls: string[]) => calls.filter((u) => u.startsWith(RADAR_PREFIX));

describe("B-013 — rainClaimFrom checks each bridge frame's age against now", () => {
  const green = (ageMin: number) => ({ at: NOW - ageMin * MIN, intensity: "rain" as const });
  const dryFrame = (ageMin: number) => ({ at: NOW - ageMin * MIN, intensity: "none" as const });

  it("a green newest frame 19 minutes old claims at now, stamped with its own frame", () => {
    const f = green(19);
    expect(rainClaimFrom(radarOf([f]), 60, NOW)).toEqual({ intensity: "rain", at: NOW - 19 * MIN });
  });

  it("a green newest frame exactly 20 minutes old still claims", () => {
    expect(rainClaimFrom(radarOf([green(20)]), 60, NOW)).toEqual({ intensity: "rain", at: NOW - 20 * MIN });
  });

  it("a green newest frame 20 minutes plus 1 ms old does not claim", () => {
    const f = { at: NOW - 20 * MIN - 1, intensity: "rain" as const };
    expect(rainClaimFrom(radarOf([f]), 60, NOW)).toBeNull();
  });

  it("the newest frame dry and recent, the second green and 21 minutes old: no claim", () => {
    expect(rainClaimFrom(radarOf([dryFrame(2), green(21)]), 60, NOW)).toBeNull();
  });

  it("the newest frame dry and recent, the second green and 15 minutes old: claims with that frame's time", () => {
    expect(rainClaimFrom(radarOf([dryFrame(2), green(15)]), 60, NOW)).toEqual({
      intensity: "rain",
      at: NOW - 15 * MIN,
    });
  });

  it("a too-old newest green frame is skipped, and the recent dry second frame does not claim", () => {
    expect(rainClaimFrom(radarOf([green(25), dryFrame(22)]), 60, NOW)).toBeNull();
  });

  it("without now, the old frame still claims: the read-time rule is unchanged", () => {
    const old = green(21);
    expect(rainClaimFrom(radarOf([dryFrame(2), old]), 60)).toEqual({ intensity: "rain", at: old.at });
  });
});

describe("B-013 — applyRadarToNow and applyRadarToToday take the clock", () => {
  const rainAt = (ageMin: number) => radarOf([{ at: NOW - ageMin * MIN, intensity: "rain" }]);

  it("an aged-out frame leaves a dry reading as the same object", () => {
    const reading = dry();
    expect(applyRadarToNow(reading, rainAt(21), NOW)).toBe(reading);
  });

  it("a live frame upgrades the reading, as before", () => {
    const out = applyRadarToNow(dry(), rainAt(19), NOW);
    expect(out).toMatchObject({ condition: "light-rain", rainSource: "radar", radarAt: NOW - 19 * MIN });
  });

  it("an aged-out frame leaves today's dry entry as the same array", () => {
    const days = [day(TODAY), day(TOMORROW)];
    expect(applyRadarToToday(days, rainAt(21), TODAY, NOW)).toBe(days);
  });

  it("a live frame upgrades today's entry, and only today's", () => {
    const days = [day(TODAY), day(TOMORROW)];
    const out = applyRadarToToday(days, rainAt(19), TODAY, NOW);
    expect(out[0]).toMatchObject({ dayCondition: "light-rain", rainSource: "radar" });
    expect(out[1]).toBe(days[1]);
  });
});

describe("B-013 through getNow: a cached answer cannot carry an aged frame's claim", () => {
  it("wet at 19 minutes; every refresh then fails; at 14 minutes later the reading is dry again", async () => {
    let at = NOW;
    const base = healthy();
    // Each read builds its frame from the clock then: a frame 19 minutes old at the read.
    const fetchImpl = feedRadar(base, () => (at === NOW + 14 * MIN ? fail(500) : greenFrameAge(at, 19)));
    const first = await settle(getNow(COORDS, { fetchImpl, now: () => at, radar: true }));
    expect(first).toMatchObject({ condition: "light-rain", rainSource: "radar", radarAt: NOW - 19 * MIN });

    at = NOW + 30_000; // the frame is 19.5 minutes old: the cached answer still claims
    const thirtySeconds = await settle(getNow(COORDS, { fetchImpl, now: () => at, radar: true }));
    expect(thirtySeconds).toMatchObject({ rainSource: "radar", radarAt: NOW - 19 * MIN });
    expect(radarCallsIn(base.calls)).toHaveLength(1);

    at = NOW + 14 * MIN; // the frame is 33 minutes old; the radar is asked, fails, and the answer is served stale
    const later = await settle(getNow(COORDS, { fetchImpl, now: () => at, radar: true }));
    expect(radarCallsIn(base.calls), "the cached answer was not refreshed by a successful read").toHaveLength(2);
    expect(later).not.toHaveProperty("rainSource");
    expect(later).not.toHaveProperty("radarAt");
    const plain = await settle(getNow(COORDS, { fetchImpl: healthy().fetchImpl, now: () => at }));
    expect(later).toEqual(plain);
    expect(later!.condition).toBe("mostly-cloudy");
  });

  it("control: a radar that keeps answering with a frame one minute old is wet at T and at T + 14 minutes", async () => {
    let at = NOW;
    const base = healthy();
    const fetchImpl = feedRadar(base, () => greenFrameAge(at, 1));
    const t0 = await settle(getNow(COORDS, { fetchImpl, now: () => at, radar: true }));
    at = NOW + 14 * MIN;
    const t14 = await settle(getNow(COORDS, { fetchImpl, now: () => at, radar: true }));
    expect(t0).toMatchObject({ rainSource: "radar" });
    expect(t14).toMatchObject({ rainSource: "radar", radarAt: NOW + 13 * MIN });
    expect(radarCallsIn(base.calls)).toHaveLength(2);
  });
});

describe("B-013 through getDaily: today's entry takes the clock too", () => {
  it("wet at 19 minutes; every refresh then fails; at 14 minutes later today is dry again", async () => {
    let at = DAY_AT;
    const base = dailyRouter();
    const fetchImpl = feedRadar(base, () => (at === DAY_AT + 14 * MIN ? fail(500) : greenFrameAge(at, 19)));
    const first = await settle(getDaily(COORDS, { fetchImpl, now: () => at, radar: true }));
    expect(first!.days.find((d) => d.date === VENUE_TODAY)).toMatchObject({ rainSource: "radar" });

    at = DAY_AT + 30_000;
    const thirtySeconds = await settle(getDaily(COORDS, { fetchImpl, now: () => at, radar: true }));
    expect(thirtySeconds!.days.find((d) => d.date === VENUE_TODAY)).toMatchObject({ rainSource: "radar" });

    at = DAY_AT + 14 * MIN;
    const later = await settle(getDaily(COORDS, { fetchImpl, now: () => at, radar: true }));
    expect(radarCallsIn(base.calls)).toHaveLength(2);
    const today = later!.days.find((d) => d.date === VENUE_TODAY)!;
    expect(today).not.toHaveProperty("rainSource");
    expect(today.dayCondition).toBe("mostly-cloudy");
    const plain = await settle(getDaily(COORDS, { fetchImpl: dailyRouter().fetchImpl, now: () => at }));
    expect(later).toEqual(plain);
  });

  it("control: a radar that keeps answering with a frame one minute old is wet at T and at T + 14 minutes", async () => {
    let at = DAY_AT;
    const base = dailyRouter();
    const fetchImpl = feedRadar(base, () => greenFrameAge(at, 1));
    const t0 = await settle(getDaily(COORDS, { fetchImpl, now: () => at, radar: true }));
    at = DAY_AT + 14 * MIN;
    const t14 = await settle(getDaily(COORDS, { fetchImpl, now: () => at, radar: true }));
    expect(t0!.days.find((d) => d.date === VENUE_TODAY)).toMatchObject({ rainSource: "radar" });
    expect(t14!.days.find((d) => d.date === VENUE_TODAY)).toMatchObject({ rainSource: "radar" });
  });
});
