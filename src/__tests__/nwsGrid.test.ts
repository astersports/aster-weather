import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseGridLayer, gridValueAt, getGrid, clearGridCache } from "../nws/grid.js";
import { clearPointCache } from "../nws/point.js";
import { NWS_API } from "../nws/http.js";
import type { FetchImpl, WeatherErrorContext } from "../types.js";

const grid = JSON.parse(
  readFileSync(new URL("./fixtures/nws/grid.json", import.meta.url), "utf8"),
) as { properties: Record<string, { values?: unknown }> };
const points = JSON.parse(
  readFileSync(new URL("./fixtures/nws/points.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

const COORDS = { lat: 41.03, lon: -73.76 };
const POINT_URL = `${NWS_API}/points/41.03,-73.76`;
const GRID_URL = "https://api.weather.gov/gridpoints/OKX/39,58";

interface Reply {
  status: number;
  body: unknown;
}

/** A stub that answers by exact URL, recording every request. */
function router(replies: Record<string, Reply>) {
  const calls: string[] = [];
  const fetchImpl: FetchImpl = async (url) => {
    calls.push(url);
    const r = replies[url] ?? { status: 404, body: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { calls, fetchImpl };
}

const happy = (): Record<string, Reply> => ({
  [POINT_URL]: { status: 200, body: points },
  [GRID_URL]: { status: 200, body: grid },
});

beforeEach(() => {
  clearPointCache();
  clearGridCache();
});
afterEach(() => vi.useRealTimers());

describe("parseGridLayer — the recorded fixture", () => {
  it("parses the first temperature block", () => {
    const t = parseGridLayer(grid.properties.temperature);
    expect(t[0]).toEqual({
      start: Date.parse("2026-11-27T03:00:00Z"),
      end: Date.parse("2026-11-27T04:00:00Z"),
      value: 10,
    });
  });

  it("keeps a null value as null (heat index)", () => {
    expect(parseGridLayer(grid.properties.heatIndex)[0].value).toBeNull();
  });

  it("reads a P6DT15H duration as six days and fifteen hours", () => {
    const th = parseGridLayer(grid.properties.probabilityOfThunder);
    expect(th[0].end - th[0].start).toBe((6 * 24 + 15) * 3600_000);
  });

  it("sorts blocks by start", () => {
    const blocks = parseGridLayer(grid.properties.temperature);
    for (let i = 1; i < blocks.length; i += 1) {
      expect(blocks[i].start).toBeGreaterThan(blocks[i - 1].start);
    }
  });
});

describe("gridValueAt — interval edges", () => {
  const wb = parseGridLayer(grid.properties.wetBulbGlobeTemperature);

  it("reads inside a block", () => {
    expect(gridValueAt(wb, Date.parse("2026-11-27T12:59:59Z"))).toBeCloseTo(10.5556, 3);
  });

  it("an hour exactly at a block's end belongs to the next block", () => {
    expect(gridValueAt(wb, Date.parse("2026-11-27T13:00:00Z"))).toBeCloseTo(11.1111, 3);
  });

  it("is null before the first block", () => {
    expect(gridValueAt(wb, 0)).toBeNull();
  });

  it("is null when the containing block has a null value", () => {
    const hi = parseGridLayer(grid.properties.heatIndex);
    expect(gridValueAt(hi, hi[0].start)).toBeNull();
  });
});

describe("parseGridLayer — malformed input", () => {
  it("gives [] for null", () => {
    expect(parseGridLayer(null)).toEqual([]);
  });

  it("skips an entry whose validTime does not parse", () => {
    expect(parseGridLayer({ values: [{ validTime: "junk", value: 1 }] })).toEqual([]);
  });

  it("skips an entry with an empty duration", () => {
    expect(
      parseGridLayer({ values: [{ validTime: "2026-11-27T03:00:00Z/PT", value: 1 }] }),
    ).toEqual([]);
  });

  it("makes a non-finite value null rather than dropping the block", () => {
    const blocks = parseGridLayer({
      values: [{ validTime: "2026-11-27T03:00:00Z/PT1H", value: "warm" }],
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].value).toBeNull();
  });
});

describe("getGrid", () => {
  it("returns every grid layer as blocks, keyed by layer name", async () => {
    const { fetchImpl, calls } = router(happy());
    const g = await getGrid(COORDS, { fetchImpl });
    expect(g).not.toBeNull();
    expect(Object.keys(g!)).toContain("temperature");
    expect(Object.keys(g!)).toContain("probabilityOfThunder");
    expect(g!.temperature[0].value).toBe(10);
    expect(calls).toEqual([POINT_URL, GRID_URL]);
  });

  it("returns null without a grid request when the point is outside coverage", async () => {
    const { fetchImpl, calls } = router({ [POINT_URL]: { status: 404, body: {} } });
    const onError = vi.fn();
    expect(await getGrid(COORDS, { fetchImpl, onError })).toBeNull();
    expect(calls).toEqual([POINT_URL]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("a 500 from the grid URL gives null and one onError with the getGrid context", async () => {
    vi.useFakeTimers();
    const { fetchImpl } = router({
      [POINT_URL]: { status: 200, body: points },
      [GRID_URL]: { status: 500, body: {} },
    });
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const pending = getGrid(COORDS, { fetchImpl, onError });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toEqual({ call: "getGrid", lat: 41.03, lon: -73.76 });
  });

  it("serves the second call from cache", async () => {
    const { fetchImpl, calls } = router(happy());
    await getGrid(COORDS, { fetchImpl });
    await getGrid(COORDS, { fetchImpl });
    expect(calls.filter((u) => u === GRID_URL)).toHaveLength(1);
  });
});
