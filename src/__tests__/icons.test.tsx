// @vitest-environment happy-dom
/**
 * Sky icon-system tests. Uses react-dom/server `renderToStaticMarkup` — effects
 * (the stylesheet injection) do not run under SSR, which is the intended static
 * baseline. Motion is expressed as `aw-*` classes in the markup and driven by the
 * injected stylesheet at runtime; `prefers-reduced-motion` disables it in CSS.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  WeatherIcon, SkyPanel, SKY_TINTS, SKY_CONDITIONS, ROUTED_ICON_KEYS, WEATHER_ART, skyConditionFor,
} from "../icons/index.js";
import { WMO_CODES } from "../wmo.js";
import type { WeatherIconKey } from "../types.js";

const WMO_KEYS: WeatherIconKey[] = [
  "clear", "mostly-clear", "partly-cloudy", "overcast", "fog", "drizzle", "light-rain",
  "rain", "freezing-rain", "heavy-rain", "light-snow", "snow", "heavy-snow", "thunderstorm",
];

describe("WeatherIcon — render", () => {
  it("renders a non-empty 64-viewBox <svg> for every WMO key, day and night", () => {
    for (const condition of WMO_KEYS) {
      for (const isDay of [true, false]) {
        const html = renderToStaticMarkup(<WeatherIcon condition={condition} isDay={isDay} />);
        expect(html, `${condition} isDay=${isDay}`).toContain("<svg");
        expect(html).toContain('viewBox="0 0 64 64"');
        expect(html.length).toBeGreaterThan(60);
      }
    }
  });
  it("fills its container — no pixel size (spec §4)", () => {
    const html = renderToStaticMarkup(<WeatherIcon condition="rain" />);
    expect(html).toMatch(/width:\s*100%/);
    expect(html).toMatch(/height:\s*100%/);
    expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
  });
});

describe("vocabulary — all 17, nothing collapses (conformance line 2)", () => {
  it("every SkyCondition has art AND a tint; exactly 17 of each", () => {
    for (const c of SKY_CONDITIONS) {
      expect(WEATHER_ART[c], `art ${c}`).toBeTypeOf("function");
      expect(SKY_TINTS[c], `tint ${c}`).toBeTruthy();
    }
    expect(SKY_CONDITIONS.length).toBe(17);
    expect(Object.keys(WEATHER_ART).length).toBe(17);
    expect(Object.keys(SKY_TINTS).length).toBe(17);
  });
  it("night variants carry distinct, darker tints than their day key", () => {
    expect(SKY_TINTS["clear-night"]).not.toEqual(SKY_TINTS["clear"]);
    expect(SKY_TINTS["partly-cloudy-night"]).not.toEqual(SKY_TINTS["partly-cloudy"]);
    expect(SKY_TINTS["snow-night"]).not.toEqual(SKY_TINTS["snow"]);
  });
});

describe("WX-P2-22 — WMO map ↔ routed-key parity (AP #43)", () => {
  it("every icon key the WMO map emits is a routed key", () => {
    const wmoKeys = new Set(Object.values(WMO_CODES).map((w) => w.icon));
    for (const k of wmoKeys) expect(ROUTED_ICON_KEYS.has(k), `unrouted: ${k}`).toBe(true);
  });
  it("routed keys match the 14 WMO union exactly", () => {
    expect(new Set(ROUTED_ICON_KEYS)).toEqual(new Set(WMO_KEYS));
  });
});

describe("skyConditionFor — night resolution", () => {
  it("passes day keys through unchanged", () => {
    for (const k of WMO_KEYS) expect(skyConditionFor(k, true)).toBe(k);
  });
  it("maps clear/partly/snow to night variants; leaves the rest", () => {
    expect(skyConditionFor("clear", false)).toBe("clear-night");
    expect(skyConditionFor("mostly-clear", false)).toBe("clear-night");
    expect(skyConditionFor("partly-cloudy", false)).toBe("partly-cloudy-night");
    expect(skyConditionFor("snow", false)).toBe("snow-night");
    expect(skyConditionFor("heavy-snow", false)).toBe("snow-night");
    expect(skyConditionFor("rain", false)).toBe("rain");
    expect(skyConditionFor("thunderstorm", false)).toBe("thunderstorm");
  });
});

describe("WX-P3-9 — per-instance ids", () => {
  it("two icons of the same condition emit different gradient ids", () => {
    const html = renderToStaticMarkup(
      <>
        <WeatherIcon condition="clear" />
        <WeatherIcon condition="clear" />
      </>,
    );
    const ids = [...html.matchAll(/id="sd([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBe(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("accessibility", () => {
  it("decorative by default (aria-hidden, no role)", () => {
    const html = renderToStaticMarkup(<WeatherIcon condition="rain" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
  });
  it("title exposes role=img + aria-label + <title>", () => {
    const html = renderToStaticMarkup(<WeatherIcon condition="rain" title="Rainy" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Rainy"');
    expect(html).toContain("<title>Rainy</title>");
  });
});

describe("motion gating (R-1 — on by default)", () => {
  it("animates by default", () => {
    expect(renderToStaticMarkup(<WeatherIcon condition="rain" />)).toMatch(/class="aw-/);
  });
  it("animate={false} emits no aw-* motion classes", () => {
    const html = renderToStaticMarkup(<WeatherIcon condition="thunderstorm" animate={false} />);
    expect(html).not.toMatch(/aw-drift|aw-fall|aw-corona|aw-tumble|aw-flash|aw-bloom|aw-twinkle|aw-slide/);
  });
});

describe("SkyPanel — the enforcing surface", () => {
  it("paints the condition gradient down to the floor tint", () => {
    const html = renderToStaticMarkup(<SkyPanel condition="clear"><span /></SkyPanel>);
    expect(html).toContain("linear-gradient(168deg");
    expect(html).toContain("#2E5A8C"); // clear's darker stop == the floor
  });
  it("thunderstorm + heavy-rain carry the flash overlay; calm skies don't", () => {
    expect(renderToStaticMarkup(<SkyPanel condition="thunderstorm"><i /></SkyPanel>)).toContain("aw-skyflash");
    expect(renderToStaticMarkup(<SkyPanel condition="heavy-rain"><i /></SkyPanel>)).toContain("aw-skyflash");
    expect(renderToStaticMarkup(<SkyPanel condition="clear"><i /></SkyPanel>)).not.toContain("aw-skyflash");
  });
});
