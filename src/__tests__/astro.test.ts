import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getSun, getMoon, type MoonPhase } from "../astro.js";
import { clearPointCache } from "../nws/point.js";
import { NWS_API } from "../nws/http.js";
import type { FetchImpl } from "../types.js";

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
