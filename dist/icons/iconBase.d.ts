/**
 * Shared icon plumbing — props contract, the a11y-aware <svg> wrapper, a
 * per-instance gradient-id helper, and the night cloud palette.
 *
 * WX-P2-8 (a11y) + WX-P3-9 (per-instance gradient ids) + WX-P2-11 (night
 * palette) live here so every icon file stays small and consistent.
 */
import * as React from "react";
export interface IconProps {
    className?: string;
    /** Accessible label. Used only when `decorative` is false. */
    label?: string;
    /** When true (default) the icon is aria-hidden decoration. */
    decorative?: boolean;
    /** Day vs night treatment for the cloud/precip icons (WX-P2-11). */
    isDay?: boolean;
}
/**
 * Stable per-instance id prefix for gradient ids. Two instances of the same
 * icon on a page must not emit duplicate DOM ids (WX-P3-9). Strip the colons
 * React 18/19 embeds in `useId()` so the value is a valid id-name fragment.
 */
export declare function useGradientId(): string;
/**
 * Shared darker cloud gradient stops for the night treatment (WX-P2-11). A
 * single darker palette stands in for every day cloud at night — the simplest
 * acceptable night look per the audit.
 */
export declare const NIGHT_CLOUD: readonly [string, string];
/**
 * The a11y-aware root `<svg>`. Decorative icons are hidden from the a11y tree
 * (`aria-hidden` + `focusable="false"`); labelled icons expose `role="img"` +
 * `aria-label` + a leading `<title>` (WX-P2-8).
 */
export declare function IconSvg({ className, decorative, label, children, }: {
    className?: string;
    decorative?: boolean;
    label?: string;
    children: React.ReactNode;
}): React.JSX.Element;
//# sourceMappingURL=iconBase.d.ts.map