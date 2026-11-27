import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getAlerts, clearAlertsCache, type WeatherAlert } from "../nws/alerts.js";
import { clearPointCache } from "../nws/point.js";
import { NWS_API } from "../nws/http.js";
import type { FetchImpl, WeatherErrorContext } from "../types.js";

const points = JSON.parse(
  readFileSync(new URL("./fixtures/nws/points.json", import.meta.url), "utf8"),
) as Record<string, unknown>;
const alertsFixture = JSON.parse(
  readFileSync(new URL("./fixtures/nws/alerts.json", import.meta.url), "utf8"),
) as { features: Array<{ properties: Record<string, unknown> }> };

const COORDS = { lat: 41.03, lon: -73.76 };
const POINTS_URL = `${NWS_API}/points/41.03,-73.76`;
const ALERTS_URL = "https://api.weather.gov/alerts/active?point=41.03,-73.76";
const T0 = 1795787700000; // 2026-11-27 13:55 UTC, the fixture's recording time
const FIXTURE_ENDS = 1795809600000; // 2026-11-27T15:00:00-05:00

interface Route {
  status: number;
  body: unknown;
}

/** A stub fetch routed by exact URL. An unknown URL throws, so a stray request fails loudly. */
function router(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetchImpl: FetchImpl = async (url) => {
    calls.push(url);
    const r = routes[url];
    if (!r) throw new Error(`unexpected URL ${url}`);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    };
  };
  return { calls, fetchImpl, routes };
}

function okRoutes(alertBody: unknown = alertsFixture): Record<string, Route> {
  return {
    [POINTS_URL]: { status: 200, body: points },
    [ALERTS_URL]: { status: 200, body: alertBody },
  };
}

/** A hand-built active alert. Overrides go on `properties`; the feature id is `id`. */
function feature(props: Record<string, unknown> = {}, id?: string): unknown {
  const event = typeof props.event === "string" ? props.event : "Test Alert";
  return {
    id: id ?? `urn:test:${event}`,
    type: "Feature",
    properties: {
      status: "Actual",
      messageType: "Alert",
      event: "Test Alert",
      severity: "Minor",
      urgency: "Expected",
      certainty: "Likely",
      onset: "2026-11-27T06:00:00-05:00",
      ends: "2026-11-27T15:00:00-05:00",
      senderName: "NWS Test",
      headline: "Headline",
      description: "Description",
      instruction: "Instruction",
      areaDesc: "Area",
      parameters: { NWSheadline: ["NWS HEADLINE"] },
      ...props,
    },
  };
}

function bodyOf(features: unknown[]): unknown {
  return { type: "FeatureCollection", features };
}

beforeEach(() => {
  clearPointCache();
  clearAlertsCache();
});
afterEach(() => vi.useRealTimers());

describe("getAlerts — the recorded fixture", () => {
  it("returns the one active advisory with its mapped fields", async () => {
    const { fetchImpl } = router(okRoutes());
    const a = (await getAlerts(COORDS, { fetchImpl, now: () => T0 }))!;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      event: "Coastal Flood Advisory",
      severity: "Minor",
      level: 1,
      urgency: "Expected",
      onset: Date.parse("2026-11-27T06:00:00-05:00"),
      ends: FIXTURE_ENDS,
      sender: "NWS Upton NY",
      nwsHeadline:
        "COASTAL FLOOD ADVISORY REMAINS IN EFFECT UNTIL 3 PM EST THIS AFTERNOON",
    });
  });

  it("passes description, instruction, headline and areaDesc through verbatim", async () => {
    const { fetchImpl } = router(okRoutes());
    const [a] = (await getAlerts(COORDS, { fetchImpl, now: () => T0 }))!;
    const p = alertsFixture.features[0].properties;
    expect(a.description).toBe(p.description);
    expect(a.instruction).toBe(p.instruction);
    expect(a.headline).toBe(p.headline);
    expect(a.areaDesc).toBe(p.areaDesc);
  });

  it("requests exactly the alerts URL for the point", async () => {
    const { calls, fetchImpl } = router(okRoutes());
    await getAlerts(COORDS, { fetchImpl, now: () => T0 });
    expect(calls).toContain("https://api.weather.gov/alerts/active?point=41.03,-73.76");
  });

  it("returns an empty list, not null, once the alert has ended", async () => {
    const { fetchImpl } = router(okRoutes());
    const a = await getAlerts(COORDS, { fetchImpl, now: () => FIXTURE_ENDS + 1 });
    expect(a).toEqual([]);
  });
});

