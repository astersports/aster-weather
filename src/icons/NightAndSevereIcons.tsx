/**
 * Night + severe weather icons — heavy rain, freezing rain, snow, thunderstorm,
 * and the two night variants.
 *
 * Per-instance gradient ids (WX-P3-9), a11y via IconSvg (WX-P2-8), motion gated
 * behind prefers-reduced-motion (WX-P2-9), night palette (WX-P2-11), and the
 * freezing-rain icon (WX-P2-10).
 */

import { IconSvg, useGradientId, NIGHT_CLOUD, type IconProps } from "./iconBase.js";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion.js";

export function HeavyRainIcon({ className, decorative = true, label, isDay = true }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const [ca, cb] = isDay ? ["#607D8B", "#37474F"] : NIGHT_CLOUD;
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs>
        <linearGradient id={`${uid}-hrCloudGrad`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={ca} /><stop offset="100%" stopColor={cb} /></linearGradient>
        <linearGradient id={`${uid}-hrDropGrad`} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#2196F3" /><stop offset="100%" stopColor="#0D47A1" /></linearGradient>
      </defs>
      <path d="M5 11h11a3.5 3.5 0 0 0 0-7h-.3A5 5 0 0 0 5.5 5.5 3.5 3.5 0 0 0 5 11z" fill={`url(#${uid}-hrCloudGrad)`} />
      <g stroke={`url(#${uid}-hrDropGrad)`} strokeLinecap="round">
        {!reduced && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0 2; 0 0" dur="1.1s" repeatCount="indefinite" />}
        <path d="M7 13l-1.5 4.5" strokeWidth="2" />
        <path d="M11 13l-1.5 4.5" strokeWidth="2" />
        <path d="M15 13l-1.5 4.5" strokeWidth="2" />
        <path d="M9 17l-1.5 4" strokeWidth="1.8" />
        <path d="M13 17l-1.5 4" strokeWidth="1.8" />
      </g>
    </IconSvg>
  );
}

export function FreezingRainIcon({ className, decorative = true, label, isDay = true }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const [ca, cb] = isDay ? ["#90A4AE", "#546E7A"] : NIGHT_CLOUD;
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs>
        <linearGradient id={`${uid}-fzCloudGrad`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={ca} /><stop offset="100%" stopColor={cb} /></linearGradient>
        <linearGradient id={`${uid}-fzDropGrad`} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#4FC3F7" /><stop offset="100%" stopColor="#1565C0" /></linearGradient>
      </defs>
      <path d="M6 12h10a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 6.5 3.5 3.5 0 0 0 6 12z" fill={`url(#${uid}-fzCloudGrad)`} />
      <g stroke={`url(#${uid}-fzDropGrad)`} strokeLinecap="round">
        {!reduced && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0 1.4; 0 0" dur="1.5s" repeatCount="indefinite" />}
        <path d="M8 14.5l-1 3" strokeWidth="1.5" />
        <path d="M16 14.5l-1 3" strokeWidth="1.5" />
      </g>
      {/* Ice crystal accent — distinguishes freezing precip from plain rain. */}
      <g stroke="#B3E5FC" strokeWidth="1" strokeLinecap="round">
        <path d="M12 15v4M10.2 16l3.6 2M13.8 16l-3.6 2" />
      </g>
    </IconSvg>
  );
}

export function SnowIcon({ className, decorative = true, label, isDay = true }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const [ca, cb] = isDay ? ["#CFD8DC", "#90A4AE"] : NIGHT_CLOUD;
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs><linearGradient id={`${uid}-snCloudGrad`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={ca} /><stop offset="100%" stopColor={cb} /></linearGradient></defs>
      <path d="M6 12h10a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 6.5 3.5 3.5 0 0 0 6 12z" fill={`url(#${uid}-snCloudGrad)`} />
      <g fill="#90CAF9" stroke="#64B5F6" strokeWidth="0.3">
        {!reduced && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0 1.2; 0 0" dur="2.6s" repeatCount="indefinite" />}
        <circle cx="8" cy="15" r="1.2" /><circle cx="12" cy="16.5" r="1" /><circle cx="15" cy="14.5" r="1.1" />
        <circle cx="10" cy="19" r="0.9" /><circle cx="14" cy="19.5" r="1" />
      </g>
    </IconSvg>
  );
}

export function ThunderstormIcon({ className, decorative = true, label, isDay = true }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  const [ca, cb] = isDay ? ["#546E7A", "#263238"] : NIGHT_CLOUD;
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs>
        <linearGradient id={`${uid}-tsCloudGrad`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={ca} /><stop offset="100%" stopColor={cb} /></linearGradient>
        <linearGradient id={`${uid}-tsBoltGrad`} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#FFD600" /><stop offset="100%" stopColor="#FF8F00" /></linearGradient>
      </defs>
      <path d="M5 11h11a3.5 3.5 0 0 0 0-7h-.3A5 5 0 0 0 5.5 5.5 3.5 3.5 0 0 0 5 11z" fill={`url(#${uid}-tsCloudGrad)`} />
      <path d="M11 12l-2 4h3l-1.5 5 4-5.5h-3l2-3.5h-2.5z" fill={`url(#${uid}-tsBoltGrad)`}>
        {!reduced && <animate attributeName="opacity" values="1; 0.35; 1; 1" dur="2.4s" repeatCount="indefinite" />}
      </path>
      <path d="M7 14l-0.5 2" stroke="#42A5F5" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      <path d="M16 13l-0.5 2" stroke="#42A5F5" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
    </IconSvg>
  );
}

export function ClearNightIcon({ className, decorative = true, label }: IconProps) {
  const uid = useGradientId();
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs><linearGradient id={`${uid}-moonGrad`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FDD835" /><stop offset="100%" stopColor="#F9A825" /></linearGradient></defs>
      <path d="M12 3a7 7 0 0 0 0 14 7 7 0 0 1 0-14z" fill={`url(#${uid}-moonGrad)`} transform="translate(1, 2)" />
      <circle cx="18" cy="5" r="1" fill="#FDD835" opacity="0.9" />
      <circle cx="20" cy="9" r="0.7" fill="#FDD835" opacity="0.7" />
      <circle cx="15" cy="3" r="0.6" fill="#FDD835" opacity="0.6" />
    </IconSvg>
  );
}

export function PartlyCloudyNightIcon({ className, decorative = true, label }: IconProps) {
  const uid = useGradientId();
  const reduced = usePrefersReducedMotion();
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs>
        <linearGradient id={`${uid}-pcnMoonGrad`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FDD835" /><stop offset="100%" stopColor="#F9A825" /></linearGradient>
        <linearGradient id={`${uid}-pcnCloudGrad`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#B0BEC5" /><stop offset="100%" stopColor="#78909C" /></linearGradient>
      </defs>
      <path d="M9 2a5 5 0 0 0 0 10 5 5 0 0 1 0-10z" fill={`url(#${uid}-pcnMoonGrad)`} transform="translate(1, 1)" />
      <circle cx="16" cy="4" r="0.8" fill="#FDD835" opacity="0.8" />
      <g>
        {!reduced && <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0; 0.8 0; 0 0" dur="7s" repeatCount="indefinite" />}
        <path d="M8 19a4 4 0 0 1 .6-7.9 5.5 5.5 0 0 1 10.3 1.4A3.5 3.5 0 0 1 19 19H8z" fill={`url(#${uid}-pcnCloudGrad)`} />
      </g>
    </IconSvg>
  );
}
