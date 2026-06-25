/**
 * Main weather icon dispatcher — maps icon string to colorful component.
 *
 * NOTE: `WindIcon` and `DropletIcon` (exported from ./index) are NOT reachable
 * through this dispatcher — no WMO icon key routes to them, so a severe-wind or
 * humidity surface that wants them must import + render them directly. Wiring a
 * wind-icon path (e.g. for high-wind event warnings) is deferred to the v0.2.0
 * hybrid build (audit P2-4), not part of this polish pass.
 */
export declare function ColorfulWeatherIcon({ icon, className, isDay }: {
    icon: string;
    className?: string;
    isDay?: boolean;
}): import("react").JSX.Element;
//# sourceMappingURL=ColorfulWeatherIcon.d.ts.map