# Changelog

All notable changes to `@aster/weather`. This package is consumed across the
Aster fleet off a **git tag** — pin `github:astersports/aster-weather#vX.Y.Z`,
never a branch or a bare SHA, so every consumer resolves deterministically.

SemVer: **major** = shape / icon-key / behavior break (coordinate a consumer
bump); **minor** = additive; **patch** = behavior-preserving fix.

## 0.9.0 — 2026-11-27

**Additive.** Alert lists now say when they were fetched and whether they are stale, and a clock that steps back no longer keeps a cached reading fresh. The only runtime change in `dist/` is those two fixes; dev dependencies are updated.

### Added
- **`getAlertsReading(coords, opts)`** returns `AlertsReading | null`: `alerts`, `fetchedAt` (epoch ms, when the list was fetched) and `stale` (`true` when a refresh failed and this is the earlier list, still inside `ALERT_MAX_STALE_MS`). `null` means outside coverage, or the alerts request failed with no list young enough to serve.
- **`AlertsReading`**, the type of that result.
- **`WeatherReport.alertsReading: AlertsReading | null`**, beside `alerts`, which keeps its shape. `getAlerts` keeps its shape too, and its `onError` label is still `getAlerts`.

### Fixed
- **B-018:** a list served after a failed refresh is no longer indistinguishable from a fresh one; read `stale` from `getAlertsReading` or `WeatherReport.alertsReading`.
- **B-017:** a cached reading whose fetch time is ahead of the clock is never fresh. Readings that carry a `stale` flag (the NWS readings and alert lists) are fetched again after a clock step back, and if that fetch fails they are served only as `stale: true`. An unflagged cache read (the Open-Meteo fetchers, and the NWS point and station lookups) no longer treats such an entry as fresh: it loads again, or, where stale-while-revalidate is on, serves the entry and refreshes it in the background. A failed load there returns the old value with no `stale` flag.

### Security (dev dependencies)
- `happy-dom` ^21.0.4, `vitest` ^5.1.2, and `vite` held at ^8.3.3 through `pnpm.overrides` (resolves to 8.4.0). This closes nine Dependabot alerts. They are dev dependencies only; the package has no runtime dependencies, and `dist/` does not change because of them.

### Not in this release
- Icons for the newer conditions and measurement glyphs (`v0.10.0`).
- Page parts (`v0.11.0`).
- UV index, outlooks, heat stress and air quality (`v0.12.0`).
- These were `v0.9.0`, `v0.10.0` and `v0.11.0` in the `0.8.0` entry below; the owner renumbered them on 2026-11-27, so alert freshness, the clock-step fix and the dependency security work could ship first.

## 0.8.0 — 2026-11-27

**Additive, with one type-level change that can break a build** (`WeatherCall`, below). This release adds the NWS and NOAA engine: official US weather, with a stamp on every station
reading and forecast. The Open-Meteo fetchers are deprecated, and they keep their behaviour.

### Added
- **Engine functions:** `getWeather` (every part in one report), `getNow`, `getHourly`, `getDaily`,
  `getAlerts`, `getRadarRain`, `getSun`, `getMoon`, `getEventWeather`, and `clearWeatherCaches` to
  clear every engine cache and hold.
- **Provenance:** station readings, forecasts and the event reading carry a `Stamp` (`kind`, `at`, `fetchedAt`, `stale`,
  `source`). The age bounds and retry waits are exported as constants: `MAX_AGE_MS`, `FRESH_MS`,
  `MAX_OBSERVATION_AGE_MS`, `ALERT_MAX_STALE_MS`, `MAX_FRAME_AGE_MS`, `RADAR_TIMEOUT_MS`,
  `RADAR_RETRY_AFTER_MS`, `GRID_RETRY_AFTER_MS`, `SUN_REFRESH_AFTER_MS` and `POINT_RETRY_AFTER_MS`.
- **Options:** `userAgent`, `store`, `now` and `radar` on the engine, with `fetchImpl`, `timeoutMs`
  and `onError` as before.
- **Store:** the `WeatherStore` interface, for last-good readings a consumer keeps between loads.
- **Conditions:** `conditionFromNwsIcon`, `conditionLabel`, `isPrecipitation` and `NWS_ICON_CONDITION`.
  The `Condition` type has 25 values.
- **Types:** `WeatherReport`, `NowReading`, `HourlyResult`, `HourReading`, `AmountBlock`,
  `DailyResult`, `DayReading`, `WeatherAlert`, `RadarRain`, `RadarFrame`, `EchoIntensity`,
  `SunTimes`, `MoonPhase`, `EventReading`, `ReadingKind`, `Stamp`, `EngineOptions`, `NwsIconReading`.

