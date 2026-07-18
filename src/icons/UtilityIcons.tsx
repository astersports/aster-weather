/**
 * Utility icons — wind + droplet. Not routed by the weather dispatcher; a
 * severe-wind or humidity surface imports them directly.
 *
 * Constellation line: wind in navy (day cloud tone), droplet in accent gold to
 * match the precip family. Default size normalized to w-4 h-4 via IconSvg.
 */

import { IconSvg, useGradientId, DAY_CLOUD, GOLD, GOLD_HI, type IconProps } from "./iconBase.js";

export function WindIcon({ className, decorative = true, label }: IconProps) {
  const uid = useGradientId();
  const [a, b] = DAY_CLOUD;
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs><linearGradient id={`${uid}-wind`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={b} /><stop offset="100%" stopColor={a} /></linearGradient></defs>
      <path d="M3 8h10a2 2 0 1 0-2-2" stroke={`url(#${uid}-wind)`} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 12h14a2.5 2.5 0 1 1-2.5 2.5" stroke={`url(#${uid}-wind)`} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 16h7a2 2 0 1 1-2 2" stroke={`url(#${uid}-wind)`} strokeWidth="1.8" strokeLinecap="round" />
    </IconSvg>
  );
}

export function DropletIcon({ className, decorative = true, label }: IconProps) {
  const uid = useGradientId();
  return (
    <IconSvg className={className} decorative={decorative} label={label}>
      <defs><linearGradient id={`${uid}-drop`} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor={GOLD_HI} /><stop offset="100%" stopColor={GOLD} /></linearGradient></defs>
      <path d="M12 2.5c0 0-6 7.5-6 12a6 6 0 0 0 12 0c0-4.5-6-12-6-12z" fill={`url(#${uid}-drop)`} />
    </IconSvg>
  );
}
