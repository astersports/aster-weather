/**
 * Utility icons — wind + droplet. NOT weather-condition icons and NOT part of the
 * Sky system: these are small metric glyphs (a wind-speed / humidity row), kept
 * so consumers on that surface don't have to reach for another icon set. They use
 * a 24-viewBox and their own per-instance gradient id; unlike WeatherIcon they do
 * not require a sky panel.
 */

import * as React from "react";

function useGid(): string {
  return React.useId().replace(/:/g, "");
}

export interface UtilityIconProps {
  className?: string;
  label?: string;
  style?: React.CSSProperties;
}

function Svg({ className, label, style, children }: UtilityIconProps & { children: React.ReactNode }) {
  const a11y = label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg" {...a11y}>
      {label ? <title>{label}</title> : null}
      {children}
    </svg>
  );
}

export function WindIcon(props: UtilityIconProps) {
  const uid = useGid();
  return (
    <Svg {...props}>
      <defs><linearGradient id={`${uid}-wind`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#90A4AE" /><stop offset="100%" stopColor="#546E7A" /></linearGradient></defs>
      <path d="M3 8h10a2 2 0 1 0-2-2" stroke={`url(#${uid}-wind)`} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 12h14a2.5 2.5 0 1 1-2.5 2.5" stroke={`url(#${uid}-wind)`} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 16h7a2 2 0 1 1-2 2" stroke={`url(#${uid}-wind)`} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function DropletIcon(props: UtilityIconProps) {
  const uid = useGid();
  return (
    <Svg {...props}>
      <defs><linearGradient id={`${uid}-drop`} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#64B5F6" /><stop offset="100%" stopColor="#1565C0" /></linearGradient></defs>
      <path d="M12 2.5c0 0-6 7.5-6 12a6 6 0 0 0 12 0c0-4.5-6-12-6-12z" fill={`url(#${uid}-drop)`} />
    </Svg>
  );
}
