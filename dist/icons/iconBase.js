import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Shared icon plumbing — props contract, the a11y-aware <svg> wrapper, a
 * per-instance gradient-id helper, and the night cloud palette.
 *
 * WX-P2-8 (a11y) + WX-P3-9 (per-instance gradient ids) + WX-P2-11 (night
 * palette) live here so every icon file stays small and consistent.
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
 * Shared darker cloud gradient stops for the night treatment (WX-P2-11). A
 * single darker palette stands in for every day cloud at night — the simplest
 * acceptable night look per the audit.
 */
export const NIGHT_CLOUD = ["#4B5A66", "#2A353D"];
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