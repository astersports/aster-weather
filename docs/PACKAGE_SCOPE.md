# What `@aster/weather` is, what it is not, and who consumes it

**Moved out of `CLAUDE.md` on 2026-08-18** under [the doc doctrine](https://github.com/astersports/aster-io/blob/main/docs/DOC_DOCTRINE.md).
Nothing was deleted. Consumer pins re-verified against each repo's `origin/main` on 2026-08-18.

## What this package is

`@aster/weather` **v0.6.0** — a framework-agnostic Open-Meteo core (pure TypeScript, no
React) plus a React SVG weather-icon system on the `/icons` subpath.

- Distributed as a **git-tag dependency**, not a registry package:
  `"@aster/weather": "github:astersports/aster-weather#v0.6.0"`.
- **`dist/` is committed** — consumers install from the tag with no build step. If you
  change `src/`, run `pnpm build` and commit `dist/` in the same commit, or consumers get
  stale bytes.
- Pin a **tag**. Never a branch, never a bare SHA.

## Consumers — verified against `origin/main`, 2026-08-18

Four repos depend on it, and **all four are pinned to `#v0.6.0`**:

| Repo | Pin | Source files importing it |
|---|---|---|
| `st-patricks-armonk` | `#v0.6.0` | 13 |
| `aster-sports` | `#v0.6.0` | 11 |
| `nova-select` | `#v0.6.0` | 7 |
| `aster-io` | `#v0.6.0` | 3 |

**`aster-studio` does NOT consume it.** Confirmed again 2026-08-18: no `@aster/weather` entry
in its `package.json`; the only hits in that repo are historical planning documents.

> Counts are files under version control that reference `@aster/weather`, excluding
> `node_modules`, `dist/`, `.claude/worktrees/`, `graphify-out/`, and vendored copies.
> An earlier circulating figure of **59 / 12 / 7 / 2** does not reproduce against the
> working trees by any counting rule tried — the load-bearing, reproducible fact is the
> **pin**, which is identical across all four.

## ⚠ What this package does NOT contain

**The four-rung fetch ladder and the `observed | forecast | cached` provenance are NOT in
this package.** They live in **`st-patricks-armonk/server/weather/`** and are **pending
upstream**:

- `server/weather/types.ts:80` — `readingKind: "observed" | "forecast" | "cached"`
- `server/weather/daily.ts:6` — *"engine → persisted reading (≤24h) → NWS fallback → nothing"*
- `server/weather/forecast.ts:23` — *"engine → persisted (≤12h) → NWS → nothing"*
- `server/weather/current.ts` / `radarNow.ts` — the NOAA radar rung, add-only
- `server/weather/radarNow.ts:11` — *"this into `@aster/weather` as the fact-level ladder's
  rain rung; when that lands, this file is absorbed by the package and deleted here"*

**Anyone documenting or marketing this library must not claim them.** `@aster/weather` has
no NWS fallback, no persisted cross-process cache, no radar rung, and no `readingKind`
field. Grep the package for `readingKind`, `provenance`, `rung` or `NWS` and you get
nothing.

## What the package DOES have: the resilience chain in `src/cache.ts`

`WeatherCache.get()` resolves in this order, and only this order:

1. **Fresh hit** — a value newer than the instance TTL short-circuits with no fetch.
2. **Stale-while-revalidate** — an expired-but-present entry is returned *immediately* and
   a background refresh runs, deduped via a separate `refreshing` set so it can never
   satisfy a cold caller.
3. **Cold fetch, in-flight deduped** — concurrent misses on the same key share one promise.
4. **One retry at 500 ms** — `FETCH_RETRY_COUNT = 1`, `FETCH_RETRY_BACKOFF_MS = 500`.
5. **Stale-on-error** — the last-known-good value, with its timestamp deliberately *not*
   refreshed, so the next call retries rather than serving stale for a whole TTL window.
6. **Typed empty** — `[]` / `null`, never a throw.

Also bounded: the store is an LRU capped at `maxEntries` (default 200), so a long-running
multi-venue server cannot grow a Map without bound.

TTLs: forecast 60 min · daily 60 min · current 15 min · nowcast 10 min.

## The Sky icon system (`/icons`, v0.6.0)

- **17 conditions** — the 14 `WeatherIconKey` WMO keys plus `clear-night`,
  `partly-cloudy-night`, `snow-night`, selected by `isDay`. Nothing collapses.
- **Contrast is guaranteed by construction.** The panel is never lighter than
  `SKY_FLOOR = #2E5A8C` — the measured floor where the white cloud (7.1:1), gold sun
  (4.7:1) and **raindrop (3.29:1, the binding constraint)** all clear WCAG 1.4.11's 3:1.
  One palette, no light/dark theme fork; the panel travels with the component.
- **No pixel sizes, ever.** `viewBox 0 0 64 64`, `width/height: 100%`, `xMidYMid meet` —
  the container decides scale. A surface that cannot give ~32px should render text.
- **`prefers-reduced-motion` always resolves to static.** `usePrefersReducedMotion` returns
  `true` during SSR and on first client render, so reduced-motion users and server output
  get zero animation nodes.
- **v0.6.0 is BREAKING on the icon surface.** `ColorfulWeatherIcon` and the individual
  `*Icon` exports were **removed**. Migrate to `<WeatherIcon>` inside `<SkyPanel>`. Bare
  icons on a light card measured 1.03–1.47:1 — that defect is what this release fixes.
  Say "breaking" when describing it; a 0.x minor does not make it non-breaking.

## Versioning — `v0.7.0` is already reserved

SemVer here: **major** = shape/icon-key/behaviour break · **minor** = additive · **patch** =
behaviour-preserving fix. On 0.x, an icon-surface break ships as a minor (v0.6.0 did).

**`v0.7.0` is reserved for the breaking nullable-`weatherCode` release (CR-1)** — closing
the `?? 0` fabrication seam. There is an explicit **R-2 split: icons = v0.6.0, engine =
v0.7.0**. See `aster-sports/docs/WEATHER_CONFORMANCE_CONTRACT_2026-07-18.txt` and
`st-patricks-armonk/docs/WEATHER_TRUTH_PLAN.md`.

**Therefore the ladder + provenance upstreaming must take a later number than v0.7.0.**
Do not claim v0.7.0 for it.
