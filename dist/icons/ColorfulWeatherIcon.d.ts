/**
 * Main weather icon dispatcher — maps an icon-key string to a colorful
 * component.
 *
 * NOTE: `WindIcon` and `DropletIcon` (exported from ./index) are NOT reachable
 * through this dispatcher — no WMO icon key routes to them, so a severe-wind or
 * humidity surface that wants them must import + render them directly.
 *
 * Accessibility (WX-P2-8): icons default to decorative (`aria-hidden`). Pass
 * `decorative={false}` to expose `role="img"` + a label; if no explicit `label`
 * is given the key is humanized ("partly-cloudy" → "Partly cloudy").
 */
/**
 * The icon keys with an explicit dispatcher case (i.e. NOT falling to the
 * neutral default). The WMO↔dispatcher parity test (WX-P2-22) cross-checks
 * this against every key the WMO map emits — a new WMO icon key with no case
 * here fails that test instead of silently rendering the neutral fallback.
 */
export declare const ROUTED_ICON_KEYS: ReadonlySet<string>;
export declare function ColorfulWeatherIcon({ icon, className, isDay, label, decorative, animate, }: {
    icon: string;
    className?: string;
    isDay?: boolean;
    label?: string;
    decorative?: boolean;
    /** Opt-in motion; always yields to prefers-reduced-motion. Default static. */
    animate?: boolean;
}): import("react").JSX.Element;
//# sourceMappingURL=ColorfulWeatherIcon.d.ts.map