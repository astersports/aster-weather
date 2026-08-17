# CLAUDE.md — aster-weather (`@aster/weather`)

> **RULES only.** Compressed 2026-08-18 from 171 lines against
> [the doc doctrine](https://github.com/astersports/aster-io/blob/main/docs/DOC_DOCTRINE.md);
> **nothing deleted.** This is a public package, so [`README.md`](README.md) **is** the
> reference and the facts live there — consumers, the resilience chain, the Sky system, the
> versioning plan. This file is only what an agent must not get wrong.
> **Canonical estate truth:** `astersports/aster-io` → [`WHAT_IS_BUILT.md`](https://github.com/astersports/aster-io/blob/main/docs/WHAT_IS_BUILT.md).
> Read it before claiming what any Aster product is or does; this file governs *this library only*.

**This is a SHARED library.** A change here lands in every consumer at their next re-pin — four
repos re-pin, not one. That is why the bar is higher than in an app repo, and why the release is
gated.

`@aster/weather` **v0.6.0** — a framework-agnostic Open-Meteo core (pure TypeScript, no React)
plus a React SVG weather-icon system on the `/icons` subpath.

## 1. ⚠ Never claim what this package does not contain

**The four-rung fetch ladder and the `observed | forecast | cached` provenance are NOT here.**
They live in `st-patricks-armonk/server/weather/` and are **pending upstream**. This package has
**no NWS fallback, no persisted cross-process cache, no radar rung, and no `readingKind` field** —
grep for `readingKind`, `provenance`, `rung` or `NWS` and you get nothing.

Anyone documenting or marketing this library must not claim them. What it *does* have is the
six-step resilience chain in `src/cache.ts` — [`README.md`](README.md#the-resilience-chain-srccachets).

## 2. The five disciplines that are not negotiable

1. **Measurements are `number | null`, and a missing value is NEVER fabricated as `0`.** Every
   measurement field (`temperature`, `precipitationProbability`, `windSpeed`, `windGusts`, …) is
   nullable. `null` means Open-Meteo reported nothing for that slot. Warning flags treat `null`
   as unknown and do not fire. **Consumers render `—`, not `0`.**
2. **Timestamps are absolute epoch-ms.** Every request carries `&timeformat=unixtime`, so hour
   matching is pure epoch arithmetic and there is **no host-timezone drift**.
3. **Every fetch takes `opts.fetchImpl`** — the SSRF boundary. The default path uses global
   `fetch` against a fixed Open-Meteo host with numeric, bounds-checked coordinates; a server
   behind an egress policy should still inject its own.
4. **Every fetch takes `opts.onError`**, firing **exactly once** per ultimately-failed fetch —
   after the retry, immediately before the stale/empty fallback. It is the single channel that
   makes an Open-Meteo outage visible.
5. **The engine never throws.** A failure becomes stale-or-empty. That is a contract, not an
   implementation detail: **consumers do not wrap these calls in try/catch.**

## 3. ⚠ Licensing — Open-Meteo is CC-BY 4.0 and requires VISIBLE ATTRIBUTION

Every consumer that renders data from this package must render a visible, linked credit —
"Weather data by Open-Meteo" (https://open-meteo.com/). It is a **licence condition**, not
decoration, and **removing it is a licensing regression, not a design choice.**

**An earlier doc's claim that Open-Meteo's free tier is "non-commercial only" was wrong and is
withdrawn** (recorded in `st-patricks-armonk/docs/WEATHER_TRUTH_PLAN.md` and
`docs/HANDOFF_2026-08-11.md`). **Do not reintroduce it.**

This package is headless and cannot render the credit itself. That obligation is the consumer's,
and it is worth restating in any consumer-facing doc.

## 4. Distribution and versioning rules

- **Pin a tag. Never a branch, never a bare SHA.**
- **`dist/` is committed.** Change `src/` → run `pnpm build` and **commit `dist/` in the same
  commit**, or consumers install stale bytes from the tag.
- **SemVer here:** major = shape/icon-key/behaviour break · minor = additive · patch =
  behaviour-preserving fix. On 0.x an icon-surface break ships as a minor (v0.6.0 did) — **say
  "breaking" anyway when describing it.**
- **`v0.7.0` is reserved** for the breaking nullable-`weatherCode` release (CR-1), closing the
  `?? 0` fabrication seam. R-2 split: icons = v0.6.0, engine = v0.7.0. **The ladder + provenance
  upstreaming must therefore take a later number — do not claim v0.7.0 for it.**
- **Read a consumer's pin from its own `origin/main`**, not from a table. As verified 2026-08-18,
  all four consumers are on `#v0.6.0`, and **`aster-studio` does not consume this package at
  all**.

## 5. Icon-surface rules

- **No pixel sizes, ever.** `viewBox 0 0 64 64`, `width/height: 100%`, `xMidYMid meet` — the
  container decides scale. A surface that cannot give ~32px should render text instead.
- **The panel is never lighter than `SKY_FLOOR = #2E5A8C`** — the measured floor where the white
  cloud (7.1:1), gold sun (4.7:1) and **raindrop (3.29:1, the binding constraint)** all clear
  WCAG 1.4.11's 3:1. One palette, no light/dark fork; the panel travels with the component.
- **`prefers-reduced-motion` always resolves to static** — `usePrefersReducedMotion` returns
  `true` during SSR and on first client render, so reduced-motion users and server output get
  zero animation nodes.
- **Bare icons are gone.** `ColorfulWeatherIcon` and the individual `*Icon` exports were removed
  in v0.6.0; use `<WeatherIcon>` inside `<SkyPanel>`. On a light card they measured 1.03–1.47:1,
  which is the defect that release fixes.

## 6. Working here

- Branch, PR into `main`, keep `main` green. CI runs `tsc --noEmit` + `vitest`.
- **A minor/major tag is held** until `[release-approved]` is in the merge commit
  (`.github/workflows/auto-tag.yml`) — deliberately, so a design- or shape-carrying release
  cannot ship by merely merging.
- `scripts/dependency-gate.mjs` fails any PR with a major bump or a money/child/auth-adjacent
  dependency change; release is by the owner-only `dep-review-approved` label.
- When a consumer bumps its pin, that is a reviewed PR **in the consumer repo**.

| | |
|---|---|
| **Canonical estate truth** · cross-repo state | `aster-io` → `docs/WHAT_IS_BUILT.md` · `docs/ESTATE_STATE.md` |
| Package scope, consumers, cache chain, icons, versioning | [`README.md`](README.md) |
| The upstreaming plan (four repos) | `st-patricks-armonk/docs/WEATHER_TRUTH_PLAN.md` |