### Changed
- A throwing `onError` hook no longer rejects a fetch, and a rejecting one no longer causes an
  unhandled rejection. This holds for every fetcher, old or new. (Backlog B-001.)
- **`FetchImpl`'s `init` argument can now carry `headers`** (`init?: { signal?; headers? }`). The NWS and
  NOAA engine sends `Accept: application/geo+json` on every request, and a `User-Agent` when you set
  `userAgent`. The Open-Meteo fetchers send no headers.

### Deprecated
- `fetchForecast`, `getCurrentWeather`, `getDailyForecast`, `getNowcast` and `getWeatherForEvent`.
  Use `getHourly`, `getNow`, `getDaily`, `getRadarRain` and `getEventWeather`. `getRadarRain` does not
  replace `getNowcast` like for like. They are removed in `v1.0.0`, after the consumers move.

### Can break a build
- **`WeatherCall` gained nine labels since `v0.7.0`:** `getPoint`, `getHourly`, `getGrid`, `getDaily`,
  `getNow`, `getAlerts`, `getRadarRain`, `getStations` and `getLatestObservation`. An exhaustive
  `switch` over `WeatherCall` needs a case for each.

### Not in this release
- Page parts (`v0.10.0`), icons for the newer conditions and measurement glyphs (`v0.9.0`).
- UV index, outlooks and air quality (`v0.11.0`).

### Known limits
- Radar from a browser is unverified: whether NOAA's service answers a browser's cross-origin request
  has not been checked.
- NWS rate limits are not disclosed.
- B-014 (accepted): a station observation that fails once is not asked again within the same load.
- B-017 (open): if the clock steps back, a cache entry can stay fresh past its limit.
- B-018 (open): an alert list carries no fetch time, so a list served after a failed refresh is not marked stale.

## 0.7.0 — 2026-11-27

**Breaking** (shipped as a 0.x minor). A missing weather code is now unknown,
never clear sky.

### Breaking
- **`weatherCode`, `icon` and `description` are `null` when Open-Meteo reports no
  usable code.** This covers a missing, `null` or non-numeric code. Before, these
  fell back to `0` and "Clear sky". A real `0` from Open-Meteo is unchanged: it is
  still `0`, `"clear"` and "Clear sky".
- **A number that is not a WMO code keeps its number** (`weatherCode: 4`), with
  `icon: null` and `description: null`. It is no longer given a made-up icon.
- Affects `HourlyForecast`, `CurrentWeather`, `DailyForecast`, `EventWeather` and
  the `EventWeather.forecastStrip` entries.

### Added
- **`weatherInfoOrNull(code: number | null | undefined)`** (exported from the
  package root). Returns the WMO entry, or `null` for a missing or non-WMO code.
  `getWeatherInfo` is unchanged.

### Migration
- Guard on `icon !== null` before rendering `<WeatherIcon>` or `<SkyPanel>`.
- Render `—` for a `null` `description`, never "Clear sky".
- Treat a `null` `weatherCode` as unknown. Do not compare it with `0`.

## 0.6.0 — 2026-07-18

**The "Sky" icon system.** A full replacement of the React SVG weather icons:
weather now renders inside a **panel of sky** tinted to the condition, and the
icon is glossy + dimensional (volumetric clouds, corona sun, crescent moon with
stars, teardrops with a specular hit, six-fold crystals, a bolt with a glow
bloom). **Breaking** on the `/icons` surface → **minor** (0.x). The pure engine
is untouched. Direction + spec ratified by the owner; art ported from the
approved `aster-weather-sky.html` reference.

### Breaking (icons only)
- **Removed `ColorfulWeatherIcon` and the individual `*Icon` exports.** Migrate to
  `<WeatherIcon condition isDay />` rendered **inside** `<SkyPanel condition isDay>`.
  Bare icons on a light card scored 1.03–1.47:1 contrast — effectively invisible;
  the sky panel is what fixes that (below).
- **Motion is ON by default** (R-1, supersedes the v0.3.0 static-default + opt-in
  `animate`). Pass `animate={false}` for a static frame; `prefers-reduced-motion`
  always resolves to static.

