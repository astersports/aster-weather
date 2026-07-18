// @vitest-environment happy-dom
/**
 * Icon-layer tests (WX-P2-19 + WX-P2-22).
 *
 * Uses react-dom/server `renderToStaticMarkup` — no full DOM needed. Effects do
 * not run under SSR, so `usePrefersReducedMotion` returns its SSR default
 * (reduced = true): the static art renders with ZERO animation nodes, which is
 * the intended baseline for these assertions.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ColorfulWeatherIcon, ROUTED_ICON_KEYS, SunnyIcon } from "../icons/index.js";
import { WMO_CODES } from "../wmo.js";
import type { WeatherIconKey } from "../types.js";

// Explicit list of every union member. A union change that is not mirrored
// here is a compile error via the exhaustiveness check below.
const ALL_KEYS: WeatherIconKey[] = [
  "clear",
  "mostly-clear",
  "partly-cloudy",
  "overcast",
  "fog",
  "drizzle",
  "light-rain",
  "rain",
  "freezing-rain",
  "heavy-rain",
  "light-snow",
  "snow",
  "heavy-snow",
  "thunderstorm",
];

describe("ColorfulWeatherIcon dispatch", () => {
  it("renders a non-empty <svg> for every icon key, day and night, without throwing", () => {
    for (const icon of ALL_KEYS) {
      for (const isDay of [true, false]) {
        const html = renderToStaticMarkup(
          <ColorfulWeatherIcon icon={icon} isDay={isDay} />,
        );
        expect(html, `${icon} isDay=${isDay}`).toContain("<svg");
        expect(html.length).toBeGreaterThan(20);
      }
    }
  });

  it("routes an unknown key to the neutral fallback (no throw, still an svg)", () => {
    const html = renderToStaticMarkup(<ColorfulWeatherIcon icon="totally-bogus" />);
    expect(html).toContain("<svg");
  });
});

describe("WX-P2-22 — WMO map ↔ dispatcher parity (AP #43)", () => {
  it("every icon key the WMO map emits has an explicit dispatcher case", () => {
    const wmoKeys = new Set(Object.values(WMO_CODES).map((w) => w.icon));
    for (const key of wmoKeys) {
      expect(ROUTED_ICON_KEYS.has(key), `unrouted WMO icon key: ${key}`).toBe(true);
    }
  });

  it("the explicit union list matches ROUTED_ICON_KEYS exactly", () => {
    expect(new Set(ALL_KEYS)).toEqual(new Set(ROUTED_ICON_KEYS));
  });
});

describe("WX-P3-9 — per-instance gradient ids", () => {
  it("two instances of the same icon emit different gradient ids", () => {
    const html = renderToStaticMarkup(
      <>
        <SunnyIcon />
        <SunnyIcon />
      </>,
    );
    const ids = [...html.matchAll(/id="([^"]*-asun)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("WX-P2-8 — accessibility semantics", () => {
  it("a decorative icon is hidden from the a11y tree", () => {
    const html = renderToStaticMarkup(<ColorfulWeatherIcon icon="rain" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).not.toContain('role="img"');
  });

  it("a non-decorative icon exposes role/aria-label + <title>", () => {
    const html = renderToStaticMarkup(
      <ColorfulWeatherIcon icon="rain" decorative={false} label="Rainy" />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Rainy"');
    expect(html).toContain("<title>Rainy</title>");
  });

  it("falls back to a humanized key when no label is given", () => {
    const html = renderToStaticMarkup(
      <ColorfulWeatherIcon icon="partly-cloudy" decorative={false} />,
    );
    expect(html).toContain('aria-label="Partly cloudy"');
  });
});
