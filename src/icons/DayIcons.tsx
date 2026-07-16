/**
 * Daytime weather icons — Sun, partly cloudy, overcast, fog, drizzle, rain.
 *
 * Every gradient id is per-instance (WX-P3-9), a11y-aware via IconSvg
 * (WX-P2-8), motion is gated behind prefers-reduced-motion (WX-P2-9), and the
 * cloud icons take a night treatment (WX-P2-11).
 */

import { IconSvg, useGradientId, NIGHT_CLOUD, type IconProps } from "./iconBase.js";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion.js";

export function SunnyIcon({ className, decorative = true, label }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs>
        <radialGradient id={`${uid}-sunGrad`} cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#FFD700" /><stop offset="100%" stopColor="#FF8C00" /></radialGradient>
        <linearGradient id={`${uid}-rayGrad`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FFD700" /><stop offset="100%" stopColor="#FFA500" /></linearGradient>
      </defs>
      <circle cx="12" cy="12" r="5" fill={`url(#${uid}-sunGrad)`} />
      <g fill={`url(#${uid}-rayGrad)`}>
        {!reduced && <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 12 12" to="360 12 12" dur="9s" repeatCount="indefinite" />}
        <rect x="11" y="1.5" width="2" height="3.5" rx="1" /><rect x="11" y="19" width="2" height="3.5" rx="1" />
        <rect x="19" y="11" width="3.5" height="2" rx="1" /><rect x="1.5" y="11" width="3.5" height="2" rx="1" />
        <rect x="17.5" y="4" width="2" height="3.5" rx="1" transform="rotate(45 18.5 5.75)" />
        <rect x="4.5" y="16.5" width="2" height="3.5" rx="1" transform="rotate(45 5.5 18.25)" />
        <rect x="17.5" y="16.5" width="2" height="3.5" rx="1" transform="rotate(-45 18.5 18.25)" />
        <rect x="4.5" y="4" width="2" height="3.5" rx="1" transform="rotate(-45 5.5 5.75)" />
      </g>
    </IconSvg>
  );
}

export function PartlyCloudyIcon({ className, decorative = true, label }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs>
        <radialGradient id={`${uid}-pcSunGrad`} cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#FFD700" /><stop offset="100%" stopColor="#FF8C00" /></radialGradient>
        <linearGradient id={`${uid}-pcCloudGrad`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#E8EDF2" /><stop offset="100%" stopColor="#B0BEC5" /></linearGradient>
      </defs>
      <circle cx="10" cy="8" r="4" fill={`url(#${uid}-pcSunGrad)`} />
      <g fill="#FFA500" opacity="0.7"><rect x="9.2" y="2" width="1.5" height="2.5" rx="0.75" /><rect x="14.5" y="6.5" width="2.5" height="1.5" rx="0.75" /><rect x="4" y="6.5" width="2.5" height="1.5" rx="0.75" /></g>
      <g>
        {!reduced && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0.8 0; 0 0" dur="7s" repeatCount="indefinite" />}
        <path d="M7 19a4 4 0 0 1 .6-7.9 5.5 5.5 0 0 1 10.3 1.4A3.5 3.5 0 0 1 18 19H7z" fill={`url(#${uid}-pcCloudGrad)`} />
      </g>
    </IconSvg>
  );
}

export function OvercastIcon({ className, decorative = true, label, isDay = true }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const [c1a, c1b] = isDay ? ["#CFD8DC", "#90A4AE"] : NIGHT_CLOUD;
  const [c2a, c2b] = isDay ? ["#B0BEC5", "#78909C"] : NIGHT_CLOUD;
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs>
        <linearGradient id={`${uid}-ovCloudGrad1`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={c1a} /><stop offset="100%" stopColor={c1b} /></linearGradient>
        <linearGradient id={`${uid}-ovCloudGrad2`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={c2a} /><stop offset="100%" stopColor={c2b} /></linearGradient>
      </defs>
      <g>
        {!reduced && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0.9 0; 0 0" dur="8s" repeatCount="indefinite" />}
        <path d="M6 15h10a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 9.5 3.5 3.5 0 0 0 6 15z" fill={`url(#${uid}-ovCloudGrad1)`} />
      </g>
      <g>
        {!reduced && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; -0.9 0; 0 0" dur="9s" repeatCount="indefinite" />}
        <path d="M9 20h9a3 3 0 0 0 0-6h-.2A4 4 0 0 0 9.5 15 3 3 0 0 0 9 20z" fill={`url(#${uid}-ovCloudGrad2)`} />
      </g>
    </IconSvg>
  );
}

export function FogIcon({ className, decorative = true, label, isDay = true }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const [ca, cb] = isDay ? ["#B0BEC5", "#CFD8DC"] : NIGHT_CLOUD;
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs><linearGradient id={`${uid}-fogGrad`} x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor={ca} /><stop offset="100%" stopColor={cb} /></linearGradient></defs>
      <path d="M5 12h10a3 3 0 0 0 0-6h-.2A4 4 0 0 0 5.5 7.5 3 3 0 0 0 5 12z" fill={`url(#${uid}-fogGrad)`} />
      <g>
        {!reduced && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 1 0; 0 0" dur="6s" repeatCount="indefinite" />}
        {/* WX-P2-12: raised opacity + darker strokes so the trailing detail stays legible on near-white cards. */}
        <rect x="4" y="14" width="16" height="1.5" rx="0.75" fill="#78909C" />
        <rect x="6" y="17" width="12" height="1.5" rx="0.75" fill="#90A4AE" opacity="0.9" />
        <rect x="5" y="20" width="14" height="1.5" rx="0.75" fill="#90A4AE" opacity="0.75" />
      </g>
    </IconSvg>
  );
}

export function DrizzleIcon({ className, decorative = true, label, isDay = true }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const [ca, cb] = isDay ? ["#B0BEC5", "#78909C"] : NIGHT_CLOUD;
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs>
        <linearGradient id={`${uid}-drCloudGrad`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={ca} /><stop offset="100%" stopColor={cb} /></linearGradient>
        <linearGradient id={`${uid}-drDropGrad`} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#64B5F6" /><stop offset="100%" stopColor="#1E88E5" /></linearGradient>
      </defs>
      <path d="M6 13h10a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 7.5 3.5 3.5 0 0 0 6 13z" fill={`url(#${uid}-drCloudGrad)`} />
      <g fill={`url(#${uid}-drDropGrad)`}>
        {!reduced && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0 1.4; 0 0" dur="1.6s" repeatCount="indefinite" />}
        <circle cx="8" cy="16" r="0.8" /><circle cx="12" cy="17" r="0.8" />
        <circle cx="10" cy="19" r="0.8" /><circle cx="14" cy="15.5" r="0.8" />
      </g>
    </IconSvg>
  );
}

export function RainIcon({ className, decorative = true, label, isDay = true }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const [ca, cb] = isDay ? ["#90A4AE", "#546E7A"] : NIGHT_CLOUD;
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs>
        <linearGradient id={`${uid}-rnCloudGrad`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={ca} /><stop offset="100%" stopColor={cb} /></linearGradient>
        <linearGradient id={`${uid}-rnDropGrad`} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#42A5F5" /><stop offset="100%" stopColor="#1565C0" /></linearGradient>
      </defs>
      <path d="M6 12h10a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 6.5 3.5 3.5 0 0 0 6 12z" fill={`url(#${uid}-rnCloudGrad)`} />
      <g stroke={`url(#${uid}-rnDropGrad)`} strokeLinecap="round">
        {!reduced && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0 1.6; 0 0" dur="1.3s" repeatCount="indefinite" />}
        <path d="M8 14.5l-1 3.5" strokeWidth="1.5" />
        <path d="M12 14.5l-1 3.5" strokeWidth="1.5" />
        <path d="M16 14.5l-1 3.5" strokeWidth="1.5" />
        <path d="M10 17.5l-1 3" strokeWidth="1.2" opacity="0.7" />
        <path d="M14 17.5l-1 3" strokeWidth="1.2" opacity="0.7" />
      </g>
    </IconSvg>
  );
}