### The contrast rule (measured, non-negotiable)
- **Weather renders only on a sky surface at or darker than `#2E5A8C`** — the
  floor where the white cloud (7.1:1), gold sun (4.7:1) and raindrop (3.29:1, the
  binding constraint) all clear WCAG 1.4.11's 3:1. The `<SkyPanel>` carries the
  tint with the component, so a cream page and a navy app get identical,
  guaranteed contrast from one palette — no theme fork.

### Added
- **`<WeatherIcon condition isDay animate title />`** — fills its container (no
  pixel size; `viewBox 0 0 64 64` + `xMidYMid meet`). Decorative by default;
  `title` exposes `role="img"` + `<title>`.
- **`<SkyPanel condition isDay animate>`** — the tinted surface; `thunderstorm` +
  `heavy-rain` carry a `#CFE2FF` flash pulsing in step with the bolt.
- **17-condition vocabulary** (the 14 WMO keys + `clear-night` /
  `partly-cloudy-night` / `snow-night`) — nothing collapses to a smaller glyph
  set. `SkyCondition` type, `SKY_TINTS`, `SKY_CONDITIONS`, `SKY_FLOOR`,
  `skyConditionFor`, `skyGradient`, `WEATHER_ART`, and the injected-motion
  `ensureSkyStyles` / `SKY_KEYFRAMES` are exported.
- `WindIcon` / `DropletIcon` retained (metric glyphs, not part of the Sky system).

### Kept
- `WeatherIconKey` union, the WMO↔routed-key parity test (WX-P2-22), per-instance
  gradient/filter ids (`useId`, WX-P3-9), and `usePrefersReducedMotion`.

## 0.5.2 — 2026-07-18

Correctness fix, no API / shape / type change → **patch**. Consumers inherit it
silently on bump; no consumer code moves.

### Fixed
- **`rainWord()` now classifies WMO 85/86 (snow showers) as `"snow"`, not
  `"rain"`.** The precipitation-noun helper returned `"snow"` only for the
  contiguous 71–77 band (snowfall + snow grains) and let everything else fall
  through to `"rain"`. But snow appears in a SECOND, non-contiguous WMO band —
  85 (light snow showers) / 86 (heavy snow showers) — which sits just above the
  rain-showers band (80–82), so it was silently mislabeled. `WMO_CODES` already
  icons 85/86 as `light-snow` / `heavy-snow`, so the text noun contradicted the
  icon on the same reading (e.g. a snow-shower daily strip read `"60% rain"`
  beside a snow glyph). The return type (`"storms" | "snow" | "rain"`) and the
  signature are unchanged — only the branch coverage widened, so this is a pure
  behavior-correctness patch. New `pure.test.ts` assertions lock 85/86 → `snow`
  and 81 → `rain` (the rain-shower band just below stays rain).

## 0.5.1 — 2026-07-17

Behavior-preserving fixes (no API or shape change → **patch**). Cut ahead of the
fleet convergence so every consumer inherits both silently on bump.

### Fixed
- **WX-R2 — the `res.json()` body read now runs INSIDE the fetch timeout/abort
  budget.** `fetchWithTimeout` (v0.2.0 / WX-P2-16) armed the abort+race for the
  *headers* read, but the *body* read (`res.json()`) then ran in the loader with
  the timer already cleared — so a server that sent headers then stalled the body
  hung `json()` forever, and because the loader runs inside `WeatherCache`'s
  in-flight dedup, every concurrent caller for that coordinate hung with it (the
  M5 retry never fired; the attempt never rejected). The fetch, HTTP-ok check, and
  JSON parse are now centralized in one internal `fetchJsonWithTimeout` that races
  the WHOLE chain against a single deadline, so the total budget stays
  `<= timeoutMs` on both the well-behaved-impl path (abort frees the socket, on
  headers OR body) and the misbehaving-impl path (the race rejects regardless).
  New `resilience.test.ts` case: a stalled body (headers OK, `json()` never
  resolves) settles by `timeoutMs` → `[]` and fires `onError` exactly once. The
  changed surface (`fetchWithTimeout` → `fetchJsonWithTimeout`) is internal /
  un-exported (WX-P2-13) — no public API or shape moves.

### Changed (log hygiene)
- **WX-R4 — removed the unconditional `console.error` from all four loaders.**
  `onError` (v0.5.0 / M1) is the failure channel; the raw `console.error` lines
  gave consumers double signal and could not be silenced. Deleted (the HTTP/parse
  ones were subsumed by the WX-R2 centralization; the shape-guard ones removed
  outright). Zero change to the never-throw return contract.

