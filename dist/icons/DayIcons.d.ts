/**
 * Daytime weather icons — Constellation line (locked Direction A).
 * Sun, partly cloudy, overcast, fog, drizzle, rain.
 *
 * Gold sun with constellation rays, navy(day)/cream(night) duotone clouds,
 * precip in accent gold. Every gradient id is per-instance (WX-P3-9), a11y-aware
 * via IconSvg (WX-P2-8), motion is opt-in via `animate` and always yields to
 * prefers-reduced-motion.
 */
import { type IconProps } from "./iconBase.js";
export declare function SunnyIcon({ className, decorative, label, animate }: IconProps): import("react").JSX.Element;
export declare function PartlyCloudyIcon({ className, decorative, label, isDay, animate }: IconProps): import("react").JSX.Element;
export declare function OvercastIcon({ className, decorative, label, isDay, animate }: IconProps): import("react").JSX.Element;
export declare function FogIcon({ className, decorative, label, isDay, animate }: IconProps): import("react").JSX.Element;
export declare function DrizzleIcon({ className, decorative, label, isDay, animate }: IconProps): import("react").JSX.Element;
export declare function RainIcon({ className, decorative, label, isDay, animate }: IconProps): import("react").JSX.Element;
//# sourceMappingURL=DayIcons.d.ts.map