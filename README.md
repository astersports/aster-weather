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
    "@aster/weather": "github:astersports/aster-weather#v0.5.2"
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
  getNowcast,           // (coords, opts?) => NowcastPoint[]  (15-min precip nowcast, 10-min cache)
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

### Measurement fields are `number | null`
Since v0.2.0, every measurement (`temperature`, `precipitationProbability`,
`windSpeed`, `windGusts`, …) is `number | null`. `null` means Open-Meteo did not
report a value for that slot — it is **never** fabricated as `0`. Warning flags
(`isRainWarning` / `isSevereWarning`) treat `null` as "unknown" and do not fire
off a missing reading. Render `null` as "—" / "N/A", not `0`.

### Injectable fetch (SSRF boundary / tests)
Every fetch fn takes `opts.fetchImpl`. Server consumers with an SSRF guard pass
it through; tests stub the network:

```ts
await fetchForecast(coords, { fetchImpl: safeFetch }); // astersports-web
```

> **SSRF note:** the DEFAULT path (no `fetchImpl`) uses the global `fetch` with
> **no SSRF guard**. That is safe here because every request targets a fixed
> constant Open-Meteo host with only numeric, bounds-checked lat/lon via
> `URLSearchParams` — there is no attacker-controlled destination. Even so, a
> server consumer behind an egress policy SHOULD pass its own `opts.fetchImpl`
> boundary. On timeout the injected impl receives an `AbortSignal` and is
> aborted (v0.2.0), so a slow upstream can't leak a socket.

### Observability + resilience (v0.5.0)

The engine never throws — a failed fetch becomes `[]`/`null`/stale. To make an
Open-Meteo outage *visible*, pass `onError`; it fires **once** per fetch that
ultimately fails (after the built-in retry), tagged with the call + venue:

```ts
await fetchForecast(coords, {
  fetchImpl: safeFetch,
  onError: (err, ctx) => reportError(err, { surface: "weather", ...ctx }),
  //                            ctx = { call: "fetchForecast", lat, lon }
});
```

An omitted hook is zero behavior change. Two resilience behaviors are always on:

- **Retry:** one retry with a 500 ms backoff before falling back to stale-or-empty
  (`FETCH_RETRY_COUNT` / `FETCH_RETRY_BACKOFF_MS`). A retry-then-fail emits one
  `onError`, not one per attempt.
- **Stale-while-revalidate:** an expired-but-cached value is returned immediately
  while a background refresh runs (deduped), so no interactive caller blocks on a
  cold fetch once a key is warm. Cold misses still block. A failed background
  refresh keeps the stale value and fires `onError`.

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
