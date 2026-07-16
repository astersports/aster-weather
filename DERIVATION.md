# Derivation — how `@aster/weather` was built

`@aster/weather` is the shared weather core for the Aster Sports family. It was
**not** copied from one app. The canonical *shape* is the St. Patrick engine;
genuine improvements from the newer aster-sports build were merged in. This doc
records the three-way diff and every merge decision, so reviewers can see what
came from where and why.

## Sources

| Source | What it contributed | Files of record |
|---|---|---|
| **St. Patrick** (`st-patricks-armonk`) | The canonical shape: modular engine (`types`/`helpers`/`forecast`/`current`/`daily`), the rich WMO code → `{description, svg-icon-key}` map, and the colorful SVG icon set. | `server/weather/*`, `client/src/components/weather-icons/*` |
| **aster-sports** (the app) | The newer, battle-tested improvements: the `unixtime` time-matching fix, per-coordinate cache keys, org-agnostic coordinate resolution, the pure forecast-window / precip-parse helpers, and the single-source WMO maps. | `src/lib/weather/{coordsForEvent,forecastWindow,parsePrecip,wmo}.js`, `src/hooks/useWeather.js`, `src/lib/engine/resolvers/tournamentWeather.js` |
| **astersports-web PR #106** | (Not a merge input — the first *consumer*.) Confirmed two small hardening choices worth adopting: `isValidCoord` and an injectable SSRF-safe fetch. | `server/weather.ts` |

## The four functions the brief named — diff & decision

### `coordsForEvent` / `weatherLocationFrom`
- **St. Patrick:** none — coordinates were the hardcoded module constants
  `ARMONK_LAT` / `ARMONK_LON`, baked into every call.
- **aster-sports:** pure resolver — pick the first event-location carrying
  lat/lon, else an org default (closes the hardcoded-Westchester default, AP #7).
- **Decision: MERGE aster-sports.** A shared package cannot hardcode one
  parish's coordinates. `weatherLocationFrom` + `coordsForEvent` are brought in
  verbatim in behavior, de-coupled from app constants (the org default is now a
  required argument, not an import). → `src/coordsForEvent.ts`

### `forecastWindow` (`isWithinForecastWindow`)
- **St. Patrick:** inline `daysAway > 7` checks scattered in `getWeatherForEvent`.
- **aster-sports:** one pure predicate, unit-tested.
- **Decision: MERGE aster-sports** as the public predicate; the engine keeps its
  own internal 7-day horizon guard for the hourly endpoint. → `src/forecastWindow.ts`

### `parsePrecip`
- **St. Patrick:** none.
- **aster-sports:** pure parser of `"55% storms"` → `{ pct, kind }`, never
  fabricates.
- **Decision: MERGE aster-sports** verbatim. → `src/parsePrecip.ts`

### `wmo`
- **St. Patrick:** the **richer** map — `code → {description, icon}` where `icon`
  is a string key driving the SVG dispatcher; covers the freezing / light- /
  heavy- variants (56, 57, 66, 67, 77, 85, 86).
- **aster-sports:** emoji map + short labels + `rainWord()` for text/email.
- **Decision: MERGE BOTH into one module.** St. Patrick's string-icon map is
  canonical (`WMO_CODES` / `getWeatherInfo`, drives the SVGs); aster-sports'
  `WMO_EMOJI` / `WMO_LABELS` / `rainWord` ride along for non-SVG surfaces. This
  collapses the byte-for-byte duplication the app flagged as AP #42. → `src/wmo.ts`

## The two improvements that matter most (not in the four-function list)

### 1. Absolute time matching — `&timeformat=unixtime`  *(the important one)*
St. Patrick's `forecast.ts` computed `timestamp: new Date(time).getTime()` over
Open-Meteo's **timezone-naive** local strings (`"2026-06-12T14:00"`). `new Date()`
parses those in the **host** timezone, so every hour match was off by the host's
UTC offset — the exact bug aster-sports fixed in DL-13 by requesting
`&timeformat=unixtime` (absolute epoch seconds) and matching with pure epoch
arithmetic.

**Decision: MERGE the fix into the canonical engine.** `fetchForecast` now
requests `unixtime`; `HourlyForecast.timestamp` is absolute epoch-ms. To keep the
St. Patrick Morning/Afternoon/Evening strip labels venue-correct (we no longer
have the local string), we capture `utc_offset_seconds` from the response and
derive the venue-local hour from it. → `src/forecast.ts`

### 2. Per-coordinate cache key
St. Patrick used a single module-global cache — correct for one fixed location,
**wrong** for a multi-venue / multi-org package (venue A's forecast would render
at venue B within the TTL). aster-sports' Beta B4 fix keys the cache by rounded
lat/lon.

**Decision: MERGE.** All three caches (hourly/current/daily) are keyed by
`coordKey(lat, lon)` (3-decimal rounding, ~110 m) with per-key in-flight dedup
(St. Patrick's cache-stampede guard, preserved). → `src/{forecast,current,daily}.ts`

## Adopted from PR #106 (the consumer) — minor hardening
- **`isValidCoord`** bounds-check before any fetch. → `src/helpers.ts`
- **Injectable fetch** (`FetchOptions.fetchImpl`): lets a consumer pass an
  SSRF-safe boundary (astersports-web `safeFetch`) and lets tests stub the
  network. Generalizes aster-sports' "pure resolver with injected IO" pattern
  (AP #27) to the whole engine. → `src/types.ts`, `src/helpers.ts`

## Deliberately left in the app, NOT extracted
- **`useWeather` React hook** (sessionStorage/localStorage cache, sign-out cache
  buster): app-specific. The package ships the framework-agnostic `fetchForecast`
  + `getWeatherForTime`; consumers wrap them in their own hook.
- **`tournamentWeather` daily-strip composer** and the **parish event
  classifiers** (`isOutdoorEvent`/`getParkingAdvisory` — parish keywords like
  "procession", "midnight mass"): domain-specific to each app. The package gives
  them the primitives (`getDailyForecast`, `rainWord`, `getWeatherForEvent`) to
  build on.
- **`WeatherBadge` / token classes:** presentational (Tailwind, `@/` imports).
  Only the SVG icons are framework-shared.

## What v0.1.0 does NOT change
Per the build brief: the **app's** weather (aster-sports) and St. Patrick's
weather are **not** modified by this package's creation. They converge onto
`@aster/weather` in their own later passes. The first and only consumer wired in
this pass is astersports-web PR #106's AAU card (a separate stacked PR).

## Consumer map (updated 2026-07-16, WX-P3-14)
The "later passes" above have partly happened; the actual state:
- **st-patricks-armonk** — DEEP consumer. `server/weather/{forecast,current,daily,helpers}.ts`
  are thin adapters over the package; client icons come from `@aster/weather/icons`.
- **aster-studio** — narrow consumer: imports only `isValidCoord`.
- **aster-io** — declares the dependency but imports nothing yet (to be wired).
- **aster-sports** — not yet a consumer; still on its own `src/lib/weather/` copy.

See `docs/WEATHER_L99_AUDIT_2026-07-16.md` §4 for the per-consumer blast radius.