### Docs
- README + CHANGELOG install pin bumped to `#v0.5.1`. Retired the stale
  "pin `v0.2.0`" advice in the historical 0.1.0 entry below — it predated the
  full tag ladder; the current floor is `#v0.5.1`.

## 0.5.0 — 2026-07-16

Observability core (Wave B, roadmap `docs/WEATHER_E2E_EFFICIENCY_AND_ENHANCEMENTS_2026-07-16.md`).
The engine converted every fetch failure to `[]`/`null`/stale before any consumer
regained control — there was no way for an operator to know Open-Meteo was failing
for a venue. This release adds the failure channel plus two resilience behaviors.
**Additive API** (new optional `onError`; new exported types/constants); one
**behavior change** (SWR) that keeps the same shapes — see below.

### Added
- **`FetchOptions.onError?(err, ctx)`** (M1) — the keystone. Fires **once** per
  fetch that ultimately fails (after the retry), immediately before the engine
  falls back to stale-or-empty. `ctx` is `{ call, lat, lon }` so a consumer can
  tag the failure by loader + venue and route it into Sentry/PostHog. The engine
  still **never throws**; an omitted hook is zero behavior change.
- **`WeatherCall`** + **`WeatherErrorContext`** exported types; **`CacheBehavior`**
  exported (the per-cache resilience profile).
- **`FETCH_RETRY_COUNT`** (1) + **`FETCH_RETRY_BACKOFF_MS`** (500) constants.

### Behavior
- **Bounded retry (M5):** each loader now retries **once** with a 500 ms backoff
  before falling through to stale-or-empty — a single transient blip no longer
  serves stale for the whole TTL window. A retry-then-fail emits **one** `onError`
  signal, never one per attempt. Each attempt keeps its own timeout budget.
- **Stale-while-revalidate (M6):** when an **expired-but-present** entry exists,
  it is now returned **immediately** while a background refresh runs (deduped),
  so no interactive caller blocks on a cold fetch once a key is warm. Same return
  shapes; the only observable change is timing (the first post-expiry caller gets
  the last-known-good instantly instead of blocking for a fresh fetch, and sees
  the fresh value on the next call). Cold misses still block (there is nothing to
  serve). A failed background refresh keeps the stale value **and** fires `onError`.

### Tests
- `observability.test.ts`: onError once-on-final-failure + never-on-success,
  retry fail-once-then-succeed (no signal) vs retry-then-fail (one signal), SWR
  stale-serve + background refresh + background-failure onError, and a
  `fetchForecast` integration asserting the `{ call, lat, lon }` context. 66 passing.

## 0.4.0 — 2026-07-16

Realtime enrichments (the deferred Wave 3 items) so aster-studio can converge
off its own Open-Meteo client with **zero field loss**. **Additive /
non-breaking** — new nullable fields only.

### Added
- **`CurrentWeather.windDirection`** (degrees) + **`CurrentWeather.precipitation`**
  (inches, now) — WX-P3-3.
- **`DailyForecast.windSpeedMax`** (mph) + **`DailyForecast.uvIndexMax`** — WX-P3-5 / WX-P3-4.
- Requests `wind_direction_10m` + `precipitation` (current) and
  `wind_speed_10m_max` + `uv_index_max` (daily) on the same Open-Meteo calls.

All new fields are `number | null` (honest — never fabricated). Tests cover the
new fields; consumers already on v0.2.0/v0.3.0 are unaffected.

## 0.3.0 — 2026-07-16

L99 audit Wave 2 — the icon "superior visual experience" pass. **Additive /
non-breaking** over 0.2.0 (no shape changes; new optional props + one new icon).

### Added
- **Subtle motion** on the SVG icons — sun-ray rotation, falling rain/drizzle/
  snow, cloud drift, thunderstorm-bolt flash — all **gated behind
  `prefers-reduced-motion`** and SSR-safe (reduced-motion users, servers, and
  tests get the static art with zero animation nodes) (WX-P2-9).
- **Accessibility props** on every icon + the dispatcher: `label?` +
  `decorative?` (default decorative → `aria-hidden`). `decorative={false}`
  exposes `role="img"` + `aria-label` + `<title>`; the dispatcher defaults the
  label from the WMO description (WX-P2-8).
- **Night variants** for overcast/fog/drizzle/rain/heavy-rain/snow/thunderstorm
  via a shared darker night cloud palette (was day-only) (WX-P2-11).
- **`FreezingRainIcon`** + `"freezing-rain"` icon key; WMO 56/57/66/67 now route
  to it instead of collapsing into plain rain (WX-P2-10).
