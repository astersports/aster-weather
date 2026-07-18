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
export interface IconProps {
    className?: string;
    /** Accessible label. Used only when `decorative` is false. */
    label?: string;
    /** When true (default) the icon is aria-hidden decoration. */
    decorative?: boolean;
    /** Day vs night treatment for the cloud/precip icons. */
    isDay?: boolean;
    /**
     * Opt-in motion. Default FALSE — icons render static. When true AND the user
     * has not requested reduced motion, the icon animates (sun spin / cloud drift
     * / precip fall). `prefers-reduced-motion` always wins over `animate`.
     */
    animate?: boolean;
}
/**
 * Stable per-instance id prefix for gradient ids. Two instances of the same
 * icon on a page must not emit duplicate DOM ids (WX-P3-9). Strip the colons
 * React 18/19 embeds in `useId()` so the value is a valid id-name fragment.
 */
export declare function useGradientId(): string;
/**
 * Constellation palette (locked). Gold family from the house tokens
 * (`--as-accent` #C9952E) plus a lighter/deeper pair for gradient stops; the
 * duotone cloud pairs are navy for day (crisp on white) and cream for night
 * (legible on dark). The gold accents carry the icon's identity and stay
 * visible on ANY ground.
 */
export declare const GOLD = "#C9952E";
export declare const GOLD_HI = "#E9C15E";
export declare const GOLD_DEEP = "#A97C21";
export declare const GOLD_PALE = "#F2D897";
/** Day cloud duotone (navy) — crisp on light cards. */
export declare const DAY_CLOUD: readonly [string, string];
/** Night cloud duotone (cream) — legible on dark cards. */
export declare const NIGHT_CLOUD: readonly [string, string];
/** Pick the cloud duotone for the current day/night treatment. */
export declare function cloudStops(isDay: boolean): readonly [string, string];
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