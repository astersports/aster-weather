import { describe, it, expect, beforeEach } from "vitest";
import { getNowcast, clearNowcastCache, type FetchImpl } from "../index.js";

const COORDS = { lat: 41.13, lon: -73.72 };

function stubMinutely(startSec: number, count: number): FetchImpl {
  const time = Array.from({ length: count }, (_, i) => startSec + i * 900); // 15-min steps
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      minutely_15: {
        time,
        precipitation: time.map((_, i) => (i === 2 ? 0.03 : 0)),
        wind_gusts_10m: time.map(() => 14.0),
      },
    }),
  });
}

describe("getNowcast (minutely_15 precipitation nowcast)", () => {
  beforeEach(() => clearNowcastCache());

  it("maps 15-min steps to epoch ms with precip + gusts", async () => {
    const startSec = Math.floor(Date.now() / 1000);
    const points = await getNowcast(COORDS, { fetchImpl: stubMinutely(startSec, 8) });
    expect(points).toHaveLength(8);
    expect(points[0].timestamp).toBe(startSec * 1000);
    expect(points[1].timestamp).toBe((startSec + 900) * 1000);
    expect(points[2].precipitation).toBe(0.03);
    expect(points[0].windGusts).toBe(14);
  });

  it("returns [] for invalid coordinates without calling fetch", async () => {
    let called = false;
    const spy: FetchImpl = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    expect(await getNowcast({ lat: 999, lon: 0 }, { fetchImpl: spy })).toEqual([]);
    expect(called).toBe(false);
  });

  it("returns [] (never throws) on a non-ok response", async () => {
    const points = await getNowcast(COORDS, {
      fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    expect(points).toEqual([]);
  });

  it("preserves null precip as null (never fabricates 0)", async () => {
    const startSec = Math.floor(Date.now() / 1000);
    const points = await getNowcast(COORDS, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          minutely_15: { time: [startSec], precipitation: [null], wind_gusts_10m: [null] },
        }),
      }),
    });
    expect(points[0].precipitation).toBeNull();
    expect(points[0].windGusts).toBeNull();
  });
});
