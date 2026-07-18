import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Shared icon plumbing — props contract, the a11y-aware <svg> wrapper, a
 * per-instance gradient-id helper, and the Constellation duotone palette.
 *
 * WX-P2-8 (a11y) + WX-P3-9 (per-instance gradient ids) live here so every icon
 * file stays small and consistent.
 *
 * ICON LINE — "Constellation" (locked 2026-07-18, Direction A). Gold + navy
 * duotone tied to the Aster constellation-arrow mark: a gold sun/moon, navy
 * (day) / cream (night) duotone clouds, precip in the accent gold, and the
 * snowflake drawn as an ASTERISK — the "aster". Replaces the prior material
 * blue-grey set. Tuned to read at the 16-24px inline sizes the schedule chips
 * actually use, and to hold on both light and dark grounds.
 */
import * as React from "react";
/**
 * Stable per-instance id prefix for gradient ids. Two instances of the same
 * icon on a page must not emit duplicate DOM ids (WX-P3-9). Strip the colons
 * React 18/19 embeds in `useId()` so the value is a valid id-name fragment.
 */
export function useGradientId() {
    return React.useId().replace(/:/g, "");
}
/**
 * Constellation palette (locked). Gold family from the house tokens
 * (`--as-accent` #C9952E) plus a lighter/deeper pair for gradient stops; the
 * duotone cloud pairs are navy for day (crisp on white) and cream for night
 * (legible on dark). The gold accents carry the icon's identity and stay
 * visible on ANY ground.
 */
export const GOLD = "#C9952E"; // brand accent — rays, drops, flakes, bolt
export const GOLD_HI = "#E9C15E"; // lighter gold — highlights, night flake
export const GOLD_DEEP = "#A97C21"; // deeper gold — sun/moon shadow stop
export const GOLD_PALE = "#F2D897"; // pale gold — sun specular highlight
/** Day cloud duotone (navy) — crisp on light cards. */
export const DAY_CLOUD = ["#22314F", "#38507E"];
/** Night cloud duotone (cream) — legible on dark cards. */
export const NIGHT_CLOUD = ["#C9D2E0", "#93A0BB"];
/** Pick the cloud duotone for the current day/night treatment. */
export function cloudStops(isDay) {
    return isDay ? DAY_CLOUD : NIGHT_CLOUD;
}
/**
 * The a11y-aware root `<svg>`. Decorative icons are hidden from the a11y tree
 * (`aria-hidden` + `focusable="false"`); labelled icons expose `role="img"` +
 * `aria-label` + a leading `<title>` (WX-P2-8).
 */
export function IconSvg({ className = "w-4 h-4", decorative = true, label, children, }) {
    const a11y = decorative
        ? { "aria-hidden": true, focusable: "false" }
        : { role: "img", "aria-label": label };
    return (_jsxs("svg", { className: className, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg", ...a11y, children: [!decorative && label ? _jsx("title", { children: label }) : null, children] }));
}
//# sourceMappingURL=iconBase.js.map