describe("getAlerts — dropping and freshness", () => {
  it("drops a Cancel, a Test status and a feature with no event", async () => {
    const body = bodyOf([
      feature({ event: "Keep Me" }),
      feature({ event: "Cancelled", messageType: "Cancel" }),
      feature({ event: "Test Status", status: "Test" }),
      feature({ event: undefined }),
    ]);
    const { fetchImpl } = router(okRoutes(body));
    const a = (await getAlerts(COORDS, { fetchImpl, now: () => T0 }))!;
    expect(a.map((x) => x.event)).toEqual(["Keep Me"]);
  });

  it("returns an empty list for an empty feature list", async () => {
    const { fetchImpl } = router(okRoutes(bodyOf([])));
    expect(await getAlerts(COORDS, { fetchImpl, now: () => T0 })).toEqual([]);
  });

  it("does not return a cached alert after its ends, and makes no new request", async () => {
    const endsSoon = T0 + 2 * 60_000;
    const { calls, fetchImpl } = router(
      okRoutes(bodyOf([feature({ ends: new Date(endsSoon).toISOString() })])),
    );
    const first = (await getAlerts(COORDS, { fetchImpl, now: () => T0 }))!;
    expect(first).toHaveLength(1);
    const before = calls.length;
    const second = await getAlerts(COORDS, { fetchImpl, now: () => T0 + 3 * 60_000 });
    expect(second).toEqual([]);
    expect(calls.length).toBe(before);
  });

  it("keeps an alert with no ends (null) even after the other times pass", async () => {
    const body = bodyOf([feature({ ends: null, expires: undefined })]);
    const { fetchImpl } = router(okRoutes(body));
    const a = (await getAlerts(COORDS, { fetchImpl, now: () => T0 }))!;
    expect(a).toHaveLength(1);
    expect(a[0].ends).toBeNull();
  });
});

