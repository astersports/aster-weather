/**
 * Night + severe weather icons — Constellation line (locked Direction A).
 * Heavy rain, freezing rain, snow, thunderstorm, clear night, partly cloudy night.
 *
 * The snowflake is an ASTERISK (the "aster"); the clear-night moon carries small
 * linked stars echoing the constellation-arrow mark. Per-instance gradient ids
 * (WX-P3-9), a11y-aware IconSvg (WX-P2-8), motion opt-in via `animate` and always
 * yielding to prefers-reduced-motion.
 */

import {
  IconSvg,
  useGradientId,
  cloudStops,
  GOLD,
  GOLD_HI,
  type IconProps,
} from "./iconBase.js";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion.js";

export function HeavyRainIcon({ className, decorative = true, label, isDay = true, animate = false }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const animating = animate && !reduced;
  const [a, b] = cloudStops(isDay);
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs><linearGradient id={`${uid}-hr`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
      <path d="M6 14h11a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 8.5 3.5 3.5 0 0 0 6 14z" fill={`url(#${uid}-hr)`} />
      <g fill={GOLD}>
        {animating && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0 1.9; 0 0" dur="1.05s" repeatCount="indefinite" />}
        <path d="M8 16.3c-1.1 1.4-1.1 2.6 0 3 1 .4 1.9-.5 1.5-1.7-.2-.7-.9-.9-1.5-1.3z" />
        <path d="M12 16.3c-1.1 1.4-1.1 2.6 0 3 1 .4 1.9-.5 1.5-1.7-.2-.7-.9-.9-1.5-1.3z" />
        <path d="M16 16.3c-1.1 1.4-1.1 2.6 0 3 1 .4 1.9-.5 1.5-1.7-.2-.7-.9-.9-1.5-1.3z" />
      </g>
      <g fill={GOLD_HI} opacity="0.8">
        {animating && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0 2.2; 0 0" dur="0.9s" repeatCount="indefinite" />}
        <path d="M10 19c-.8 1-.8 1.9 0 2.2.7.3 1.4-.3 1.1-1.2-.1-.5-.6-.7-1.1-1z" />
        <path d="M14 19c-.8 1-.8 1.9 0 2.2.7.3 1.4-.3 1.1-1.2-.1-.5-.6-.7-1.1-1z" />
      </g>
    </IconSvg>
  );
}

export function FreezingRainIcon({ className, decorative = true, label, isDay = true, animate = false }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const animating = animate && !reduced;
  const [a, b] = cloudStops(isDay);
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs><linearGradient id={`${uid}-fr`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
      <path d="M6 14h11a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 8.5 3.5 3.5 0 0 0 6 14z" fill={`url(#${uid}-fr)`} />
      <g fill={GOLD}>
        {animating && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0 1.4; 0 0" dur="1.6s" repeatCount="indefinite" />}
        <path d="M8.5 16.4c-1 1.2-1 2.3 0 2.7.9.4 1.7-.4 1.4-1.5-.2-.6-.8-.8-1.4-1.2z" />
        <path d="M15.5 16.4c-1 1.2-1 2.3 0 2.7.9.4 1.7-.4 1.4-1.5-.2-.6-.8-.8-1.4-1.2z" />
      </g>
      {/* ice pellet — a small gold asterisk between the drops (WX-P2-10 distinguisher) */}
      <g stroke={GOLD_HI} strokeWidth="1.5" strokeLinecap="round" transform="translate(12 19.2)">
        <path d="M0-2.2V2.2" /><path d="M-1.9-1.1 1.9 1.1" /><path d="M-1.9 1.1 1.9-1.1" />
      </g>
    </IconSvg>
  );
}

export function SnowIcon({ className, decorative = true, label, isDay = true, animate = false }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const animating = animate && !reduced;
  const [a, b] = cloudStops(isDay);
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs><linearGradient id={`${uid}-sn`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
      <path d="M6 13h11a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 7.5 3.5 3.5 0 0 0 6 13z" fill={`url(#${uid}-sn)`} />
      <g>
        {animating && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0 1.3; 0 0" dur="2.4s" repeatCount="indefinite" />}
        {/* the "aster" — gold asterisk-flakes */}
        <g stroke={GOLD} strokeWidth="2" strokeLinecap="round">
          <g transform="translate(8.7 18.3)"><path d="M0-2.8V2.8" /><path d="M-2.4-1.4 2.4 1.4" /><path d="M-2.4 1.4 2.4-1.4" /></g>
          <g transform="translate(15.3 18.3)"><path d="M0-2.8V2.8" /><path d="M-2.4-1.4 2.4 1.4" /><path d="M-2.4 1.4 2.4-1.4" /></g>
        </g>
        <g stroke={GOLD_HI} strokeWidth="1.5" strokeLinecap="round"><g transform="translate(12 20.9)"><path d="M0-1.9V1.9" /><path d="M-1.6-.95 1.6 .95" /><path d="M-1.6 .95 1.6-.95" /></g></g>
        <g fill={GOLD_HI}><circle cx="8.7" cy="18.3" r="0.9" /><circle cx="15.3" cy="18.3" r="0.9" /></g>
      </g>
    </IconSvg>
  );
}

export function ThunderstormIcon({ className, decorative = true, label, isDay = true, animate = false }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const animating = animate && !reduced;
  const [a, b] = cloudStops(isDay);
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs><linearGradient id={`${uid}-th`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
      <path d="M6 14h11a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 8.5 3.5 3.5 0 0 0 6 14z" fill={`url(#${uid}-th)`} />
      <path d="M12.4 13l-3.4 5.4h2.5l-1 4.1 4.3-6.2h-2.6l1.4-3.3z" fill={GOLD_HI} stroke={GOLD} strokeWidth="0.5" strokeLinejoin="round">
        {animating && <animate attributeName="opacity" values="1; 0.35; 1; 1" dur="2.2s" repeatCount="indefinite" />}
      </path>
    </IconSvg>
  );
}

export function ClearNightIcon({ className, decorative = true, label, animate = false }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const animating = animate && !reduced;
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs><linearGradient id={`${uid}-moon`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={GOLD_HI} /><stop offset="1" stopColor={GOLD} /></linearGradient></defs>
      <path d="M20 14.6A8 8 0 1 1 10.1 4.4a6.4 6.4 0 0 0 9.9 10.2z" fill={`url(#${uid}-moon)`} />
      <g stroke={GOLD} strokeWidth="0.5" opacity="0.5"><path d="M17 5 20.4 8.2" /><path d="M17 5 14.6 3.2" /></g>
      <g fill={GOLD_HI}>
        {animating && <animate attributeName="opacity" values="1; 0.5; 1" dur="3s" repeatCount="indefinite" />}
        <circle cx="17" cy="5" r="0.9" /><circle cx="20.4" cy="8.2" r="0.6" /><circle cx="14.6" cy="3.2" r="0.55" />
      </g>
    </IconSvg>
  );
}

export function PartlyCloudyNightIcon({ className, decorative = true, label, animate = false }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const animating = animate && !reduced;
  const [a, b] = cloudStops(false); // cream cloud — this is the night cloud
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs>
        <linearGradient id={`${uid}-pcnMoon`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={GOLD_HI} /><stop offset="1" stopColor={GOLD} /></linearGradient>
        <linearGradient id={`${uid}-pcnCloud`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
      </defs>
      <path d="M12.5 9.4A5 5 0 1 1 6.3 3a4 4 0 0 0 6.2 6.4z" fill={`url(#${uid}-pcnMoon)`} />
      <g fill={GOLD_HI}>
        {animating && <animate attributeName="opacity" values="1; 0.5; 1" dur="3s" repeatCount="indefinite" />}
        <circle cx="15" cy="4" r="0.6" /><circle cx="17.2" cy="7" r="0.45" />
      </g>
      <path d="M7 20a4 4 0 0 1 .6-7.9 5.5 5.5 0 0 1 10.3 1.4A3.5 3.5 0 0 1 18 20H7z" fill={`url(#${uid}-pcnCloud)`} />
    </IconSvg>
  );
}
