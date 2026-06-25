# @aster/weather

Framework-agnostic weather core (Open-Meteo) + React SVG weather icons for the
Aster Sports family of apps. The canonical engine was extracted from St. Patrick
and merged with the aster-sports build's improvements — see
[DERIVATION.md](./DERIVATION.md) for the full diff and merge rationale.

## Install

Consumed as a git dependency off a release tag (no registry needed; `dist/` is
committed):

```jsonc
// package.json
{
  "dependencies": {
    "@aster/weather": "github:astersports/aster-weather#v0.1.0"
  }
}
```

## Core (`@aster/weather`) — pure, no React

```ts
import {
  fetchForecast,        // (coords, opts?) => HourlyForecast[]  (60-min per-coord cache)
  getWeatherForTime,    // (hours, isoTime, windowMs?) => HourlyForecast | null  (pure)
  getWeatherForEvent,   // (coords, eventISO, opts?) => EventWeather | null
  getCurrentWeather,    // (coords, opts?) => CurrentWeather | null  (15-min cache)
  getDailyForecast,     // (coords, opts?) => DailyForecast[]  (60-min cache)
  coordsForEvent,       // (events, locations, orgDefault) => [lat, lon]
  weatherLocationFrom,  // (events, locations) => { lat, lon, city } | null
  isWithinForecastWindow,
  parsePrecip,
  getWeatherInfo, WMO_CODES, WMO_EMOJI, WMO_LABELS, rainWord, emojiForCode,
} from "@aster/weather";

const hours = await fetchForecast({ lat: 41.13, lon: -73.72 });
const atKickoff = getWeatherForTime(hours, "2026-06-26T18:00:00-04:00");
```

### Time is absolute (epoch ms)
`HourlyForecast.timestamp` is absolute epoch-ms (Open-Meteo `&timeformat=unixtime`).
Hour matching is pure epoch arithmetic — no host-timezone drift. Pass an absolute
ISO string (with offset or `Z`) to the matchers.

### Injectable fetch (SSRF boundary / tests)
Every fetch fn takes `opts.fetchImpl`. Server consumers with an SSRF guard pass
it through; tests stub the network:

```ts
await fetchForecast(coords, { fetchImpl: safeFetch }); // astersports-web
```

## Icons (`@aster/weather/icons`) — React

```tsx
import { ColorfulWeatherIcon } from "@aster/weather/icons";
import { getWeatherInfo } from "@aster/weather";

<ColorfulWeatherIcon icon={getWeatherInfo(code).icon} isDay className="w-5 h-5" />
```

`react` is an optional peer dependency — only needed if you import `/icons`.

## Scripts

```bash
pnpm build   # tsc -> dist/ (committed)
pnpm check   # typecheck only
pnpm test    # vitest
```
