/**
 * <SkyPanel> — the surface weather renders ON. Paints the condition's sky
 * gradient (168°, always at or darker than #2E5A8C) and, for thunderstorm +
 * heavy-rain, a `#CFE2FF` flash overlay pulsing in step with the bolt (same
 * `steps(1,end)` timing, so the sky and the strike fire together).
 *
 * This component is what ENFORCES the contrast rule (conformance line 1): a
 * <WeatherIcon> lives inside a SkyPanel, so a cream page and a navy app get
 * identical, guaranteed contrast from one palette — no theme fork. Give the panel
 * its own border-radius/padding via `style`; the flash inherits the radius.
 */

import * as React from "react";
import type { WeatherIconKey } from "../types.js";
import { skyConditionFor, skyGradient } from "./skyTints.js";
import { ensureSkyStyles } from "./skyStyles.js";

export interface SkyPanelProps {
  /** WMO-derived icon key — `getWeatherInfo(code).icon`. */
  condition: WeatherIconKey;
  /** Day vs night sky tint. Default true. */
  isDay?: boolean;
  /** Ambient storm flash. Default TRUE. `prefers-reduced-motion` resolves to a dim static frame. */
  animate?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export function SkyPanel({ condition, isDay = true, animate = true, className, style, children }: SkyPanelProps) {
  React.useEffect(() => { ensureSkyStyles(); }, []);
  const cond = skyConditionFor(condition, isDay);
  const flash = cond === "thunderstorm" || cond === "heavy-rain";
  return (
    <div className={className} style={{ position: "relative", isolation: "isolate", background: skyGradient(cond), ...style }}>
      {flash && (
        <div
          aria-hidden
          className={animate ? "aw-skyflash" : undefined}
          style={{ position: "absolute", inset: 0, background: "#CFE2FF", opacity: animate ? 0 : 0.16, pointerEvents: "none", borderRadius: "inherit" }}
        />
      )}
      {children}
    </div>
  );
}