- `usePrefersReducedMotion` hook + `IconProps` type + `ROUTED_ICON_KEYS`
  exported for consumers.

### Fixed
- **Per-instance gradient IDs** via `useId()` — repeating an icon on a page no
  longer emits duplicate DOM ids (WX-P3-9).
- Neutral (overcast) fallback for an unknown icon key, not a misleading Sunny
  (WX-P3-10); `DropletIcon` default size normalized to `w-4 h-4`, `WindIcon`
  given the shared gradient treatment (WX-P3-12); fog/overcast contrast raised
  for light backgrounds (WX-P2-12).

### Tests
- happy-dom render env; every WMO icon key rendered day+night, WMO↔dispatcher
  parity invariant (WX-P2-22), gradient-id uniqueness, and a11y attributes
  (WX-P2-19). 59 passing.

## 0.2.0 — 2026-07-16

The L99 audit pass (`docs/WEATHER_L99_AUDIT_2026-07-16.md`). Realtime signal
set + correctness + pipeline hardening.

### Breaking
- **Measurement fields are now `number | null`** (`HourlyForecast`,
  `EventWeather`, `CurrentWeather`, `DailyForecast`). A missing Open-Meteo
  reading is `null` ("unknown"), never a fabricated `0` (WX-P1-1). Consumers
  rendering these must handle `null` (show "—", not `0`). Warning flags treat
  `null` as unknown and do not fire off a missing value.
- **`coordsForEvent` returns `Coords` `{lat, lon}`** (was a `[lat, lon]` tuple)
  and its `orgDefault` param is now `Coords` — so it feeds `fetchForecast`
  directly (WX-P2-14).
- **Removed internal helpers from the public API:** `coordKey`,
  `fetchWithTimeout` (WX-P2-13). They were never part of the documented surface.

### Added
- **`getNowcast(coords, opts?)`** — 15-minute precipitation + gust nowcast from
  Open-Meteo `minutely_15` (WX-P2-3). The freshest "will it rain during the
  game?" signal.
- **`windGusts`** on hourly / event / current (WX-P2-4) — the severe-weather
  flag now fires on gusts > 45 mph, not just sustained wind.
- **`observedAt`** (epoch ms) on `CurrentWeather` (WX-P2-5) — data-age for a
  realtime UI.
- **`WeatherIconKey`** exported string-literal union; every `icon` field is now
  typed with it so a future key rename is a compile error, not a silent
  fallback (WX-P2-15).
- `past_days=1` on the hourly request so a just-finished event resolves
  (WX-P2-1); forecast horizon raised to 14 days to cover the surface window
  (WX-P2-2).
- `SEVERE_WIND_MPH` / `SEVERE_GUST_MPH` constants.

### Fixed
- **No fabricated `0`** across all fetch modules (WX-P1-1 / AP #27, #36).
- **Bounded LRU cache** — the per-coordinate caches no longer grow without
  bound; extracted to one shared `WeatherCache` (WX-P2-7, pattern ε).
- **Injected `fetchImpl` is aborted on timeout** via an `AbortSignal` — no more
  leaked socket per timed-out call; still can't hang the caller (WX-P2-16).
- **City heuristic** resolves "City, State" to the city, not the state
  (WX-P2-6); empty address segments fall through to the venue name.
- `getWeatherForEvent` now applies the `isValidCoord` guard (WX-P3-7);
  `parseOpenMeteoLocalTime` no longer renders "NaN" for a minute-less time
  (WX-P3-6).

### Pipeline / supply-chain
- CI now rebuilds `dist/` and fails if the committed output drifts from `src`
  (WX-P1-2).
- `dependency-gate` auth matcher broadened (`@auth/*`, `auth0`, `@clerk`,
  `lucia`, openid) (WX-P2-17) and fails **closed** on an unparseable version
  change (WX-P3-17).

### Tests
- Locked stale-cache-on-error, TTL expiry, in-flight dedup, timeout/abort,
  venue-local strip labels (DL-13), null-not-fabricated, and nowcast (WX-P1-5,
  WX-P2-20/21/23/24, WX-P2-3).

## 0.1.0 — 2026-06 (scaffold tag)

Initial shared extraction — Open-Meteo core + WMO map + colorful SVG icons.
See `DERIVATION.md`. (Note: the `v0.1.0` tag sits on the scaffold commit,
predating the polish arc; new consumers pin the current release (`#v0.5.1`), never
the scaffold `v0.1.0`.)
