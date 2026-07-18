/**
 * Daytime weather icons — Constellation line (locked Direction A).
 * Sun, partly cloudy, overcast, fog, drizzle, rain.
 *
 * Gold sun with constellation rays, navy(day)/cream(night) duotone clouds,
 * precip in accent gold. Every gradient id is per-instance (WX-P3-9), a11y-aware
 * via IconSvg (WX-P2-8), motion is opt-in via `animate` and always yields to
 * prefers-reduced-motion.
 */

import {
  IconSvg,
  useGradientId,
  cloudStops,
  GOLD,
  GOLD_HI,
  GOLD_DEEP,
  GOLD_PALE,
  type IconProps,
} from "./iconBase.js";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion.js";

const RAYS = [
  "M12 2v2.6", "M12 19.4V22", "M2 12h2.6", "M19.4 12H22",
  "M4.9 4.9 6.8 6.8", "M17.2 17.2 19.1 19.1", "M19.1 4.9 17.2 6.8", "M6.8 17.2 4.9 19.1",
];

export function SunnyIcon({ className, decorative = true, label, animate = false }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const animating = animate && !reduced;
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs>
        <radialGradient id={`${uid}-asun`} cx="45%" cy="40%" r="65%"><stop offset="0%" stopColor={GOLD_HI} /><stop offset="70%" stopColor={GOLD} /><stop offset="100%" stopColor={GOLD_DEEP} /></radialGradient>
      </defs>
      <g stroke={GOLD} strokeWidth="1.9" strokeLinecap="round">
        {animating && <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 12 12" to="360 12 12" dur="10s" repeatCount="indefinite" />}
        {RAYS.map((d, i) => <path key={i} d={d} />)}
      </g>
      <circle cx="12" cy="12" r="5.1" fill={`url(#${uid}-asun)`} />
      <circle cx="10.3" cy="10.3" r="1.5" fill={GOLD_PALE} opacity="0.55" />
    </IconSvg>
  );
}

export function PartlyCloudyIcon({ className, decorative = true, label, isDay = true, animate = false }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const animating = animate && !reduced;
  const [a, b] = cloudStops(isDay);
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs>
        <radialGradient id={`${uid}-apc`} cx="45%" cy="40%" r="65%"><stop offset="0%" stopColor={GOLD_HI} /><stop offset="100%" stopColor={GOLD} /></radialGradient>
        <linearGradient id={`${uid}-apcc`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
      </defs>
      <g stroke={GOLD} strokeWidth="1.6" strokeLinecap="round">
        {animating && <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 9 7.5" to="360 9 7.5" dur="11s" repeatCount="indefinite" />}
        <path d="M9 1.5v1.8" /><path d="M2.6 7.5 4.2 8.3" /><path d="M15.4 7.5 13.8 8.3" />
      </g>
      <circle cx="9" cy="7.5" r="3.6" fill={`url(#${uid}-apc)`} />
      <path d="M7 19a4 4 0 0 1 .6-7.9 5.5 5.5 0 0 1 10.3 1.4A3.5 3.5 0 0 1 18 19H7z" fill={`url(#${uid}-apcc)`} />
    </IconSvg>
  );
}

export function OvercastIcon({ className, decorative = true, label, isDay = true, animate = false }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const animating = animate && !reduced;
  const [a, b] = cloudStops(isDay);
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs>
        <linearGradient id={`${uid}-ov1`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={b} /><stop offset="1" stopColor={a} /></linearGradient>
        <linearGradient id={`${uid}-ov2`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
      </defs>
      <g opacity="0.85">
        {animating && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0.9 0; 0 0" dur="8s" repeatCount="indefinite" />}
        <path d="M6 14h10a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 8.5 3.5 3.5 0 0 0 6 14z" fill={`url(#${uid}-ov1)`} />
      </g>
      <g>
        {animating && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; -0.9 0; 0 0" dur="9s" repeatCount="indefinite" />}
        <path d="M9 20h9a3 3 0 0 0 0-6h-.2A4 4 0 0 0 9.5 15 3 3 0 0 0 9 20z" fill={`url(#${uid}-ov2)`} />
      </g>
    </IconSvg>
  );
}

export function FogIcon({ className, decorative = true, label, isDay = true, animate = false }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const animating = animate && !reduced;
  const [a, b] = cloudStops(isDay);
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs><linearGradient id={`${uid}-fog`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
      <path d="M5 12h10a3 3 0 0 0 0-6h-.2A4 4 0 0 0 5.5 7.5 3 3 0 0 0 5 12z" fill={`url(#${uid}-fog)`} />
      <g stroke={GOLD} strokeWidth="1.6" strokeLinecap="round">
        {animating && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 1 0; 0 0" dur="6s" repeatCount="indefinite" />}
        <path d="M4 15h16" /><path d="M6 18h12" opacity="0.85" /><path d="M5 21h14" opacity="0.65" />
      </g>
    </IconSvg>
  );
}

export function DrizzleIcon({ className, decorative = true, label, isDay = true, animate = false }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const animating = animate && !reduced;
  const [a, b] = cloudStops(isDay);
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs><linearGradient id={`${uid}-dr`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
      <path d="M6 13h10a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 7.5 3.5 3.5 0 0 0 6 13z" fill={`url(#${uid}-dr)`} />
      <g fill={GOLD}>
        {animating && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0 1.3; 0 0" dur="1.7s" repeatCount="indefinite" />}
        <path d="M9.5 15.6c-.8 1-.8 1.9 0 2.2.7.3 1.4-.3 1.1-1.2-.1-.5-.6-.7-1.1-1z" />
        <path d="M14.5 15.6c-.8 1-.8 1.9 0 2.2.7.3 1.4-.3 1.1-1.2-.1-.5-.6-.7-1.1-1z" />
      </g>
    </IconSvg>
  );
}

export function RainIcon({ className, decorative = true, label, isDay = true, animate = false }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const animating = animate && !reduced;
  const [a, b] = cloudStops(isDay);
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs><linearGradient id={`${uid}-rn`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
      <path d="M6 15h11a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 9.5 3.5 3.5 0 0 0 6 15z" fill={`url(#${uid}-rn)`} />
      <g fill={GOLD}>
        {animating && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0 1.6; 0 0" dur="1.3s" repeatCount="indefinite" />}
        <path d="M9 17.5c-1 1.2-1 2.3 0 2.7.9.4 1.7-.4 1.4-1.5-.2-.6-.8-.8-1.4-1.2z" />
        <path d="M13 17.5c-1 1.2-1 2.3 0 2.7.9.4 1.7-.4 1.4-1.5-.2-.6-.8-.8-1.4-1.2z" />
        <path d="M17 17.5c-1 1.2-1 2.3 0 2.7.9.4 1.7-.4 1.4-1.5-.2-.6-.8-.8-1.4-1.2z" />
      </g>
    </IconSvg>
  );
}
