# CLAUDE.md — aster-weather (`@aster/weather`)

## The estate this belongs to

**Aster Sports** is a creative company focused on **AAU basketball** whose platform is
**not limited to it** — the St. Patrick parish build is the proof, and it is the single
largest consumer of this package.

**Canonical estate truth lives in the `astersports.io` repo → `docs/WHAT_IS_BUILT.md`.**
Read it before making a claim about what any Aster product is or does. This file is
grounding for *this library only*.

**This is a SHARED library.** A change here lands in every consumer at their next re-pin.
That is why the bar is higher than it would be in an app repo, and why the release is
gated (`.github/workflows/auto-tag.yml` holds a minor/major tag until the merge commit
carries `[release-approved]`).

---

## What this package is

`@aster/weather` **v0.6.0** — a framework-agnostic Open-Meteo core (pure TypeScript, no
React) plus a React SVG weather-icon system on the `/icons` subpath.

- Distributed as a **git-tag dependency**, not a registry package:
  `"@aster/weather": "github:astersports/aster-weather#v0.6.0"`.
- **`dist/` is committed** — consumers install from the tag with no build step. If you
  change `src/`, run `pnpm build` and commit `dist/` in the same commit, or consumers get
  stale bytes.
- Pin a **tag**. Never a branch, never a bare SHA.

## Consumers (verified 2026-08-17)

Four repos depend on it, and **all four are pinned to `#v0.6.0`**:

| Repo | Pin | Source files importing it |
|---|---|---|
| `st-patricks-armonk` | `#v0.6.0` | 13 |
| `aster-sports` | `#v0.6.0` | 11 |
| `nova-select` | `#v0.6.0` | 7 |
| `aster-io` | `#v0.6.0` | 3 |

**`aster-studio` does NOT consume it.** It has no `@aster/weather` entry in `package.json`;
the only hits in that repo are historical planning documents.

> Counts are files under version control that reference `@aster/weather`, excluding
> `node_modules`, `dist/`, `.claude/worktrees/`, `graphify-out/`, and vendored copies.
> An earlier circulating figure of **59 / 12 / 7 / 2** does not reproduce against the
> working trees by any counting rule tried — the load-bearing, reproducible fact is the
> **pin**, which is identical across all four.

---

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

### What the package DOES have: the resilience chain in `src/cache.ts`

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

---

## The five disciplines that are not negotiable

1. **Measurements are `number | null`, and a missing value is NEVER fabricated as `0`.**
   Every measurement field (`temperature`, `precipitationProbability`, `windSpeed`,
   `windGusts`, …) is nullable. `null` means Open-Meteo reported nothing for that slot.
   Warning flags treat `null` as unknown and do not fire. Consumers render `—`, not `0`.
2. **Timestamps are absolute epoch-ms.** Every request carries `&timeformat=unixtime`, so
   hour matching is pure epoch arithmetic and there is **no host-timezone drift**.
3. **Every fetch takes `opts.fetchImpl`** — the SSRF boundary. The default path uses global
   `fetch` against a fixed Open-Meteo host with numeric, bounds-checked coordinates; a
   server behind an egress policy should still inject its own.
4. **Every fetch takes `opts.onError`**, which fires **exactly once** per ultimately-failed
   fetch — after the retry, immediately before the stale/empty fallback. It is the single
   channel that makes an Open-Meteo outage visible.
5. **The engine never throws.** A failure becomes stale-or-empty. That is a contract, not
   an implementation detail: consumers do not wrap these calls in try/catch.

---

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

---

## ⚠ Licensing: Open-Meteo is CC-BY 4.0 and requires VISIBLE ATTRIBUTION

Every consumer that renders data from this package must render a visible, linked credit —
"Weather data by Open-Meteo" (https://open-meteo.com/). It is a **licence condition**, not
decoration, and removing it is a licensing regression rather than a design choice.

**An earlier doc's claim that Open-Meteo's free tier is "non-commercial only" was wrong and
is withdrawn** (recorded in `st-patricks-armonk/docs/WEATHER_TRUTH_PLAN.md` and
`docs/HANDOFF_2026-08-11.md`). Do not reintroduce it.

This package is headless and cannot render the credit itself. That obligation is the
consumer's, and it is worth restating in any consumer-facing doc.

---

## Versioning — `v0.7.0` is already reserved

SemVer here: **major** = shape/icon-key/behaviour break · **minor** = additive · **patch** =
behaviour-preserving fix. On 0.x, an icon-surface break ships as a minor (v0.6.0 did).

**`v0.7.0` is reserved for the breaking nullable-`weatherCode` release (CR-1)** — closing
the `?? 0` fabrication seam. There is an explicit **R-2 split: icons = v0.6.0, engine =
v0.7.0**. See `aster-sports/docs/WEATHER_CONFORMANCE_CONTRACT_2026-07-18.txt` and
`st-patricks-armonk/docs/WEATHER_TRUTH_PLAN.md`.

**Therefore the ladder + provenance upstreaming must take a later number than v0.7.0.**
Do not claim v0.7.0 for it.

---

## Working here

- Branch, PR into `main`, keep `main` green. CI runs `tsc --noEmit` + `vitest`.
- Rebuild `dist/` in the same commit as any `src/` change.
- A minor/major tag is **held** until `[release-approved]` is in the merge commit —
  deliberately, so a design- or shape-carrying release cannot ship by merely merging.
- `scripts/dependency-gate.mjs` fails any PR with a major bump or a money/child/auth-
  adjacent dependency change; release is by the owner-only `dep-review-approved` label.
- When a consumer bumps its pin, that is a reviewed PR in the consumer repo. Four repos
  re-pin, not one.
