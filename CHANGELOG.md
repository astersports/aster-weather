# Changelog

All notable changes to `@aster/weather`. This package is consumed across the
Aster fleet off a **git tag** — pin `github:astersports/aster-weather#vX.Y.Z`,
never a branch or a bare SHA, so every consumer resolves deterministically.

SemVer: **major** = shape / icon-key / behavior break (coordinate a consumer
bump); **minor** = additive; **patch** = behavior-preserving fix.

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
predating the polish arc; new consumers should pin `v0.2.0`.)
