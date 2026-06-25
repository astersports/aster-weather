/**
 * Night, severe weather, and utility icons — heavy rain, snow, thunderstorm, wind, night variants, droplet.
 */

interface IconProps { className?: string; }

export function HeavyRainIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hrCloudGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#607D8B" /><stop offset="100%" stopColor="#37474F" /></linearGradient>
        <linearGradient id="hrDropGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#2196F3" /><stop offset="100%" stopColor="#0D47A1" /></linearGradient>
      </defs>
      <path d="M5 11h11a3.5 3.5 0 0 0 0-7h-.3A5 5 0 0 0 5.5 5.5 3.5 3.5 0 0 0 5 11z" fill="url(#hrCloudGrad)" />
      <path d="M7 13l-1.5 4.5" stroke="url(#hrDropGrad)" strokeWidth="2" strokeLinecap="round" />
      <path d="M11 13l-1.5 4.5" stroke="url(#hrDropGrad)" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 13l-1.5 4.5" stroke="url(#hrDropGrad)" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 17l-1.5 4" stroke="url(#hrDropGrad)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13 17l-1.5 4" stroke="url(#hrDropGrad)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SnowIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="snCloudGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#CFD8DC" /><stop offset="100%" stopColor="#90A4AE" /></linearGradient></defs>
      <path d="M6 12h10a3.5 3.5 0 0 0 0-7h-.3A4.5 4.5 0 0 0 6.5 6.5 3.5 3.5 0 0 0 6 12z" fill="url(#snCloudGrad)" />
      <g fill="#90CAF9" stroke="#64B5F6" strokeWidth="0.3">
        <circle cx="8" cy="15" r="1.2" /><circle cx="12" cy="16.5" r="1" /><circle cx="15" cy="14.5" r="1.1" />
        <circle cx="10" cy="19" r="0.9" /><circle cx="14" cy="19.5" r="1" />
      </g>
    </svg>
  );
}

export function ThunderstormIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tsCloudGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#546E7A" /><stop offset="100%" stopColor="#263238" /></linearGradient>
        <linearGradient id="tsBoltGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#FFD600" /><stop offset="100%" stopColor="#FF8F00" /></linearGradient>
      </defs>
      <path d="M5 11h11a3.5 3.5 0 0 0 0-7h-.3A5 5 0 0 0 5.5 5.5 3.5 3.5 0 0 0 5 11z" fill="url(#tsCloudGrad)" />
      <path d="M11 12l-2 4h3l-1.5 5 4-5.5h-3l2-3.5h-2.5z" fill="url(#tsBoltGrad)" />
      <path d="M7 14l-0.5 2" stroke="#42A5F5" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      <path d="M16 13l-0.5 2" stroke="#42A5F5" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export function WindIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 8h10a2 2 0 1 0-2-2" stroke="#78909C" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 12h14a2.5 2.5 0 1 1-2.5 2.5" stroke="#546E7A" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 16h7a2 2 0 1 1-2 2" stroke="#90A4AE" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ClearNightIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="moonGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FDD835" /><stop offset="100%" stopColor="#F9A825" /></linearGradient></defs>
      <path d="M12 3a7 7 0 0 0 0 14 7 7 0 0 1 0-14z" fill="url(#moonGrad)" transform="translate(1, 2)" />
      <circle cx="18" cy="5" r="1" fill="#FDD835" opacity="0.9" />
      <circle cx="20" cy="9" r="0.7" fill="#FDD835" opacity="0.7" />
      <circle cx="15" cy="3" r="0.6" fill="#FDD835" opacity="0.6" />
    </svg>
  );
}

export function PartlyCloudyNightIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="pcnMoonGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FDD835" /><stop offset="100%" stopColor="#F9A825" /></linearGradient>
        <linearGradient id="pcnCloudGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#E8EDF2" /><stop offset="100%" stopColor="#B0BEC5" /></linearGradient>
      </defs>
      <path d="M9 2a5 5 0 0 0 0 10 5 5 0 0 1 0-10z" fill="url(#pcnMoonGrad)" transform="translate(1, 1)" />
      <circle cx="16" cy="4" r="0.8" fill="#FDD835" opacity="0.8" />
      <path d="M8 19a4 4 0 0 1 .6-7.9 5.5 5.5 0 0 1 10.3 1.4A3.5 3.5 0 0 1 19 19H8z" fill="url(#pcnCloudGrad)" />
    </svg>
  );
}

export function DropletIcon({ className = "w-3 h-3" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="dropGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#64B5F6" /><stop offset="100%" stopColor="#1565C0" /></linearGradient></defs>
      <path d="M12 2.5c0 0-6 7.5-6 12a6 6 0 0 0 12 0c0-4.5-6-12-6-12z" fill="url(#dropGrad)" />
    </svg>
  );
}
