/**
 * Daytime weather icons — Sun, partly cloudy, overcast, fog, drizzle, rain.
 *
 * Every gradient id is per-instance (WX-P3-9), a11y-aware via IconSvg
 * (WX-P2-8), motion is gated behind prefers-reduced-motion (WX-P2-9), and the
 * cloud icons take a night treatment (WX-P2-11).
 */
import { type IconProps } from "./iconBase.js";
export declare function SunnyIcon({ className, decorative, label }: IconProps): import("react").JSX.Element;
export declare function PartlyCloudyIcon({ className, decorative, label }: IconProps): import("react").JSX.Element;
export declare function OvercastIcon({ className, decorative, label, isDay }: IconProps): import("react").JSX.Element;
export declare function FogIcon({ className, decorative, label, isDay }: IconProps): import("react").JSX.Element;
export declare function DrizzleIcon({ className, decorative, label, isDay }: IconProps): import("react").JSX.Element;
export declare function RainIcon({ className, decorative, label, isDay }: IconProps): import("react").JSX.Element;
//# sourceMappingURL=DayIcons.d.ts.map