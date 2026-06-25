/**
 * Daytime weather icons — Sun, partly cloudy, overcast, fog, drizzle, rain.
 */

interface IconProps { className?: string; }

export function SunnyIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="sunGrad" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#FFD700" /><stop offset="100%" stopColor="#FF8C00" /></radialGradient>
        <linearGradient id="rayGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FFD700" /><stop offset="100%" stopColor="#FFA500" /></linearGradient>
      </defs>
      <circle cx="12" cy="12" r="5" fill="url(#sunGrad)" />
      <g fill="url(#rayGrad)">
        <rect x="11" y="1.5" width="2" height="3.5" rx="1" /><rect x="11" y="19" width="2" height="3.5" rx="1" />
        <rect x="19" y="11" width="3.5" height="2" rx="1" /><rect x="1.5" y="11" width="3.5" height="2" rx="1" />
        <rect x="17.5" y="4" width="2" height="3.5" rx="1" transform="rotate(45 18.5 5.75)" />
        <rect x="4.5" y="16.5" width="2" height="3.5" rx="1" transform="rotate(45 5.5 18.25)" />
        <rect x="17.5" y="16.5" width="2" height="3.5" rx="1" transform="rotate(-45 18.5 18.25)" />
        <rect x="4.5" y="4" width="2" height="3.5" rx="1" transform="rotate(-45 5.5 5.75)" />
      </g>
    </svg>
  );
}

export function PartlyCloudyIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="pcSunGrad" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#FFD700" /><stop offset="100%" stopColor="#FF8C00" /></radialGradient>
        <linearGradient id="pcCloudGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#E8EDF2" /><stop offset="100%" stopColor="#B0BEC5" /></linearGradient>
      </defs>
      <circle cx="10" cy="8" r="4" fill="url(#pcSunGrad)" />
      <g fill="#FFA500" opacity="0.7"><rect x="9.2" y="2" width="1.5" height="2.5" rx="0.75" /><rect x="14.5" y="6.5" width="2.5" height="1.5" rx="0.75" /><rect x="4" y="6.5" width="2.5" height="1.5" rx="0.75" /></g>
      <path d="M7 19a4 4 0 0 1 .6-7.9 5.5 5.5 0 0 1 10.3 1.4A3.5 3.5 0 0 1 18 19H7z" fill="url(#pcCloudGrad)" />
    </svg>
  );
}

export function OvercastIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ovCloudGrad1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#CFD8DC" /><stop offset="100%" stopColor="#90A4AE" /></linearGradient>
        <linearGradient id="ovCloudGrad2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#B0BEC5" /><stop offset="100%" stopColor="#78909C" /></linearGradient>
      </defs>
      <path d="M6 15h10a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 9.5 3.5 3.5 0 0 0 6 15z" fill="url(#ovCloudGrad1)" />
      <path d="M9 20h9a3 3 0 0 0 0-6h-.2A4 4 0 0 0 9.5 15 3 3 0 0 0 9 20z" fill="url(#ovCloudGrad2)" />
    </svg>
  );
}

export function FogIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="fogGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#B0BEC5" /><stop offset="100%" stopColor="#CFD8DC" /></linearGradient></defs>
      <path d="M5 12h10a3 3 0 0 0 0-6h-.2A4 4 0 0 0 5.5 7.5 3 3 0 0 0 5 12z" fill="url(#fogGrad)" />
      <rect x="4" y="14" width="16" height="1.5" rx="0.75" fill="#B0BEC5" opacity="0.8" />
      <rect x="6" y="17" width="12" height="1.5" rx="0.75" fill="#CFD8DC" opacity="0.6" />
      <rect x="5" y="20" width="14" height="1.5" rx="0.75" fill="#B0BEC5" opacity="0.4" />
    </svg>
  );
}

export function DrizzleIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="drCloudGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#B0BEC5" /><stop offset="100%" stopColor="#78909C" /></linearGradient>
        <linearGradient id="drDropGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#64B5F6" /><stop offset="100%" stopColor="#1E88E5" /></linearGradient>
      </defs>
      <path d="M6 13h10a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 7.5 3.5 3.5 0 0 0 6 13z" fill="url(#drCloudGrad)" />
      <circle cx="8" cy="16" r="0.8" fill="url(#drDropGrad)" /><circle cx="12" cy="17" r="0.8" fill="url(#drDropGrad)" />
      <circle cx="10" cy="19" r="0.8" fill="url(#drDropGrad)" /><circle cx="14" cy="15.5" r="0.8" fill="url(#drDropGrad)" />
    </svg>
  );
}

export function RainIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="rnCloudGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#90A4AE" /><stop offset="100%" stopColor="#546E7A" /></linearGradient>
        <linearGradient id="rnDropGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#42A5F5" /><stop offset="100%" stopColor="#1565C0" /></linearGradient>
      </defs>
      <path d="M6 12h10a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 6.5 3.5 3.5 0 0 0 6 12z" fill="url(#rnCloudGrad)" />
      <path d="M8 14.5l-1 3.5" stroke="url(#rnDropGrad)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 14.5l-1 3.5" stroke="url(#rnDropGrad)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 14.5l-1 3.5" stroke="url(#rnDropGrad)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 17.5l-1 3" stroke="url(#rnDropGrad)" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      <path d="M14 17.5l-1 3" stroke="url(#rnDropGrad)" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}