describe("getAlerts — field mapping", () => {
  it("maps each severity word to its level and maps an unknown word to Unknown", async () => {
    const names = ["Extreme", "Severe", "Moderate", "Minor", "Unknown", "Banana"];
    const body = bodyOf(names.map((s) => feature({ event: `E-${s}`, severity: s })));
    const { fetchImpl } = router(okRoutes(body));
    const a = (await getAlerts(COORDS, { fetchImpl, now: () => T0 }))!;
    const by = (s: string): WeatherAlert => a.find((x) => x.event === `E-${s}`)!;
    expect([
      by("Extreme").level,
      by("Severe").level,
      by("Moderate").level,
      by("Minor").level,
      by("Unknown").level,
      by("Banana").level,
    ]).toEqual([3, 3, 2, 1, 1, 1]);
    expect(by("Banana").severity).toBe("Unknown");
    expect(by("Extreme").severity).toBe("Extreme");
  });

  it("sorts by level highest first, regardless of onset", async () => {
    const body = bodyOf([
      feature({ event: "Minor", severity: "Minor", onset: "2026-11-27T05:00:00-05:00" }),
      feature({ event: "Severe", severity: "Severe", onset: "2026-11-27T09:00:00-05:00" }),
      feature({ event: "Moderate", severity: "Moderate", onset: "2026-11-27T07:00:00-05:00" }),
    ]);
    const { fetchImpl } = router(okRoutes(body));
    const a = (await getAlerts(COORDS, { fetchImpl, now: () => T0 }))!;
    expect(a.map((x) => x.event)).toEqual(["Severe", "Moderate", "Minor"]);
  });

  it("sorts equal levels by onset, earliest first, with a null onset last", async () => {
    const body = bodyOf([
      feature({ event: "Late", onset: "2026-11-27T08:00:00-05:00" }),
      feature({ event: "NoOnset", onset: undefined }),
      feature({ event: "Early", onset: "2026-11-27T06:00:00-05:00" }),
    ]);
    const { fetchImpl } = router(okRoutes(body));
    const a = (await getAlerts(COORDS, { fetchImpl, now: () => T0 }))!;
    expect(a.map((x) => x.event)).toEqual(["Early", "Late", "NoOnset"]);
    expect(a[2].onset).toBeNull();
  });

  it("falls back from ends to expires, and to null when neither parses", async () => {
    const body = bodyOf([
      feature({ event: "Fallback", ends: null, expires: "2026-11-27T15:00:00-05:00" }),
      feature({ event: "Neither", ends: null }),
    ]);
    const { fetchImpl } = router(okRoutes(body));
    const a = (await getAlerts(COORDS, { fetchImpl, now: () => T0 }))!;
    const by = (e: string) => a.find((x) => x.event === e)!;
    expect(by("Fallback").ends).toBe(FIXTURE_ENDS);
    expect(by("Neither").ends).toBeNull();
  });

  it("passes text through untouched, including outer whitespace and newlines", async () => {
    const padded = "\n  Padded text, kept as given.  \n";
    const body = bodyOf([feature({ event: "Padded", description: padded })]);
    const { fetchImpl } = router(okRoutes(body));
    const [a] = (await getAlerts(COORDS, { fetchImpl, now: () => T0 }))!;
    expect(a.description).toBe(padded);
  });
});

describe("getAlerts — failures", () => {
  it("a 500 on a cold cache gives null and exactly one onError", async () => {
    vi.useFakeTimers();
    const routes = okRoutes();
    routes[ALERTS_URL] = { status: 500, body: {} };
    const { fetchImpl } = router(routes);
    const onError = vi.fn<(err: unknown, ctx: WeatherErrorContext) => void>();
    const pending = getAlerts(COORDS, { fetchImpl, onError, now: () => T0 });
    await vi.advanceTimersByTimeAsync(1000); // past the 500 ms retry backoff
    expect(await pending).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toEqual({ call: "getAlerts", lat: 41.03, lon: -73.76 });
  });

  it("a failed refresh serves the earlier list inside 60 minutes, and null after", async () => {
    vi.useFakeTimers();
    const routes = okRoutes();
    const { fetchImpl } = router(routes);
    const onError = vi.fn();
    const good = await getAlerts(COORDS, { fetchImpl, onError, now: () => T0 });
    expect(good).toHaveLength(1);

    routes[ALERTS_URL] = { status: 500, body: {} };
    const tenMin = T0 + 10 * 60_000;
    const stale = getAlerts(COORDS, { fetchImpl, onError, now: () => tenMin });
    await vi.advanceTimersByTimeAsync(1000);
    const staleList = await stale;
    expect(staleList).toHaveLength(1);
    expect(staleList![0].event).toBe("Coastal Flood Advisory");
    expect(onError).toHaveBeenCalledTimes(1);

    const sixtyOneMin = T0 + 61 * 60_000;
    const expired = getAlerts(COORDS, { fetchImpl, onError, now: () => sixtyOneMin });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await expired).toBeNull();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("a 404 on /points gives null and never calls onError", async () => {
    const routes: Record<string, Route> = {
      [POINTS_URL]: { status: 404, body: {} },
    };
    const { calls, fetchImpl } = router(routes);
    const onError = vi.fn();
    expect(await getAlerts(COORDS, { fetchImpl, onError, now: () => T0 })).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(calls).toEqual([POINTS_URL]);
  });
});
