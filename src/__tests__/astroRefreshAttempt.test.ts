import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NwsPoint } from "../nws/point.js";

// getPoint is replaced so a refresh's lookup can be made to reject, which the point module never does.
// The limiter must still count that refresh as an attempt.
const lookup = vi.hoisted(() => ({ getPoint: vi.fn() }));
vi.mock("../nws/point.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../nws/point.js")>()),
  getPoint: lookup.getPoint,
}));

import { getSun, clearSunRefreshes, SUN_REFRESH_AFTER_MS } from "../astro.js";

const C = { lat: 41.03, lon: -73.76 };
const T0 = 1795787700000; // 2026-11-27 13:55 UTC
const DAY = 86_400_000;

/** The sun data of the fixture day (2026-11-27 in America/New_York), as the point lookup returns it. */
const oldDayPoint: NwsPoint = {
  forecast: "",
  forecastHourly: "",
  forecastGridData: "",
  observationStations: "",
  timeZone: "America/New_York",
  city: null,
  state: null,
  radarStation: null,
  sun: {
    sunrise: 1795780591000,
    sunset: 1795814934000,
    firstLight: Date.parse("2026-11-27T06:26:18-05:00"),
    lastLight: Date.parse("2026-11-27T16:59:07-05:00"),
  },
};

beforeEach(() => {
  lookup.getPoint.mockReset();
  clearSunRefreshes();
});

describe("getSun — a refresh that rejects still counts as this window's attempt (B-010)", () => {
  it("after a refresh whose lookup rejects, a call inside 15 minutes makes no further lookup", async () => {
    lookup.getPoint
      .mockResolvedValueOnce(oldDayPoint) // the call's own read: the stored day is stale
      .mockRejectedValueOnce(new Error("lookup rejected")) // the refresh
      .mockResolvedValue(oldDayPoint);

    expect(await getSun(C, { now: () => T0 + DAY })).toBeNull();
    expect(lookup.getPoint).toHaveBeenCalledTimes(2);

    expect(await getSun(C, { now: () => T0 + DAY + SUN_REFRESH_AFTER_MS - 1 })).toBeNull();
    expect(lookup.getPoint).toHaveBeenCalledTimes(3); // only the call's own read, no refresh
  });
});
