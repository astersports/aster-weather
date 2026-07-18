import { jsx as _jsx } from "react/jsx-runtime";
/**
 * <WeatherIcon> — the Sky icon. Fills its container (no pixel size, ever): the
 * SVG is width/height 100% with a 0 0 64 64 viewBox + `xMidYMid meet`, so the
 * container decides the scale (ICON_SYSTEM_SKY_BUILD_SPEC §4). Glossy icons need
 * real pixels — a surface that can't give ~32px should render text, not a glyph.
 *
 * Motion is ON by default (R-1); pass `animate={false}` for a static frame, and
 * `prefers-reduced-motion` always resolves to static via the injected stylesheet.
 * Decorative by default (`aria-hidden`); pass `title` to expose role=img + <title>.
 *
 * NOTE: a WeatherIcon must live on a sky surface at or darker than #2E5A8C
 * (SKY_FLOOR) — use it inside <SkyPanel>. Its precip/sun marks do NOT clear 3:1
 * on a light card (conformance line 1).
 */
import * as React from "react";
import { WEATHER_ART } from "./weatherArt.js";
import { skyConditionFor } from "./skyTints.js";
import { ensureSkyStyles } from "./skyStyles.js";
function escapeXml(s) {
    return s.replace(/[<>&]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"));
}
export function WeatherIcon({ condition, isDay = true, animate = true, title, className, style }) {
    const uid = React.useId().replace(/:/g, "");
    React.useEffect(() => { ensureSkyStyles(); }, []);
    const cond = skyConditionFor(condition, isDay);
    const art = (WEATHER_ART[cond] ?? WEATHER_ART.clear)(uid, animate);
    const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
    return (_jsx("svg", { viewBox: "0 0 64 64", preserveAspectRatio: "xMidYMid meet", className: className, style: { width: "100%", height: "100%", display: "block", ...style }, xmlns: "http://www.w3.org/2000/svg", ...a11y, dangerouslySetInnerHTML: { __html: (title ? `<title>${escapeXml(title)}</title>` : "") + art } }));
}
//# sourceMappingURL=WeatherIcon.js.map