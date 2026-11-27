import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  getSun,
  getMoon,
  clearSunRefreshes,
  SUN_REFRESH_AFTER_MS,
  type MoonPhase,
} from "../astro.js";
import { clearPointCache, getPoint } from "../nws/point.js";
import { NWS_API } from "../nws/http.js";
import type { FetchImpl } from "../types.js";
import { setRetrySleep } from "../helpers.js";

const points = JSON.parse(
  readFileSync(new URL("./fixtures/nws/points.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

const C = { lat: 41.03, lon: -73.76 };
const POINTS_URL = `${NWS_API}/points/41.03,-73.76`;
const T0 = 1795787700000; // 2026-11-27 13:55 UTC, the fixture's recording time
const DAY = 86_400_000;
const HOUR = 3_600_000;

/** A stub fetch that answers the points URL with `status` and `body`, recording each call. */
function stub(status: number, body: unknown = points) {
  const calls: string[] = [];
  const fetchImpl: FetchImpl = async (url) => {
    calls.push(url);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { calls, fetchImpl };
}

function cloned(): { properties: Record<string, any> } {
  return structuredClone(points) as { properties: Record<string, any> };
}

/** The fixture with every astronomicalData time moved on by `hours`. */
function shiftedBy(hours: number): Record<string, unknown> {
  const clone = cloned();
  const ad = clone.properties.astronomicalData as Record<string, string>;
  for (const k of Object.keys(ad)) {
    ad[k] = new Date(Date.parse(ad[k]) + hours * HOUR).toISOString();
  }
  return clone as unknown as Record<string, unknown>;
}

beforeEach(() => clearPointCache());
beforeEach(() => clearSunRefreshes());

// Failure tests never wait on the real retry backoff (B-006).
beforeEach(() => setRetrySleep(async () => {}));
afterEach(() => setRetrySleep(null));

describe("getSun — the recorded fixture", () => {
  it("returns the sun times for the venue's current local day", async () => {
    const { fetchImpl } = stub(200);
    expect(await getSun(C, { fetchImpl, now: () => T0 })).toEqual({
      sunrise: 1795780591000,
      sunset: 1795814934000,
      firstLight: Date.parse("2026-11-27T06:26:18-05:00"),
      lastLight: Date.parse("2026-11-27T16:59:07-05:00"),
      dayLengthMs: 34343000,
    });
  });

  it("makes no request beyond the point lookup for the same day", async () => {
    const { calls, fetchImpl } = stub(200);
    await getSun(C, { fetchImpl, now: () => T0 });
    await getSun(C, { fetchImpl, now: () => T0 + 2 * HOUR });
    expect(calls).toEqual([POINTS_URL]);
  });
});

describe("getSun — the local calendar day", () => {
  it("looks the point up again and uses the fresh sun data when the cached day is stale", async () => {
    const first = stub(200);
    await getSun(C, { fetchImpl: first.fetchImpl, now: () => T0 });

    const second = stub(200, shiftedBy(24));
    const next = await getSun(C, { fetchImpl: second.fetchImpl, now: () => T0 + DAY });
    expect(second.calls).toEqual([POINTS_URL]);
    expect(next).toEqual({
      sunrise: 1795780591000 + DAY,
      sunset: 1795814934000 + DAY,
      firstLight: Date.parse("2026-11-27T06:26:18-05:00") + DAY,
      lastLight: Date.parse("2026-11-27T16:59:07-05:00") + DAY,
      dayLengthMs: 34343000,
    });
  });

  it("returns null when the stale day's point is still answered after the fresh lookup", async () => {
    const first = stub(200);
    await getSun(C, { fetchImpl: first.fetchImpl, now: () => T0 });

    const second = stub(200); // the original, one-day-old payload
    expect(await getSun(C, { fetchImpl: second.fetchImpl, now: () => T0 + DAY })).toBeNull();
    expect(second.calls).toHaveLength(1);
  });

  it("keeps the cached data just before venue midnight and looks up again just after", async () => {
    const { fetchImpl, calls } = stub(200);
    const beforeMidnight = Date.UTC(2026, 10, 28, 4, 59, 59); // 23:59:59 on Nov 27 in New York
    const afterMidnight = Date.UTC(2026, 10, 28, 5, 0, 1); // 00:00:01 on Nov 28 in New York

    await getSun(C, { fetchImpl, now: () => T0 });
    expect(await getSun(C, { fetchImpl, now: () => beforeMidnight })).not.toBeNull();
    expect(calls).toHaveLength(1);

    const again = stub(200);
    expect(await getSun(C, { fetchImpl: again.fetchImpl, now: () => afterMidnight })).toBeNull();
    expect(again.calls).toHaveLength(1);
  });
});

describe("getSun — failures and missing data", () => {
  it("returns null for a 404 (outside coverage) and never calls onError", async () => {
    const { fetchImpl } = stub(404);
    const onError = vi.fn();
    expect(await getSun(C, { fetchImpl, now: () => T0, onError })).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("returns null after two 500s and calls onError exactly once in total", async () => {
    const { calls, fetchImpl } = stub(500);
    const onError = vi.fn();
    expect(await getSun(C, { fetchImpl, now: () => T0, onError })).toBeNull();
    expect(calls).toHaveLength(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("returns null without throwing when the fetch rejects", async () => {
    const fetchImpl: FetchImpl = async () => {
      throw new Error("network down");
    };
    const onError = vi.fn();
    await expect(getSun(C, { fetchImpl, now: () => T0, onError })).resolves.toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("returns null when the point has no sun data", async () => {
    const clone = cloned();
    delete clone.properties.astronomicalData;
    const { fetchImpl } = stub(200, clone);
    expect(await getSun(C, { fetchImpl, now: () => T0 })).toBeNull();
  });

  it("returns null when the point has no time zone", async () => {
    const clone = cloned();
    clone.properties.timeZone = null;
    const { fetchImpl } = stub(200, clone);
    expect(await getSun(C, { fetchImpl, now: () => T0 })).toBeNull();
  });

  it("returns null when sunset is not after sunrise", async () => {
    const clone = cloned();
    const ad = clone.properties.astronomicalData as Record<string, string>;
    ad.sunset = "2026-11-27T06:00:00-05:00";
    const { fetchImpl } = stub(200, clone);
    expect(await getSun(C, { fetchImpl, now: () => T0 })).toBeNull();
  });

  it("sets only firstLight to null when the twilight start is missing", async () => {
    const clone = cloned();
    delete (clone.properties.astronomicalData as Record<string, unknown>).civilTwilightBegin;
    const { fetchImpl } = stub(200, clone);
    const sun = await getSun(C, { fetchImpl, now: () => T0 });
    expect(sun).toEqual({
      sunrise: 1795780591000,
      sunset: 1795814934000,
      firstLight: null,
      lastLight: Date.parse("2026-11-27T16:59:07-05:00"),
      dayLengthMs: 34343000,
    });
  });
});

describe("getSun — one point refresh per coordinate per 15 minutes (B-010)", () => {
  const B = { lat: 41.04, lon: -73.76 };
  const B_URL = `${NWS_API}/points/41.04,-73.76`;
  const SUNRISE_TODAY = 1795780591000;
  const SUNSET_TODAY = 1795814934000;

  it("refreshes once when the point still answers the old day; three calls on the next day make no more requests", async () => {
    const { calls, fetchImpl } = stub(200);
    await getSun(C, { fetchImpl, now: () => T0 });
    expect(calls).toHaveLength(1);

    const next = () => T0 + DAY;
    expect(await getSun(C, { fetchImpl, now: next })).toBeNull();
    expect(await getSun(C, { fetchImpl, now: next })).toBeNull();
    expect(await getSun(C, { fetchImpl, now: next })).toBeNull();
    expect(calls).toHaveLength(2);

    // Fifteen minutes on, the window has closed and one more refresh is made.
    expect(await getSun(C, { fetchImpl, now: () => T0 + DAY + SUN_REFRESH_AFTER_MS })).toBeNull();
    expect(calls).toHaveLength(3);
  });

  it("uses the refresh that brings the new day, and makes no further request for it", async () => {
    const first = stub(200);
    await getSun(C, { fetchImpl: first.fetchImpl, now: () => T0 });

    const second = stub(200, shiftedBy(24));
    const opts = { fetchImpl: second.fetchImpl, now: () => T0 + DAY };
    const nextDay = {
      sunrise: SUNRISE_TODAY + DAY,
      sunset: SUNSET_TODAY + DAY,
      firstLight: Date.parse("2026-11-27T06:26:18-05:00") + DAY,
      lastLight: Date.parse("2026-11-27T16:59:07-05:00") + DAY,
      dayLengthMs: 34343000,
    };
    expect(await getSun(C, opts)).toEqual(nextDay);
    expect(await getSun(C, opts)).toEqual(nextDay);
    expect(await getSun(C, opts)).toEqual(nextDay);
    expect(second.calls).toHaveLength(1);
  });

  it.each([
    ["Not/AZone", "Not/AZone"],
    ["null", null],
  ])("a venue with a time zone of %s gets null with no refresh: one point request in total", async (_label, zone) => {
    const clone = cloned();
    clone.properties.timeZone = zone;
    const { calls, fetchImpl } = stub(200, clone);
    for (let i = 0; i < 3; i += 1) {
      expect(await getSun(C, { fetchImpl, now: () => T0 })).toBeNull();
    }
    expect(calls).toHaveLength(1);
  });

  it("a refresh that fails gives null, reports getPoint once, and is not asked again inside the 30-second point hold", async () => {
    const first = stub(200);
    await getSun(C, { fetchImpl: first.fetchImpl, now: () => T0 });

    const broken = stub(500);
    const onError = vi.fn();
    expect(await getSun(C, { fetchImpl: broken.fetchImpl, onError, now: () => T0 + DAY })).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1].call).toBe("getPoint");

    const requests = broken.calls.length;
    expect(
      await getSun(C, { fetchImpl: broken.fetchImpl, onError, now: () => T0 + DAY + 10_000 }),
    ).toBeNull();
    expect(broken.calls).toHaveLength(requests);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("keeps the local day across the November clock change", async () => {
    // Sun data dated 2026-11-01 in America/New_York: the fixture's times, 26 days earlier.
    const { fetchImpl, calls } = stub(200, shiftedBy(-26 * 24));
    const at2330Est = Date.UTC(2026, 10, 2, 4, 30); // 23:30 on Nov 1, after the change
    const at0130Edt = Date.UTC(2026, 10, 1, 5, 30); // 01:30 on Nov 1, before the change at 06:00 UTC
    const at0005Est = Date.UTC(2026, 10, 2, 5, 5); // 00:05 on Nov 2

    const sunrise = SUNRISE_TODAY - 26 * DAY;
    expect(await getSun(C, { fetchImpl, now: () => at2330Est })).toMatchObject({ sunrise });
    expect(await getSun(C, { fetchImpl, now: () => at0130Edt })).toMatchObject({ sunrise });
    expect(calls).toHaveLength(1);
    expect(await getSun(C, { fetchImpl, now: () => at0005Est })).toBeNull();
  });

  it("limits each coordinate separately", async () => {
    const { calls, fetchImpl } = stub(200);
    const cUrl = POINTS_URL;
    await getSun(C, { fetchImpl, now: () => T0 });
    await getSun(B, { fetchImpl, now: () => T0 });

    await getSun(C, { fetchImpl, now: () => T0 + DAY }); // C refreshes and is now limited
    const cAfter = calls.filter((u) => u === cUrl).length;

    await getSun(B, { fetchImpl, now: () => T0 + DAY }); // B has its own window: it refreshes too
    expect(calls.filter((u) => u === B_URL)).toHaveLength(2);

    await getSun(C, { fetchImpl, now: () => T0 + DAY + 60_000 });
    expect(calls.filter((u) => u === cUrl)).toHaveLength(cAfter);
  });

  it("remembers at most 200 coordinates, so the oldest one may refresh again", async () => {
    const { calls, fetchImpl } = stub(200);
    const at = (i: number) => ({ lat: 40 + i / 1000, lon: -73.76 });
    const urlOf = (i: number) => `${NWS_API}/points/${Number(at(i).lat.toFixed(4))},-73.76`;
    for (let i = 0; i <= 200; i += 1) {
      await getSun(at(i), { fetchImpl, now: () => T0 + DAY });
    }

    // Coordinate 0 was the oldest and has been forgotten: it refreshes again.
    const zeroBefore = calls.filter((u) => u === urlOf(0)).length;
    await getSun(at(0), { fetchImpl, now: () => T0 + DAY });
    expect(calls.filter((u) => u === urlOf(0)).length).toBeGreaterThan(zeroBefore);

    // The newest coordinate is still inside its window (re-adding coordinate 0 pushed out coordinate 1): no request.
    const newestBefore = calls.filter((u) => u === urlOf(200)).length;
    await getSun(at(200), { fetchImpl, now: () => T0 + DAY });
    expect(calls.filter((u) => u === urlOf(200)).length).toBe(newestBefore);
  });
});

describe("getSun — the point is read first; simultaneous callers share one refresh (B-010 rework)", () => {
  const SUN_TODAY_AFTER_SHIFT = {
    sunrise: 1795780591000 + DAY,
    sunset: 1795814934000 + DAY,
    firstLight: Date.parse("2026-11-27T06:26:18-05:00") + DAY,
    lastLight: Date.parse("2026-11-27T16:59:07-05:00") + DAY,
    dayLengthMs: 34343000,
  };

  /** A stub whose n-th call gets the n-th reply; the last one repeats. */
  function replies(...list: Array<[number, unknown]>) {
    const calls: string[] = [];
    const fetchImpl: FetchImpl = async (url) => {
      calls.push(url);
      const [status, body] = list[Math.min(calls.length - 1, list.length - 1)]!;
      return { ok: status >= 200 && status < 300, status, json: async () => body };
    };
    return { calls, fetchImpl };
  }

  it("four simultaneous calls on a stale day make two point requests in all, and all four get null", async () => {
    const { calls, fetchImpl } = stub(200); // the lookup keeps answering the old day
    const results = await Promise.all([1, 2, 3, 4].map(() => getSun(C, { fetchImpl, now: () => T0 + DAY })));
    expect(results).toEqual([null, null, null, null]);
    expect(calls).toHaveLength(2);
  });

  it("four simultaneous calls on a stale day, with a refresh that brings today, all return today's times in two requests", async () => {
    const { calls, fetchImpl } = replies([200, points], [200, shiftedBy(24)]);
    const results = await Promise.all([1, 2, 3, 4].map(() => getSun(C, { fetchImpl, now: () => T0 + DAY })));
    for (const r of results) expect(r).toEqual(SUN_TODAY_AFTER_SHIFT);
    expect(calls).toHaveLength(2);
  });

  it("a failed refresh, then today's point loaded by another fetcher: getSun returns today's times with no further request", async () => {
    const first = stub(200);
    await getSun(C, { fetchImpl: first.fetchImpl, now: () => T0 });

    const broken = stub(500);
    expect(await getSun(C, { fetchImpl: broken.fetchImpl, now: () => T0 + DAY })).toBeNull();

    // Another fetcher loads the point once the 30-second hold has passed (getPoint, not clearPointCache).
    const today = stub(200, shiftedBy(24));
    await getPoint(C, { fetchImpl: today.fetchImpl, now: () => T0 + DAY + 31_000 });
    expect(today.calls).toHaveLength(1);

    const later = stub(200);
    expect(await getSun(C, { fetchImpl: later.fetchImpl, now: () => T0 + DAY + 2 * 60_000 })).toEqual(
      SUN_TODAY_AFTER_SHIFT,
    );
    expect(later.calls).toHaveLength(0);
  });

  it("a clock that stepped back is not held by the refresh window: a call 60 s earlier refreshes again", async () => {
    const { calls, fetchImpl } = stub(200); // the lookup keeps answering the old day
    await getSun(C, { fetchImpl, now: () => T0 + DAY }); // refresh attempt recorded at T0 + DAY
    expect(calls).toHaveLength(2);

    expect(await getSun(C, { fetchImpl, now: () => T0 + DAY - 60_000 })).toBeNull();
    expect(calls).toHaveLength(3);
  });

  it("after a failed refresh: 10 s later makes no request; 31 s later the point is asked again", async () => {
    const first = stub(200);
    await getSun(C, { fetchImpl: first.fetchImpl, now: () => T0 });

    const broken = stub(500);
    expect(await getSun(C, { fetchImpl: broken.fetchImpl, now: () => T0 + DAY })).toBeNull();
    const afterFailure = broken.calls.length;

    expect(await getSun(C, { fetchImpl: broken.fetchImpl, now: () => T0 + DAY + 10_000 })).toBeNull();
    expect(broken.calls).toHaveLength(afterFailure);

    expect(await getSun(C, { fetchImpl: broken.fetchImpl, now: () => T0 + DAY + 31_000 })).toBeNull();
    expect(broken.calls.length).toBeGreaterThan(afterFailure);
  });

  describe("simultaneous callers straddling local midnight", () => {
    // New York: caller A is still 27 November, caller B is already 28 November.
    const A_NOW = Date.parse("2026-11-27T23:59:59-05:00");
    const B_NOW = Date.parse("2026-11-28T00:00:01-05:00");
    const DAY27_SUNRISE = 1795780591000;
    const DAY27_TIMES = {
      sunrise: 1795780591000,
      sunset: 1795814934000,
      firstLight: Date.parse("2026-11-27T06:26:18-05:00"),
      lastLight: Date.parse("2026-11-27T16:59:07-05:00"),
      dayLengthMs: 34343000,
    };

    /** Warm the point cache with day-26 sun data, then answer day-27 data for the shared refresh. */
    async function warmToDay26() {
      const warm = stub(200, shiftedBy(-24));
      const day26 = await getSun(C, { fetchImpl: warm.fetchImpl, now: () => Date.parse("2026-11-26T12:00:00-05:00") });
      expect(day26).toMatchObject({ sunrise: DAY27_SUNRISE - DAY });
      return stub(200); // the lookup now answers the unshifted day-27 fixture
    }

    it("caller A (27 Nov, starts first) gets day-27 times and caller B (28 Nov) gets null, from one shared refresh", async () => {
      const after = await warmToDay26();
      const [a, b] = await Promise.all([
        getSun(C, { fetchImpl: after.fetchImpl, now: () => A_NOW }),
        getSun(C, { fetchImpl: after.fetchImpl, now: () => B_NOW }),
      ]);
      expect(a).toEqual(DAY27_TIMES);
      expect(b).toBeNull();
      expect(after.calls).toEqual([POINTS_URL]);
    });

    it("caller B (28 Nov, starts first) gets null and caller A (27 Nov) gets day-27 times, from one shared refresh", async () => {
      const after = await warmToDay26();
      const [b, a] = await Promise.all([
        getSun(C, { fetchImpl: after.fetchImpl, now: () => B_NOW }),
        getSun(C, { fetchImpl: after.fetchImpl, now: () => A_NOW }),
      ]);
      expect(b).toBeNull();
      expect(a).toEqual(DAY27_TIMES);
      expect(after.calls).toEqual([POINTS_URL]);
    });
  });
});

describe("getMoon", () => {
  const DAY_MS = 86_400_000;
  const MONTH_MS = 29.530588853 * DAY_MS;
  const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

  it("reads the waning gibbous for the recorded Nov 27 2026 time", () => {
    const m = getMoon(Date.UTC(2026, 10, 27, 13, 20))!;
    expect(m.name).toBe("Waning gibbous");
    expect(m.illumination).toBeCloseTo(0.909, 2);
    expect(m.fraction).toBeCloseTo(0.5974, 3);
  });

  it("is exactly the new moon at the reference time", () => {
    expect(getMoon(Date.UTC(2000, 0, 6, 18, 14))).toEqual({
      fraction: 0,
      illumination: 0,
      name: "New moon",
    });
  });

  it.each([
    [0, "New moon"],
    [1, "Waxing crescent"],
    [2, "First quarter"],
    [3, "Waxing gibbous"],
    [4, "Full moon"],
    [5, "Waning gibbous"],
    [6, "Last quarter"],
    [7, "Waning crescent"],
  ])("names the eighth k=%i as %s", (k, name) => {
    const m: MoonPhase = getMoon(NEW_MOON + (k / 8) * MONTH_MS)!;
    expect(m.name).toBe(name);
    expect(m.fraction).toBeCloseTo(k / 8, 6);
  });

  it("reads a minute before the new moon as New moon with almost no light", () => {
    const m = getMoon(NEW_MOON + MONTH_MS - 60_000)!;
    expect(m.fraction).toBeGreaterThan(0.99);
    expect(m.fraction).toBeLessThan(1);
    expect(m.name).toBe("New moon");
    expect(m.illumination).toBeLessThan(0.001);
  });

  it("keeps the fraction in [0, 1) before the reference date", () => {
    const m = getMoon(Date.UTC(1999, 0, 1))!;
    expect(m.fraction).toBeGreaterThanOrEqual(0);
    expect(m.fraction).toBeLessThan(1);
  });

  it("returns null for a non-finite time", () => {
    expect(getMoon(NaN)).toBeNull();
    expect(getMoon(Infinity)).toBeNull();
    expect(getMoon(-Infinity)).toBeNull();
  });

  it("cross-checks a full moon", () => {
    const m = getMoon(Date.UTC(2026, 10, 24, 14, 53))!;
    expect(m.name).toBe("Full moon");
    expect(m.illumination).toBeGreaterThan(0.99);
  });
});
