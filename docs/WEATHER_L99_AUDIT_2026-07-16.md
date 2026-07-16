# @aster/weather — L99 Audit (2026-07-16)

> **Package:** `@aster/weather` — the shared, framework-agnostic weather engine for the Aster fleet (Open-Meteo fetch + cache, WMO code mapping, event-anchored enrichment, and a colorful SVG icon set).
> **Method:** L99 §16.15 — file-by-file line-level read of `src/` + `dist/` + CI + consumer grep, deep-read addendum, anti-pattern cross-reference (§11), per-consumer blast-radius, explicit out-of-scope, sequenced roadmap.
> **Scope of ground truth:** the `aster-weather` repo at HEAD (`34dfa62`), plus consumer specs in `st-patricks-armonk`, `aster-studio`, `aster-io`, `aster-sports`. Every finding below was independently verified against file:line; one candidate was **REJECTED** (see §5).
> **Findings:** 48 confirmed (5 P1 · 25 P2 · 18 P3) after merging 7 cross-dimension duplicates. 2 verdicts are PLAUSIBLE (noted inline); the rest are CONFIRMED.

---

## 1. Executive summary

`@aster/weather` is a **small, well-structured, genuinely useful** shared library. Its core forecast/current/daily fetch paths are correct on the common case, it deliberately degrades to stale-or-empty (never throws), and it already encodes real discipline the fleet cares about — a venue-local time-labeling fix (DL-13), a documented "never fabricate" contract in `parsePrecip`, an injected-fetch SSRF seam, and a bespoke supply-chain version-jump gate. It is **not broken in production today**: the sole deep consumer (`st-patricks-armonk`) pins a commit SHA that already carries the polish + security commits, and no consumer exercises the specific edge paths that fail.

**Overall health verdict: B− / "solid core, unguarded seams."** There are no P0s. But the package has a cluster of **latent, invisible-until-they-bite** hazards that are exactly the class a *shared* dependency must not carry: a data-fabrication contract violation, an un-enforced CI/release pipeline that lets fixes silently fail to reach consumers, a supply-chain gate that only *reports*, and a nearly-untested resilience/icon surface. It also under-delivers on the operator's four explicit asks — the "realtime" story is hourly-only with no nowcast, no gusts, no "as-of" timestamp; the icons are static and inaccessible.

### The four operator asks, scored

| Ask | Verdict | The gap |
|---|---|---|
| **(a) Updated info + realtime URL logic** | **Partial** | URLs fetch hourly/current/daily correctly, but request **no `minutely_15` nowcast** (WX-P2-3), **no `wind_gusts_10m`** (WX-P2-4), **no `past_days`** so past-event recaps silently die (WX-P2-1), and **no observation timestamp** so "realtime" can't show freshness (WX-P2-5). Horizon is self-capped at 7 days against a 10-day window (WX-P2-2). |
| **(b) Latest-and-greatest / performance** | **Partial** | Open-Meteo supports 16-day horizon + free daily enrichment left on the table (WX-P2-2, WX-P3-5). Caches are unbounded (WX-P2-7); no stale-while-revalidate (WX-P3-1) or retry (WX-P3-2); the three fetch modules are near-identical triplicated code (see §3). |
| **(c) Superior visual effects / experience** | **Weak** | Icons are **entirely static — zero motion** (WX-P2-9) despite this being the headline ask; **no a11y** (WX-P2-8); night coverage is half-finished (WX-P2-11); freezing-rain/hail/sleet collapse into plain rain (WX-P2-10); fog/overcast wash out on light backgrounds (WX-P2-12). |
| **(d) Shared best-in-class robustness** | **At risk** | The **data-fabrication `?? 0` defect** (WX-P1-1) violates the package's own contract; **CI never rebuilds `dist`** so a src fix can ship stale bytes (WX-P1-2); **no release discipline** means fixes rot on `main` (WX-P1-3); the **supply-chain gate is report-only** (WX-P1-4); the **stale-cache reliability guarantee is untested** (WX-P1-5). |

### The 3–5 highest-leverage moves

1. **Kill the `?? 0` fabrication (WX-P1-1).** Map missing Open-Meteo readings to `null`, not `0`, and treat `null` as "unknown" in the rain/severe warning logic. This is the one finding that ships *wrong* families-facing data ("0% chance of rain" / "severe cold 0°F") identically to every consumer — a direct violation of AP #27/#36. *Breaking* (type change); needs a coordinated bump.
2. **Make the pipeline enforce itself (WX-P1-2 + WX-P1-4 + WX-P1-3).** Add one CI step — `pnpm build && git diff --exit-code dist/` — so `dist` can never drift from `src`; mark `dependency-gate` a **required** branch-protection check so the supply-chain gate actually gates; and stand up a real SemVer/CHANGELOG release flow so merged fixes reach consumers. These three are cheap (S/S/M) and close the whole "the repo looks fixed but production runs old code" failure class (AP #64/#66).
3. **Ship the realtime signal set (WX-P2-1..5).** Add `minutely_15` precip nowcast, `wind_gusts_10m`, `past_days:"1"`, `current.time`, and raise the horizon to match the window. This is the single biggest jump toward the operator's "best-in-class realtime" ask, all on the *same* Open-Meteo endpoint at ~zero marginal cost.
4. **Give the icons motion + a11y + per-instance IDs (WX-P2-8/9 + WX-P3-9).** Inline SMIL/CSS animation gated behind `prefers-reduced-motion`, `role`/`aria-hidden`/`<title>` semantics, and `useId()` gradient IDs — the "superior visual experience" ask, fixed once for all four builds.
5. **Cover the resilience + icon test holes (WX-P1-5 + WX-P2-19..25).** Stand up a jsdom/`renderToStaticMarkup` env and lock the stale-cache fallback, TTL expiry, inflight dedup, timeout, and venue-local label math — so the reliability guarantees the package advertises can't silently regress.

---

## 2. Findings by severity

> IDs are stable (`WX-<sev>-<n>`). "Blast radius" = which of the 4 consumers a fix touches (see §4 for the map). Merged findings note the sources folded in. All verdicts CONFIRMED unless marked PLAUSIBLE.

### P1 — must fix before the package is trusted as a shared dependency

#### WX-P1-1 — Missing Open-Meteo readings are silently fabricated as `0`, violating the package's own "never fabricate" contract
- **File:** `src/forecast.ts:122-126`, `:249-252`; `src/daily.ts:95-97`; `src/current.ts:90-97`; types `src/types.ts:50,61`
- **Merged from:** the P1 precip-fabrication finding + the P2 temp/wind-fabrication finding + the P2 "`null→0` untested/undocumented" testing finding (one root defect, three faces).
- **Evidence:** `precipitationProbability: h.precipitation_probability?.[i] ?? 0` and `precipitation: … ?? 0` (forecast.ts:122-123) collapse a value the authors **explicitly typed `(number | null)[]`** (forecast.ts:77-78) into a real-looking `0`. Same pattern for daily `precipProbabilityMax` (daily.ts:97) and for `temperature`/`apparentTemperature`/`windSpeed`/`humidity` (forecast.ts:120-126, current.ts:90-97). Downstream types are bare `number`, so "no rain / clear" is indistinguishable from "unknown." A fabricated `0°F` also crosses `isSevereWarning` (`temperature < 20`, forecast.ts:250) → a false "severe cold" banner; a fabricated `0` windSpeed suppresses the real `windSpeed > 40` check. The package's own `parsePrecip` carries a "never fabricate" comment and is **tested** to return `null` on bad input (pure.test.ts:63-67) — it fabricates in exactly the place it swore not to. No test feeds a null/short precip array.
- **Why it matters (blast radius):** the shared engine ships a families-facing false "0% chance of rain" / "clear" badge and false severe-weather banners identically to **st-patricks-armonk** (deep) and any future consumer of `EventWeather`. This is the AP #36 "silent default swallows the unknown" + AP #27 "no fabrication" pattern, structural in the shared layer.
- **Recommendation:** type the fields `number | null`; map missing/`null`/out-of-bounds → `null`; treat `null` as "unknown" in `isRainWarning`/`isSevereWarning` (skip the comparison, don't compare-as-0). Add tests feeding null and short arrays asserting the value stays `null` and the warnings don't fire.
- **Effort:** M · **Breaking:** **Yes** (shape change on `EventWeather`/`DailyForecast`) · **Verdict:** CONFIRMED (frequency is model/region-dependent — the null path is not the common case, but when it fires it is wrong data on the exact surface that promises never to fabricate).

#### WX-P1-2 — CI never rebuilds/verifies the committed `dist/`, so a src-only merge ships stale compiled code to every consumer
- **File:** `.github/workflows/ci.yml:26-31` (runs only `check` + `test`); `.gitignore:6-8`; `package.json` main→`./dist/index.js`
- **Merged from:** the P1 perf-bundle "dist-freshness-unguarded" + the P2 api-safety "dist-parity-unguarded" (identical mechanism).
- **Evidence:** `dist/` is intentionally committed (documented in `.gitignore`) and consumed directly — there is **no** `prepare`/`postinstall` build hook, so consumers run the committed bytes. CI runs `pnpm run check` (tsc --noEmit) + `pnpm run test` (vitest), and the tests import `../index.js` → resolve to **`src/*.ts`**, so they exercise source, never `dist`. `grep -rn 'build|dist' .github/` → no match. `dist` byte-matches a fresh `pnpm build` **today** (verified `diff -rq` clean) — so this is latent, not active.
- **Why it matters (blast radius):** a contributor can fix a real weather bug in `src/`, watch CI go green, tag a release, and ship the **old** `dist` to all consumers — invisibly and identically. The very fixes this audit produces are the trigger scenario. AP #66 (a `dist` that asserts it equals `src` and doesn't).
- **Recommendation:** add a CI step `pnpm build && git diff --exit-code dist/` (fails if `dist` drifts). <30s; closes the hazard permanently.
- **Effort:** S · **Breaking:** No · **Verdict:** CONFIRMED.

#### WX-P1-3 — No release/versioning discipline: the `v0.1.0` tag sits on the pre-polish scaffold, no CHANGELOG, no release flow, and the breaking-change surface is unmanaged
- **File:** `package.json:3` (version frozen 0.1.0); `README.md:17` (install pin); `git tag` (only `v0.1.0`); `src/types.ts:58-103` (shape surface)
- **Merged from:** the P1 "release-discipline" + the P2 "unreleased-fixes-unreachable (tag on scaffold)" + the P3 PLAUSIBLE "breaking-change-surface unmanaged" (one release-hygiene cluster).
- **Evidence:** `git log -1 v0.1.0` → `5786e81 feat: scaffold …` — the tag is on the **raw scaffold**, *before* the PR #1 merge and 6 commits of polish + Dependabot/CodeQL security tooling (`v0.1.0..HEAD` = 6 commits). `README.md:17` tells consumers to install `#v0.1.0` (the scaffold). **`aster-io` and `aster-studio` both pin `#v0.1.0` → they build against pre-feature code** missing all 6 commits; `st-patricks-armonk` pins a bare SHA `d4db522` (1 behind HEAD, includes polish). There is no CHANGELOG, no release workflow (only `ci.yml` + `dep-review-label-guard.yml`), no `npm version` automation, and `package.json` version never moved. Fixing forward requires either force-moving the tag (rewrites history under consumers) or a new tag + manual 4-repo bumps with nothing tracking which repo is on which SHA. `.icon` is typed `string` and `CACHE_TTL_MS` are internal constants — the two genuinely *silent-on-bump* surfaces (WX-P2-15); shape/tuple changes are tsc-caught at the consumer.
- **Why it matters (blast radius):** any fix this audit lands reaches **zero** of the two tag-pinned consumers, and they are on *stale* code right now. No SemVer signal tells a consumer whether an update is a safe patch or a breaking shape change. AP #64/#66 invisible-artifact class, on the release surface.
- **Recommendation:** adopt SemVer (patch = behavior-preserving, minor = additive, major = shape/icon-id/TTL change); cut a fresh tag (v0.2.0 given src changes since scaffold) that points at a *polished, green* SHA; add `CHANGELOG.md`; fix the `README.md:17` pin; add a release checklist/GH Action that tags on version bump and opens consumer-bump PRs; track a compatibility matrix (which consumer is on which tag).
- **Effort:** M · **Breaking:** No (process) · **Verdict:** CONFIRMED (the cluster); the "unmanaged breaking surface" sub-facet is **PLAUSIBLE** (immutable pins + tsc catch most shape changes; only icon-string + TTL are truly silent).

#### WX-P1-4 — The supply-chain dependency gate is report-only: a flagged (major / money-auth) dependency PR still auto-merges unless an owner has separately marked the job a *required* status check
- **File:** `.github/workflows/ci.yml:41-42`; `scripts/dependency-gate.mjs:197`
- **Evidence:** `ci.yml:41-42` carries the verbatim owner note: *"to BLOCK merge, mark this a REQUIRED status check in branch protection — the job alone only reports."* `dependency-gate.mjs:197` does `process.exit(1)` to turn the check red, but **GitHub auto-merge only waits on REQUIRED checks**, and nothing in-repo can confer required status (branch protection is off-repo config; the sibling `dep-review-label-guard.yml` only polices label integrity). The consumer doctrine auto-merges on green (aster-sports §15). Whether the check is *actually* required on `main` could **not** be verified from the repo (off-repo state).
- **Why it matters (blast radius):** this is the one control between an auto-merge pipeline and a surprise major/money/child/auth-adjacent dependency landing in the package **four builds** consume off a git ref. If the check isn't required, the gate is decorative — `check-test` goes green, auto-merge fires, the red `dependency-gate` is ignored, and the entire label-integrity apparatus protects a gate that may not be gating. AP #68 (a control that exists and is OFF).
- **Recommendation:** mark `dependency-gate` a **required** status check on `main` in branch protection; **verify via the GitHub branch-protection API** (don't assume); document current required-check state in-repo (a workflow can't self-declare it) so an auditor can tell whether the gate is live.
- **Effort:** S · **Breaking:** No · **Verdict:** CONFIRMED (live severity collapses to near-zero *only if* an owner has already marked it required — the exact unverified step).

#### WX-P1-5 — The stale-cache-on-error fallback (the advertised reliability guarantee) is untested across all three fetch modules
- **File:** `src/current.ts:74,81,86,105`; `src/daily.ts:75,81,87,109`; `src/forecast.ts:103,110,115,137`; contract doc `forecast.ts:150`
- **Evidence:** on HTTP error / JSON-parse fail / bad shape / thrown fetch, every module returns `cached?.data ?? null` / `cached?.bundle ?? {…}` / `cached?.data ?? []` — serving last-known-good weather through a transient Open-Meteo outage. `fetchForecast`'s docstring (forecast.ts:150) documents this as an intended contract. **No test** seeds a good response, expires the TTL, issues a failing response, and asserts the *stale prior value* is returned; error-path tests only assert null/`[]` on a **cold** cache. A refactor returning null-on-error would pass CI and silently degrade every consumer's outage behavior.
- **Why it matters (blast radius):** a documented multi-consumer reliability guarantee with zero coverage on a shared package — materially risky under refactor. Reaches **st-patricks-armonk** (deep) directly.
- **Recommendation:** for each fetcher: seed cache with a 200 stub → **advance past `CACHE_TTL_MS`** (fake timers / `Date.now` mock — a fresh entry short-circuits at the TTL guard before fetch, so the naive "seed then fail" test false-passes) → call again with `{ok:false,status:500}` → assert the previously-cached value is returned. Repeat for the JSON-throw and bad-shape branches.
- **Effort:** S · **Breaking:** No · **Verdict:** CONFIRMED (borderline P1/P2 — a coverage gap, not a live defect; kept P1 for the untested-reliability-guarantee-in-a-shared-lib risk).

---

### P2 — should fix; real defects/gaps with bounded or contingent blast radius

#### Realtime / data-URL logic (operator ask a + b)

**WX-P2-1 — `getWeatherForEvent` admits events up to 1 day past (`daysAway < -1`) but no `past_days` is requested, so past-event recaps silently return null/wrong-value.**
`forecast.ts:210` guards `daysAway < -1` (admits ~24h past) but `buildUrl` (forecast.ts:44-69) sends `forecast_days=7` with **no `past_days`/`past_hours`** — the hourly series starts at today 00:00 venue-local. A yesterday-afternoon event passes the guard, then finds no hour within `MAX_FORECAST_HOUR_GAP_MS=6h` → null (or, for events within 6h of today-midnight, snaps to *wrong* today-00:00 data). The docstring (forecast.ts:197-200) advertises "up to 1 day past" support that is dead. **Fix:** add `past_days:"1"` to `buildUrl`, OR tighten the guard to `daysAway < 0` — the guard and the fetch window must agree. **Effort S · Breaking No · CONFIRMED.** Blast: recap surfaces (st-patricks event pages; any future aster-sports game recap).

**WX-P2-2 — Forecast horizon capped at `FORECAST_DAYS=7` while the surface window is `DEFAULT_FORECAST_WINDOW_DAYS=10`, creating a dead 7–10 day gap.**
`types.ts:11` (7) feeds `forecast_days` (forecast.ts:66, daily.ts:40); `types.ts:32` (10) gates `isWithinForecastWindow` (returns true up to 10 days, forecastWindow.ts:14-22) while `getWeatherForEvent` rejects `daysAway>7`. A consumer gets `isWithinForecastWindow → true` for an 8–10 day event, renders a slot, calls `getWeatherForEvent → null`. Open-Meteo supports `forecast_days` up to 16. **Fix:** raise `FORECAST_DAYS` to ≥10 (14 for headroom) OR lower the window to 7 — the two constants must agree. **Effort S · Breaking No · CONFIRMED** (the "blank slot" is contingent on consumer wiring; `forecastWindow.ts` header documents the divergence as a known note).

**WX-P2-3 — No 15-minute precipitation nowcast (`minutely_15`) — the highest-value realtime signal for outdoor events is absent from every URL.**
`buildUrl` (forecast.ts:48-57, current.ts:26-34) requests only hourly/current blocks; Open-Meteo exposes `minutely_15=precipitation,wind_gusts_10m` on the **same** `/v1/forecast` endpoint (no separate endpoint) — the exact "will it rain during the next 2 hours of the game" question. No type field carries it. **Fix:** add a `minutely_15` request (fold into current/forecast or a `fetchNowcast(coords)`), surface a `nowcast` array, cache short (5–10 min). **Note:** `precipitation_probability` is **not** valid at `minutely_15` resolution — request `minutely_15=precipitation,wind_gusts_10m`. **Effort M · Breaking No · CONFIRMED** (additive; the single biggest gap vs best-in-class).

**WX-P2-4 — `wind_gusts_10m` is never requested; severe-weather keys off *sustained* wind, understating the hazard that actually cancels outdoor events.**
`isSevereWarning` uses `windSpeed > 40` from `wind_speed_10m` (forecast.ts:~258); gusts (1.5–2× sustained) are what topple tents. Neither hourly nor current requests `wind_gusts_10m`; no gust field on the types. A 25 mph sustained / 45 mph gust afternoon renders "not severe." **Fix:** add `wind_gusts_10m` to hourly + current variable lists, a `windGusts` type field, and factor gusts into `isSevereWarning` (e.g. gust > 45). **Effort S · Breaking No · CONFIRMED** (additive; the 25/45 example is illustrative).

**WX-P2-5 — Current conditions expose no observation timestamp ("as of" time) — a realtime UI can't show or detect data age.**
The current block requests conditions but not its own `time`/`interval` (current.ts:26-33), and `CurrentWeather` (types.ts:80-91) has no timestamp field; the internal cache `fetchedAt` is never surfaced. With a 15-min cache + Open-Meteo's ~15-min cadence, a consumer showing "Now: 72°F" cannot render "as of 3:45 PM" or flag staleness. **Fix:** request `timeformat=unixtime` (or read `current.time`) and add `observedAt: number` (epoch ms, matching the existing `HourlyForecast.timestamp` convention) mapped in `getCurrentWeather`. **Effort S · Breaking No · CONFIRMED.**

#### Correctness / data-logic

**WX-P2-6 — City heuristic `parts[1]` returns the STATE (not the city) for two-segment "City, State" addresses.**
`coordsForEvent.ts:49` (`weatherLocationFrom`): `city: parts.length >= 2 ? parts[1] : parts[0] || loc.name || null`. For `'Armonk, NY'`, `parts[1]='NY'` (state) — wrong city. A trailing comma (`'123 Main St,'`) yields `parts[1]=''` (empty string) which does **not** fall through to `loc.name`. Only the 3-segment case is tested (pure.test.ts:73-77). Coords are still correct — only the display label is wrong. **Fix:** prefer `parts[0]` for a 2-part address; detect a 2-letter state segment; guard empty segments so `''` falls through to `loc.name`. **Effort S · Breaking No · CONFIRMED.**

**WX-P2-7 — Forecast/current/daily caches are unbounded module-global `Map`s with no size cap or TTL eviction.**
`forecast.ts:41-42`, `current.ts:19-20`, `daily.ts:23-24` each hold a `Map` keyed by rounded coord (`coordKey`, 3 decimals ≈ 110m). Entries are only `.set()` on success and skipped-on-read when expired — **never deleted** (the only per-key `.delete()` is `inflight.delete`). Full-wipe `clear*Cache()` hooks exist (forecast.ts:259 etc.) but no automatic eviction. **Merged from** the P2 correctness finding + the P3 perf-bundle finding (identical mechanism). **Fix:** add a bounded LRU (evict oldest past N≈200) or an opportunistic TTL sweep on `.set()`; best done once in a shared cache helper (see §3 duplication). **Effort M · Breaking No · CONFIRMED** (slow-growth, bounded-in-practice by distinct venue count for the named consumers — real defensive-hardening item, not a fast leak).

#### Visual / icons / UX (operator ask c)

**WX-P2-8 — Icons expose no accessibility semantics — no `role="img"`, no `<title>`/`<desc>`, no `aria-label`, no `aria-hidden`.**
Every `<svg>` (DayIcons.tsx:9,29,43,56,68,82; NightAndSevereIcons.tsx:8,25,39,54,64,76,90) carries only `className/viewBox/fill/xmlns`; the dispatcher passes nothing describing the condition, though `getWeatherInfo(code).description` ("Heavy rain", "Foggy") is available in-package (wmo.ts:56). **Merged from** the P2 visual finding + the P3 testing finding (add a render test alongside). **Fix:** add optional `label?: string` + `decorative?: boolean` to `IconProps`; emit `aria-hidden="true"` when decorative, else `role="img"` + `<title>`/`aria-label`; have `ColorfulWeatherIcon` default the label from `getWeatherInfo(code).description`. Add a render test asserting the attribute. **Effort M · Breaking No · CONFIRMED** (a consumer *can* wrap the SVG without forking, and beside-text usage ideally wants `aria-hidden` — so P2 not P1; the aster-sports §16.4 mandate governs shipping surfaces, not this lower-level lib).

**WX-P2-9 — Icons are entirely static — no motion — despite "superior visual effects/experience" being the headline ask.**
No `<animate>`/`<animateTransform>`/`@keyframes`/class-based animation anywhere in `src/icons/`; sun rays (DayIcons.tsx:15-22), rain streaks (88-92), drizzle (74-75), snow (NightAndSevereIcons.tsx:29-32), bolt (45) are fixed geometry; no `prefers-reduced-motion` scaffolding. **Fix:** add framework-agnostic inline SMIL/CSS (no JS): `<animateTransform type="rotate">` on the sun-ray `<g>`, translate-y loops on rain/drizzle/snow, slow cloud drift, opacity flash on the bolt — **all gated behind `@media (prefers-reduced-motion: reduce){ animation:none }`**, degrading to the current static art. Pair with the `useId` fix (WX-P3-9) so per-instance animations don't cross-reference. **Effort L · Breaking No · CONFIRMED** (the code's own comments reference a "polish pass / audit P2-4").

**WX-P2-10 — Coverage gap: freezing rain/drizzle, snow grains/showers, hail collapse into generic rain/snow/thunderstorm; no distinct sleet/hail/mist icon.**
`wmo.ts` maps freezing drizzle 56/57 → 'rain' (31-32), freezing rain 66 → 'rain' / 67 → 'heavy-rain' (36-37), snow grains 77 → 'snow' (41), thunderstorm-with-hail 96 → 'thunderstorm' (48); no freezing/sleet/hail/mist icon exists. A coach/parishioner can't visually distinguish safety-relevant freezing rain (icy field/lot) from ordinary rain. **Note:** `WMO_LABELS` (wmo.ts:108-114) *does* carry distinct "Freezing drizzle"/"Freezing rain" text, so icon+label surfaces still convey it verbally. **Fix:** add FreezingRain/Sleet + Hail icons, route 56/57/66/67 → 'freezing-rain', 96 → a hail-bearing thunderstorm, and wire the dispatcher in the same change. **Effort M · Breaking No · CONFIRMED** (P3 defensible since labels carry the distinction; P2 held for a package marketed as a rich map).

**WX-P2-11 — Night icon coverage is incomplete — only clear/partly-cloudy have night variants; overcast, fog, rain, drizzle, snow, thunderstorm render the day icon at night.**
Only `clear`/`mostly-clear` (ColorfulWeatherIcon.tsx:16-18) and `partly-cloudy` (19-20) branch on `isDay`; overcast (21-22), fog (23-24), drizzle/light-rain (25-27), rain (28-29), heavy-rain (30-31), snow (32-35), thunderstorm (36-37) ignore `isDay`. `isDay` is a first-class prop consumers pass, so a nighttime rainy forecast renders daytime art. **Fix:** add night variants for the common conditions (a shared moon-tinted cloud), OR document that only clear/partly-cloudy are day/night-aware and darken the shared cloud palette when `isDay=false` (prefer the variants given the flagship priority). **Effort M · Breaking No · CONFIRMED.**

**WX-P2-12 — Fog/overcast art uses fixed near-white low-opacity fills that lose contrast on light backgrounds; the whole palette is hardcoded hex with no `currentColor`/theme adaptation.**
`FogIcon` bars are `#B0BEC5`/`#CFD8DC` at opacity 0.8/0.6/0.4 (DayIcons.tsx:59-61) — the 0.4 bar composites to ~1.2:1 on aster-sports' `--as-bg-page #F7F8FA`, effectively invisible; overcast (48-49) and snow are light grays too. Zero `currentColor`/prop-driven color — 23 locked hex values, no per-surface adaptation across light + dark consumers. (Category label "dark-mode" is a misnomer — the wash-out is on *light* backgrounds.) **Fix:** raise the faint-bar opacities / darken low-opacity fog+overcast strokes for light-bg legibility; introduce a `currentColor`-driven accent or optional prop so consumers can nudge contrast; verify against `#F7F8FA` and a dark card. **Effort M · Breaking No · CONFIRMED** (P2 at the generous end — only decorative trailing detail washes out; the full-opacity cloud stays recognizable at 16px).

#### API / shared-safety surface

**WX-P2-13 — Internal helpers `coordKey` and `fetchWithTimeout` are exported from the public API, enlarging the breaking surface and leaking implementation detail.**
`index.ts:42-47` exports both from `helpers.ts`, whose header (helpers.ts:2) calls them "Internal helpers." `fetchWithTimeout` returns `MinimalResponse` (helpers.ts:44-48) which is **not** exported, so a consumer can call it but can't name its return type. Neither is in the documented API. **Fix:** drop both from `index.ts` (keep module-internal); if genuinely needed, export a deliberately-named, typed public function with its return type exported. **Effort S · Breaking Yes** (removing an export = major bump; small blast radius today) · **CONFIRMED.**

**WX-P2-14 — `coordsForEvent` returns a `[lat, lon]` tuple, but every fetcher in the same package takes a `Coords {lat, lon}` object — the resolver output doesn't feed its own fetchers.**
`coordsForEvent.ts:61-68` returns `[number, number]`; `fetchForecast`/`getCurrentWeather`/`getDailyForecast` take `Coords {lat,lon}` — a consumer must hand-convert at every call site. The source doc comment (coordsForEvent.ts:59) advertises the tuple "to spread into a `useWeather(lat, lon)`-style hook," but **no such hook ships** (DERIVATION.md:85 leaves `useWeather` in the app). **Fix:** make `coordsForEvent` return `Coords` (or add a `Coords`-returning overload) so `fetchForecast(coordsForEvent(...))` type-checks; fix the stale `useWeather` reference **in `coordsForEvent.ts:59`** (not README — the finding's original README attribution was wrong; grep confirms README has no `useWeather`). **Effort S · Breaking Yes · CONFIRMED.**

**WX-P2-15 — Icon-id contract is an untyped `string` everywhere, so renaming any WMO icon key is a silent break with zero compile signal in consumers.**
`WmoInfo.icon` (wmo.ts:17), `EventWeather.icon`/`forecastStrip[].icon` (types.ts:65,76), `DailyForecast.icon` (types.ts:99), and the `ColorfulWeatherIcon` prop (icons/ColorfulWeatherIcon.tsx:14) are all `string`; the real key set is a closed 13-value enum (wmo.ts:22-49), and the dispatcher falls back to `SunnyIcon`/`ClearNightIcon` on any unrecognized key (line 38-39). Renaming `'light-rain'→'lt-rain'` compiles clean; consumers switching on `.icon` or rendering the dispatcher silently get the fallback. **Fix:** export a `WeatherIconKey` string-literal union and type every `icon` field + the prop with it, so a rename becomes a caught compile break. **Effort M · Breaking No · CONFIRMED** (latent; manifests only on a future rename).

#### Security / supply-chain

**WX-P2-16 — Injected `fetchImpl` timeout only rejects the caller's promise — the underlying request is never aborted, leaking a connection per timed-out call on the server path.**
`fetchWithTimeout`'s injected branch does `Promise.race([opts.fetchImpl(url), timeout])` (helpers.ts:79); `FetchImpl` (types.ts:110) carries no `AbortSignal`, so on timeout the race rejects but the fetch keeps running with an open socket (the code comment at helpers.ts:58-60,68-70 admits it). The **default** global-fetch branch (91-99) *does* abort via `AbortController` — only the injected (= server/SSRF) path leaks, and that path is exactly where `astersports-web`/consumers pass their `safeFetch` boundary. **Fix:** make `FetchImpl` signal-carrying — `(url, init?: { signal: AbortSignal }) => Promise<…>` (optional param → non-breaking) — create one `AbortController` for both branches, pass `{ signal }` into `opts.fetchImpl`, and `controller.abort()` on timeout. **Effort S · Breaking No · CONFIRMED** (P1→P2: the leak is bounded — undici's own connect/idle timeouts eventually reclaim the socket — so exhaustion-at-scale is plausible but self-limiting).

**WX-P2-17 — SENSITIVE dependency list misses common auth packages (`@auth/core`, `auth0`), so a swap of those would auto-merge.**
`scripts/dependency-gate.mjs:35` matcher `/(^|[-_/])auth($|[-_/])/i` fails `@auth/core` (leading `@`) and `auth0` (trailing `0`), while correctly flagging `next-auth`/`@supabase/ssr`/`express-session`/`jose`. The gap is wider than filed — `@auth/nextjs`, `auth0-js`, `@clerk/nextjs`, `lucia`, `express-openid-connect` also slip. **Partial backstop:** the gate flags any package's *major* bump regardless, so only minor/patch changes and net-new *adds* of these auth deps escape. **Fix:** broaden to `/^@auth\//`, `/(^|[-_/])auth\d*($|[-_/])/i` (or explicit `/auth0/i`, `/@clerk/i`, `/lucia/i`); add a regression-corpus unit test so append-only edits can't regress coverage. **Effort S · Breaking No · CONFIRMED.**

**WX-P2-18 — No SAST/known-vuln PR gate: CI has no CodeQL, no dependency-review-action, no `pnpm audit` — only Dependabot (post-merge) and the bespoke version-jump gate.**
`ls .github/workflows` → `ci.yml`, `dep-review-label-guard.yml` only; grep for codeql/secret-scan/dependency-review/audit → nothing. The `dependency-gate` scores version-jump size + a name regex, **not** vulnerability data — a patch bump introducing a known-CVE transitive dep passes cleanly. **Fix:** add `github/codeql-action` (JS/TS) + `actions/dependency-review-action` (make it a required check alongside the version-jump gate — the two cover orthogonal axes: known-CVE vs major/sensitive jump); consider `pnpm audit --prod` advisory. **Effort M · Breaking No · CONFIRMED** (defense-in-depth gap, amplified by shared-package fan-out).

#### Testing / coverage

**WX-P2-19 — The `@aster/weather/icons` subpath has ZERO tests and the repo has no DOM test environment at all.**
No `*.test.tsx`; `node_modules` has no jsdom/happy-dom/@testing-library/react-dom; no `vitest.config` with `environment:'jsdom'`. All 36 tests are pure-TS. The dispatcher + 13 SVG components + the `isDay` branch are unexercised — nothing asserts they render without throwing. **Fix:** add a vitest config with `environment:'jsdom'` (or happy-dom) + `react-dom/server renderToStaticMarkup` (needs no full DOM); an `icons.test.tsx` that renders `ColorfulWeatherIcon` for every WMO key in both `isDay` states asserting non-empty `<svg>`, and renders each exported icon once. **Effort M · Breaking No · CONFIRMED** (P1→P2: static presentational SVGs, prop contracts tsc-enforced, impact = visual regression only).

**WX-P2-20 — `stripLabel` venue-local timezone correctness (the headline DL-13 fix) is never actually verified.**
The only strip-label assertion is `expect(['Morning','Afternoon','Evening','Night']).toContain(...)` (forecast.test.ts:100) — passes for *any* label. `stripLabel` (forecast.ts:186-195) computes `localHour = new Date(timestamp + utcOffsetSeconds*1000).getUTCHours()`; dropping the `utcOffsetSeconds` term (re-introducing the exact host-tz bug the package exists to fix) still yields a valid label → test stays green. **Fix:** add a test with a known `utc_offset_seconds` and a timestamp straddling a label boundary, asserting the **exact** label — lock the offset math, not set membership. **Effort S · Breaking No · CONFIRMED.**

**WX-P2-21 — In-flight request dedup (two concurrent calls → one fetch) is never exercised.**
`loadHourly`/`getCurrentWeather`/`getDailyForecast` guard with `const existing = inflight.get(key); if (existing) return existing;` (forecast.ts:96 etc.), but every "caches per coordinate" test uses **sequential** awaits (which hit the resolved cache, not the inflight path); no `Promise.all` in any test. Deleting the inflight check would pass all current tests while silently multiplying outbound Open-Meteo calls. **Fix:** a `fetchImpl` incrementing a counter + a deferred promise; fire two calls without awaiting (`Promise.all`), resolve, assert `counter === 1` and deep-equal results. **Effort S · Breaking No · CONFIRMED.**

**WX-P2-22 — No cross-surface invariant test locks WMO-map ↔ dispatcher parity (AP #43); an unrouted future icon key silently renders SUNNY.**
`getWeatherInfo` produces 13 icon keys, all routed today, but the dispatcher `default:` returns `SunnyIcon`/`ClearNightIcon` (ColorfulWeatherIcon.tsx:38). Adding a WMO entry with a new key (e.g. a future 'sleet') with no dispatcher case renders a bright sun for freezing precip across all builds. **Note:** unknown *numeric* codes are already safe (they map to neutral `partly-cloudy`, routed + test-locked at pure.test.ts:23) — the only trigger is a new icon-key *string* without a case. **Fix:** an invariant test asserting every `Object.values(WMO_CODES).map(w=>w.icon)` key has an explicit dispatcher case (maintain a routed-keys Set; new WMO keys must be added to the dispatcher in the same PR). **Effort S · Breaking No · CONFIRMED.**

**WX-P2-23 — `fetchWithTimeout` (both the injected-impl race and the global-fetch abort) has no test coverage.**
Three untested paths: the injected-impl `Promise.race` timeout reject (helpers.ts:71-82), the global-fetch `AbortController` (91-99), and `throw new Error('No fetch implementation available')` (88). No test drives `timeoutMs` at all. **Fix:** a never-resolving `fetchImpl` with `{ timeoutMs: 10 }` must reject with the timeout error; a fast impl resolves; assert `clearTimeout` runs (no leaked timers) via `vi.useFakeTimers`. **Effort S · Breaking No · CONFIRMED.**

**WX-P2-24 — Cache TTL expiry (re-fetch after the window) is untested — no fake timers anywhere.**
All three compare `Date.now() - cached.fetchedAt < CACHE_TTL_MS` (current 15min, daily/forecast 60min); tests assert only the within-TTL hit; no `useFakeTimers`. An inverted comparison or dropped `fetchedAt` (stale-forever or never-cache) would be invisible. **Fix:** `vi.useFakeTimers` → seed → advance past TTL → call → assert fetch count incremented + new value returned. **Effort S · Breaking No · CONFIRMED.**

**WX-P2-25 — `getWeatherForEvent` horizon boundaries, the >6h gap rejection, and the warning thresholds are untested.**
Only two cases exist (2h→match; 9d→null). Untested: the `daysAway>7`/`<-1` edges (forecast.ts:210), the valid recent-past window (-1..0), the `if (!closest) return null` when the nearest hour is >`MAX_FORECAST_HOUR_GAP_MS` (6h) away (215), and `isRainWarning (>40)`/`isSevereWarning (>70 precip, <20/>100 temp, wind>40)` (247-252) plus `forecastStrip` temp/precip values (the stub hard-codes precip 30/temp 72.4/wind 8.6, so warnings never flip). **Fix:** cases at `daysAway ≈ 7.0` and `≈ -1.0` (both sides), a past event within -1 day (expect enrichment), a nearest-hour-7h-away forecast (expect null via the 6h gap), and threshold cases at precip 41/71, temp 19/101, wind 41 asserting the flags flip exactly. **Effort M · Breaking No · CONFIRMED.**

---

### P3 — nice to have; low-risk enhancements, hygiene, and edge coverage

#### Realtime / data
- **WX-P3-1 — No stale-while-revalidate; "realtime" surfaces block on a cold fetch every TTL boundary.** Within-TTL returns cache; past TTL the first caller *awaits* a blocking fetch (bounded by `FETCH_TIMEOUT_MS=5s`), falling back to stale only on error. No background refresh. **Fix:** on a cache hit older than a soft-TTL, return cached immediately + kick a background refresh (dedup via the inflight map); keep hard-TTL as max-age. `current.ts:63` etc. **Effort M · No · CONFIRMED** (worst-case, not typical — real latency is sub-second; only the first caller per key per boundary blocks).
- **WX-P3-2 — Single 5s fetch, no retry/backoff.** `fetchWithTimeout` (helpers.ts:62-103) does one attempt; a transient 5xx/timeout drops to stale/null until the next user call. **Fix:** bounded retry (1–2 attempts, ~250ms + jitter, only on network/5xx/timeout — never 4xx), total wall-time capped. **Effort S · No · CONFIRMED** (blast radius bounded by the 60-min stale-cache fallback + self-heal on next call).
- **WX-P3-3 — Current block omits precipitation amount (and gusts/cloud_cover).** `weatherCode` is present and WMO codes categorically encode active precip, so "is it precipitating now" is roughly answerable — what's missing is amount/intensity + gusts (current.ts:26-33). `precipitation_probability` is **not** a valid `current` var (use `minutely_15`). **Fix:** add `precipitation` (+ `wind_gusts_10m`, `cloud_cover`) to the current list + type. **Effort S · No · CONFIRMED.**
- **WX-P3-4 — `uv_index` absent from current/hourly/daily — no sun-safety signal for daytime youth sports.** Open-Meteo supports `uv_index` (current/hourly) + `uv_index_max` (daily); no UV field on any type. **Fix:** add them with type fields. Low priority vs precip/gust. **Effort S · No · CONFIRMED.**
- **WX-P3-5 — Daily forecast under-populated.** `daily.ts:30-37` requests only max/min temp, precip_prob_max, weather_code, sunrise, sunset; Open-Meteo also offers `wind_gusts_10m_max`, `uv_index_max`, `precipitation_sum`, `apparent_temperature_max/min` on the same call at zero marginal cost. **Fix:** add them to the daily request + type. **Effort S · No · CONFIRMED.**

#### Correctness / robustness
- **WX-P3-6 — `parseOpenMeteoLocalTime` renders "NaN" for a time string with no minutes.** `'T05'` → `minuteStr=undefined` → `parseInt(undefined)=NaN` → `'5:NaN AM'` (helpers.ts:17-24). Latent (Open-Meteo always emits HH:MM); trigger is a malformed injected stub or upstream change. **Fix:** `Number.isFinite(minutes)` guard → hour-only fallback. **Effort S · No · CONFIRMED.**
- **WX-P3-7 — `getWeatherForEvent` skips the `isValidCoord` guard every sibling fetcher applies.** `fetchForecast`/`getCurrentWeather`/`getDailyForecast` early-return on `!isValidCoord`; `getWeatherForEvent` (forecast.ts:202-212) calls `loadHourly` directly, so NaN/out-of-range coords build a `latitude=NaN` URL and burn a network round-trip before failing to null. **Fix:** `if (!isValidCoord(coords.lat, coords.lon)) return null;` at the top. **Effort S · No · CONFIRMED.**
- **WX-P3-8 — `daysAway > 7` guard admits events beyond the actual fetched hourly coverage.** `forecast_days=7` is midnight-anchored (coverage ends day+6 23:00 local), so later in the day an event 6–7 days out sits past the last fetched hour → null (graceful, but the guard/comment "> 7 days out" overstates real coverage). **Fix:** tighten the guard to midnight-anchored coverage OR update the comment to the real ceiling. `forecast.ts:210` **Effort S · No · CONFIRMED.**

#### Visual / icons
- **WX-P3-9 — Every icon hardcodes static gradient `<defs>` ids; repeating one icon emits duplicate DOM ids (invalid HTML + latent render hazard).** e.g. a 7-day strip emits seven `<radialGradient id="sunGrad">`. Visually benign today (same-type gradients identical; `url(#id)` resolves to the first), but invalid DOM (breaks validators/SVGO/`getElementById`) and a future diverging-id edit or bundler dedup would mis-render. **Merged from** the P3 visual finding + the P3 testing finding. **Fix:** `useId()` per-instance prefix on both `<linearGradient id>` and `fill="url(#…)"`; add a test that two renders produce different ids. `DayIcons.tsx:11` etc. **Effort M · No · CONFIRMED** (the earlier P1 "dangling-reference → black shapes" claim was refuted — each icon carries its own `<defs>` + fill and mounts atomically, so no dangling reference is reachable; impact is DOM-validity/tooling only).
- **WX-P3-10 — Unknown/unmatched icon key falls back to a sunny/clear icon, asserting good weather for an unknown condition — split-brain with the core's neutral fallback.** Dispatcher default → `SunnyIcon`/`ClearNightIcon` (ColorfulWeatherIcon.tsx:38-39) vs core `getWeatherInfo` → `'partly-cloudy'` for unknown codes (wmo.ts:57, a deliberate "neutral not misleading" choice). The default branch is **unreachable via the documented core→dispatcher path** (every core string is routed); the sun only appears on direct dispatcher misuse with a raw/misspelled string. AP #63. **Fix:** replace the sunny default with a neutral cloud/`OvercastIcon`, aligned with the core's choice. **Effort S · No · CONFIRMED** (narrow — defensive-robustness nit, not a realistic game-day hazard).
- **WX-P3-11 — `WindIcon` and `DropletIcon` are exported from `/icons` but unreachable via the dispatcher (no WMO key routes to them).** `index.ts:23,26` export both; the dispatcher has no case and `wmo.ts` never emits 'wind'/'droplet'; reachable only by direct import. The dispatcher header comment documents this as a deliberate v0.2.0 deferral. **Merged from** the P3 visual finding + the P3 perf-bundle finding. **Fix:** either wire a 'wind' key (the `windSpeed>40` severe layer could request it) + dispatcher case, or keep them but add a one-line "direct-import-only" note on the `/icons` barrel; no action needed for bundle size (`sideEffects:false` tree-shakes). **Effort S · Breaking Yes** (dropping the export = major bump) · **CONFIRMED** (low-value hygiene — an undispatched icon is legitimate public API, like lucide-react's).
- **WX-P3-12 — Sizing/style contract inconsistent: `DropletIcon` defaults `w-3 h-3` while all others default `w-4 h-4`, and `WindIcon` uses flat strokes with no gradient unlike every sibling.** NightAndSevereIcons.tsx:88; WindIcon 52-59. Purely cosmetic; the finding itself hedges both may be intentional. **Fix:** normalize defaults to `w-4 h-4`; restyle `WindIcon` with the shared gradient treatment (or document flat as intentional). All viewBoxes already consistent at `0 0 24 24`. **Effort S · No · CONFIRMED.**

#### API / shared-safety
- **WX-P3-13 — `aster-io` declares the `@aster/weather` dependency (and the private CI-token cost) but imports nothing from it.** `aster-io/package.json:14` pins it, lock resolves it, but grep across `aster-io/{src,client,server}` → zero imports. Dead weight + `ASTER_WEATHER_TOKEN` auth burden for nothing; also muddies the consumer map. **Fix:** wire it (if intended) or drop the dependency; maintain an accurate consumer map. **Effort S · No · CONFIRMED.**
- **WX-P3-14 — `DERIVATION.md` claims St. Patrick "is not modified by this package's creation" and converges "in later passes," but `st-patricks-armonk` has already deeply converged.** DERIVATION.md:96-100 vs the 4 thin-adapter files in `st-patricks-armonk/server/weather/*` importing from `@aster/weather` + `aster-studio` importing `isValidCoord`. AP #66 (a doc asserting a state no longer true — under-estimates blast radius). **Fix:** update the "What v0.1.0 does NOT change" section + README to the actual consumer map (st-patricks deep, aster-studio `isValidCoord`, aster-io declared-unused, aster-sports not yet). **Effort S · No · CONFIRMED** (modest impact — real list is grep-discoverable).

#### Security / supply-chain
- **WX-P3-15 — Fetch failures are indistinguishable from "no weather," and library code writes to `console.error` unconditionally with no consumer opt-out.** Every failure collapses to `[]`/`null`/stale with only `console.error` (current.ts:73-105; forecast.ts:102-137; daily.ts:74-109); no error channel on `FetchOptions`. A caller can't tell "genuinely empty / outside horizon" from "Open-Meteo down," can't wire Sentry or back off, and can't silence the library. AP #36. **Merged from** the P3 "silent-failure-no-error-signal" + the P3 "console.error hygiene" (the coordinate-leak sub-claim of the latter was **refuted** — the outer catch only ever sees undici `TypeError: fetch failed` / the minted timeout / an AbortError, none of which embed the `?latitude=…&longitude=…` query; stacks record call sites, not arg values). **Fix:** add an optional non-breaking `onError?: (err:{stage:'http'|'parse'|'shape'|'network'; status?:number})=>void` invoked at each failure site (default silent, replacing the bare `console.error`); keep the `[]`/null/stale return as default. **Effort M · No · CONFIRMED.**
- **WX-P3-16 — README does not warn that the DEFAULT (no-`fetchImpl`) path uses global fetch with NO SSRF guard.** README §"Injectable fetch" (47-53) says server consumers pass an SSRF guard through, but never states that omitting `fetchImpl` server-side uses the unguarded global fetch (helpers.ts:85-99); the intent lives only in a `types.ts:106-108` code comment. **Exploitability is LOW** — `buildUrl` uses a fixed constant Open-Meteo host with only `isValidCoord`-bounded numeric lat/lon via `URLSearchParams`; no attacker-controlled destination. It's a contract-clarity gap. **Fix:** state the contract in README + the `FetchImpl` typedoc ("default path = global fetch, NO SSRF guard; host is a fixed constant + inputs numeric-bounds-checked, but consumers with an egress policy MUST pass `opts.fetchImpl`"); optionally expose the API-base constant so consumers can allowlist it. **Effort S · No · CONFIRMED.**
- **WX-P3-17 — `dependency-gate` silently PASSES a dependency whose version string it can't parse (git/tag/dist-tag/URL specifiers).** `partsOf` returns null with no `d.d.d` core; `isMajorBump` returns false when either side is null (dependency-gate.mjs:46-63), so a non-sensitive dep swapped to/from an unparseable specifier evades the version-jump arm. **Scoped:** sensitive *names* are still caught (change-based), and the flagship `#v0.1.0` tag actually *parses* (strips to `0.1.0`); the truly-unparseable set is branch refs / dist-tags / `workspace:`/`file:`. Live impact today is nil (this repo's lockfile is 100% clean `^`-ranged registry semver). **Fix:** when both sides present but a version is unparseable AND the specifier string changed, fail-closed (flag for human review); add a git-ref/dist-tag test. **Effort S · No · CONFIRMED.**

#### Testing
- **WX-P3-18 — Minor pure-function edge gaps.** `isValidCoord` tests cover 91/181/NaN but not `lat<-90`, `lon<-180` (helpers.ts:33; Infinity is redundant with the NaN branch); `fetchForecast` has no malformed-shape test (the bad-shape branch forecast.ts:114 is reachable, never asserted — current/daily do have one); `weatherLocationFrom`'s single-segment-address + `loc.name` city fallback (coordsForEvent.ts:49) is untested. **Fix:** add `isValidCoord(-91,0)/(0,-181)=false`; a `fetchForecast` bad-shape stub → `[]`; a comma-less-address case falling back to `loc.name`. **Effort S · No · CONFIRMED.**

---

## 3. Cross-cutting patterns (AP #58 cross-batch synthesis)

Seven recurring themes tie the 48 findings together; each maps to an existing aster-sports anti-pattern the fleet already codified.

| Pattern | Findings | Echoes AP | The through-line |
|---|---|---|---|
| **α — Fabrication-via-default (`?? 0`, `?? []` swallow the unknown)** | WX-P1-1, WX-P1-5 (untested), WX-P3-15 | **#36** (destructured/`??` defaults silently swallow errors), **#27** (no fabrication; pure resolvers) | The package's single most-repeated shape: a missing/null/error value becomes a real-looking `0`/`[]`/`null` with no signal. It is *literally* the pattern `parsePrecip` was written to avoid, re-introduced at the mapping layer. Fixing α = distinguish "missing" from "zero/empty" everywhere. |
| **β — Invisible artifact / stale-code drift (the repo looks fixed; production runs old bytes/tags)** | WX-P1-2 (dist), WX-P1-3 (tag on scaffold), WX-P3-14 (stale DERIVATION) | **#64** (no hand-deploy — every artifact ships from repo via CI), **#66** (a name/artifact asserting a property it doesn't have), **#22** (verify the merge, don't trust the report) | `dist` that may not equal `src`, a tag that points at pre-polish code, a doc that lies about who consumes the package. Each lets a reader trust something that isn't true. Fixing β = make CI *enforce* dist=src and stand up a real release channel. |
| **γ — Report-only / dark controls (a guard that exists but doesn't gate)** | WX-P1-4 (gate not required), WX-P2-17 (auth coverage hole), WX-P2-18 (no SAST), WX-P3-17 (fail-open parse) | **#68** (a control that is OFF is worse than none), **#65** (absence-becomes-permission), **#57** (gate completeness) | The `dependency-gate` is a well-built classifier that may not be a required check, has coverage holes, and fails *open* on unparseable input. A supply-chain gate that fails open or isn't wired is decorative. Fixing γ = required-check + broaden the corpus + fail-closed. |
| **δ — Static icons / no motion / no a11y (the visual experience is unfinished)** | WX-P2-8, WX-P2-9, WX-P2-11, WX-P2-12, WX-P3-9, WX-P3-10, WX-P3-12 | **§16.4** (a11y is table-stakes), **#43** (cross-surface invariant), **#51** (dead-feature) | The icon layer is the operator's headline "superior experience" ask and it's the least-finished surface: zero motion, zero a11y, half-finished night set, wash-out on light bg, duplicate DOM ids. Fixing δ = one motion+a11y+useId pass covers all consumers. |
| **ε — Unbounded/duplicated cache substrate** | WX-P2-7 (unbounded), WX-P3-1 (no SWR), **duplication** (below) | **#42** (parallel-system buildup — grep before building), **#36** | Three near-identical fetch+cache+inflight modules (`current.ts`/`daily.ts`/`forecast.ts`) each carry their own unbounded Map + subtly-divergent stale-fallback empty (`{hours:[],utcOffsetSeconds:0}` vs `null` vs `[]`). The duplication is *why* the unbounded-cache bug exists in triplicate. **This is itself a finding-adjacent structural note:** extract one `cachedFetch<T>({ key, ttlMs, url, parse, empty, opts })` helper so the bounded-cache fix, SWR, retry, and error channel all get a single home. |
| **ζ — Untested guarantees (the reliability/marquee behavior no test locks)** | WX-P1-5, WX-P2-19..25, WX-P3-18 | **#43** (cross-surface invariant test), **§16.4** | The package advertises stale-fallback reliability, venue-local labeling (DL-13), request dedup, and a colorful icon set — and tests **none** of them end-to-end. A refactor silently regresses any of them. Fixing ζ = a jsdom env + timer-based tests locking each guarantee. |
| **η — Contract/type honesty gaps on the shared seam** | WX-P2-13, WX-P2-14, WX-P2-15, WX-P3-11, WX-P3-16 | **#66** (name/type asserts a property it lacks), **#39/#40** (commit to the truer contract, don't hedge) | Internal helpers leaked into the public API, a resolver whose output shape doesn't feed its own fetchers, `icon` typed `string` instead of a union, undispatched exports, an undocumented SSRF default. Each widens or misrepresents the compatibility promise. Fixing η = tighten the public surface + literal-union the icon key + document the fetch contract. |

**Dominant pattern:** α (fabrication-via-default) and β (invisible-artifact drift) are the two that produce *wrong output shipped identically to consumers* — they are the reason the P1 tier exists and should lead v0.2.0.

---

## 4. Per-consumer wireframe / blast-radius

Grounded in the api-shared-safety grep evidence; where a consumer's usage is unknown it is marked so.

| Consumer | Consumes today? | How (grep-verified) | Pin | Findings that touch it | Breaking on bump? |
|---|---|---|---|---|---|
| **st-patricks-armonk** | **Yes — DEEP** | `server/weather/{current,daily,forecast,helpers}.ts` are thin adapters importing `fetchForecast`, `getCurrentWeather`, `getDailyForecast`, `getWeatherInfo`, `parseOpenMeteoLocalTime`; consumes `EventWeather`/`CurrentWeather`/`DailyForecast` shapes + `.icon` keys directly | **SHA `d4db522`** (1 behind HEAD; already has polish + security) | **Every** data/correctness finding — most importantly WX-P1-1 (fabrication on its event weather), WX-P1-5 (its stale-fallback reliability), WX-P2-1 (past-event recaps on event pages), WX-P2-5/6, and all realtime adds. Shape changes (WX-P1-1, WX-P2-14) are **tsc-caught** at its adapters on bump. | **Yes** for WX-P1-1 (EventWeather shape) + WX-P2-13/14 (export/tuple) — needs a coordinated bump + adapter update. Everything else additive/non-breaking. |
| **aster-studio** | **Yes — narrow** | `server/weather.ts:139` imports **only `isValidCoord`** | **tag `#v0.1.0`** → **scaffold `5786e81`** (pre-polish!) | Effectively only WX-P1-3 (it's on stale scaffold code today) + any change to `isValidCoord`'s signature (none proposed). WX-P3-18 edge tests would cover the fn it uses. | **No** — `isValidCoord` signature unchanged by any proposed fix. But it should be **bumped off the scaffold tag** as part of WX-P1-3. |
| **aster-io** | **Declared, NOT used** | `package.json:14` pins `@aster/weather`; pnpm-lock resolves it; **zero source imports** (grep clean) | **tag `#v0.1.0`** → scaffold | WX-P3-13 (dead dependency — drop it or wire it). No functional finding reaches it because nothing imports it. Carries the `ASTER_WEATHER_TOKEN` CI cost for nothing. | **No** functional break; dropping the dep is the recommended action. |
| **aster-sports** | **No** | Only doc mentions (CLAUDE.md references the anti-patterns, not the package); no source import | n/a | None today. It is the *doctrine* source (its anti-patterns are the audit lens) but not a code consumer. If it later adds game-day weather it becomes a deep consumer like st-patricks. | n/a |

**Net blast radius today:** real functional exposure is **st-patricks-armonk** (deep) + **aster-studio** (one fn). The two tag-pinned consumers (aster-studio, aster-io) are on the **scaffold** commit and miss all 6 polish/security commits — WX-P1-3 is the fix that reaches them. No consumer runs the specific edge paths that fail (which is why there are no P0s), but WX-P1-1's fabrication path is reachable by st-patricks the moment Open-Meteo returns a null precip for a real venue.

**Coordinated-bump set (breaking, must land together):** WX-P1-1 (EventWeather → nullable), WX-P2-13 (drop leaked helpers), WX-P2-14 (`coordsForEvent` → `Coords`), WX-P3-11 (drop/wire dead icon exports). Batch these into the single v0.2.0 major so consumers absorb one break, not four.

---

## 5. Explicit out-of-scope

This audit did **not** cover, and no finding should be read as clearing:

- **Open-Meteo's own SLA / data quality / rate limits.** We audited how the package *requests and handles* Open-Meteo, not Open-Meteo's uptime, forecast accuracy, or commercial-tier terms. The "no retry" (WX-P3-2) and "no error channel" (WX-P3-15) findings assume transient upstream failure but do not quantify its frequency.
- **On-device / rendered visual QA.** Icon findings (motion, contrast, night coverage, id-collision) are from **code + composited-contrast math**, not a real browser/VoiceOver/screen-reader pass on each of the four consumers' actual surfaces. WX-P2-12's `#F7F8FA` contrast is computed, not eyeballed on-device.
- **Consumer-side hooks and wiring.** `useWeather`, the app-level presentation of stale/loading states, and each consumer's card layout live in the consumer repos (DERIVATION.md:85 explicitly leaves `useWeather` in the app). We noted where the package's shape mismatches an *implied* consumer artifact (WX-P2-14) but did not audit consumer render code.
- **Live branch-protection / required-check state.** WX-P1-4 could not verify from the repo whether `dependency-gate` is *actually* a required check on `main` (off-repo GitHub config, no branch-protection API access this pass). The finding is conditional on that unverified state.
- **A full transitive dependency CVE scan.** WX-P2-18 notes the *absence* of a SAST/dependency-review gate; it did not itself run a vuln scan of the current lockfile (which is clean `^`-ranged registry semver, but unscanned for advisories).
- **Bundle-size budgets against the aster-sports §16.10 350KB limit.** The package is tree-shakeable (`sideEffects:false`) but we did not measure each consumer's delta.
- **The rejected finding** (for the record): a claim that `#v0.1.0` resolves to *two different code trees* via a moved/mutable tag was **REJECTED** — st-patricks pins an explicit SHA (not the tag), the tag is a clean annotated tag never moved, and both tag-pinned consumers resolve deterministically to the same scaffold tarball. The real, narrower issue (tag sits on scaffold) is captured in WX-P1-3.

---

## 6. Recommended roadmap

Three sequenced waves. Each fix is tagged **[B]** breaking or **[·]** non-breaking; breaking fixes are batched into one major so consumers absorb a single coordinated bump.

### Wave 1 — v0.2.0 · Realtime + Correctness + Pipeline hardening → **SHIP NOW**
> The P1 tier + the realtime signal set. This is where the operator's asks (a) and (d) live, and it closes patterns α, β, γ.

| Fix | Pattern | Effort | Breaking |
|---|---|---|---|
| WX-P1-1 kill `?? 0` fabrication → nullable + warning-logic guard | α | M | **[B]** |
| WX-P1-2 CI `pnpm build && git diff --exit-code dist/` | β | S | [·] |
| WX-P1-3 SemVer + CHANGELOG + fresh tag on green SHA + fix README pin + bump the 2 scaffold-pinned consumers | β | M | [·] |
| WX-P1-4 mark `dependency-gate` a **required** check (verify via API) | γ | S | [·] |
| WX-P1-5 stale-cache-on-error test (with TTL advance) | α/ζ | S | [·] |
| WX-P2-1 add `past_days:"1"` (or align guard) | a | S | [·] |
| WX-P2-2 raise `FORECAST_DAYS` to match the window | a/b | S | [·] |
| WX-P2-3 `minutely_15` precip nowcast + `nowcast` type | a | M | [·] |
| WX-P2-4 `wind_gusts_10m` + `windGusts` + severe threshold | a | S | [·] |
| WX-P2-5 `current.time` → `observedAt` | a | S | [·] |
| WX-P2-6 city heuristic 2-segment fix | correctness | S | [·] |
| WX-P2-7 bounded cache (LRU/TTL-sweep) | ε | M | [·] |
| WX-P2-13/14 drop leaked helpers + `coordsForEvent → Coords` | η | S | **[B]** |
| WX-P2-16 signal-carrying `FetchImpl` (abort on timeout) | η | S | [·] |
| WX-P2-15 `WeatherIconKey` literal union | η | M | [·] (turns future renames into caught breaks) |

**Routing: SHIP.** Batch the two **[B]** items (WX-P1-1, WX-P2-13/14) + WX-P3-11 into the single v0.2.0 major; everything else is additive. Coordinate the st-patricks-armonk adapter update in the same PR train. This wave delivers "updated info + realtime URL logic" and "best-in-class robustness" in one release.

### Wave 2 — v0.3.0 · Visual experience + a11y → **NEXT**
> The operator's ask (c). Pattern δ, one pass for all consumers.

| Fix | Effort | Breaking |
|---|---|---|
| WX-P3-9 `useId()` per-instance gradient ids (prerequisite for animation) | M | [·] |
| WX-P2-9 inline SMIL/CSS motion behind `prefers-reduced-motion` | L | [·] |
| WX-P2-8 a11y props (`role`/`aria-hidden`/`<title>` + defaulted label) | M | [·] |
| WX-P2-11 night variants for common conditions | M | [·] |
| WX-P2-12 fog/overcast light-bg contrast + `currentColor` hook | M | [·] |
| WX-P2-10 freezing-rain/hail/sleet/mist icons + routing | M | [·] |
| WX-P3-10 neutral unknown-icon fallback | S | [·] |
| WX-P3-12 normalize icon sizing + WindIcon gradient | S | [·] |
| WX-P2-19 jsdom + `renderToStaticMarkup` icon test env | M | [·] |
| WX-P2-22 WMO↔dispatcher parity invariant test (AP #43) | S | [·] |

**Routing: NEXT.** All non-breaking (additive icons + attributes). Best shipped as v0.3.0 after Wave 1's release channel exists so it actually reaches consumers. WX-P3-11 (drop/wire dead icon exports) rides here **unless** its `[B]` removal is folded into the v0.2.0 major — recommend folding into v0.2.0 to avoid a second break.

### Wave 3 — Hygiene, resilience, and coverage → **DEFER (fold in opportunistically)**
> Patterns ε/ζ/γ tail + η docs. No user-visible urgency; do as capacity allows or alongside a touched file.

| Fix | Effort |
|---|---|
| **Extract shared `cachedFetch<T>` helper** (dedupes the 3 modules; single home for cache-bound/SWR/retry/error-channel) | M |
| WX-P3-1 stale-while-revalidate · WX-P3-2 bounded retry · WX-P3-15 `onError` channel | M each |
| WX-P2-18 CodeQL + dependency-review gates · WX-P2-17 broaden auth matcher + corpus test · WX-P3-17 fail-closed on unparseable | S–M |
| WX-P2-20/21/23/24/25 test locks (tz label, dedup, timeout, TTL expiry, boundaries) | S–M |
| WX-P3-3/4/5 current precip + `uv_index` + daily enrichment | S each |
| WX-P3-6/7/8 NaN guard, `isValidCoord` guard, horizon-comment fix | S each |
| WX-P3-13 drop aster-io dead dep · WX-P3-14 fix DERIVATION consumer map · WX-P3-16 document SSRF default | S each |
| WX-P3-18 pure-fn edge tests | S |

**Routing: DEFER** the enrichment/docs items; **but pull the `cachedFetch` extraction forward into Wave 1 if WX-P2-7 (bounded cache) is done** — the two share a home and doing the bound without the extraction triplicates the fix (pattern ε). Similarly, land the Wave-1-adjacent test locks (WX-P2-20/23/24) in Wave 1's PR train since they guard the code Wave 1 changes.

---

*Audit produced under L99 §16.15 (all five structural elements + roadmap) and delivered per §11.8 / §49 (committed `.txt`-class doc + full paste). File: `docs/WEATHER_L99_AUDIT_2026-07-16.md`. 48 findings CONFIRMED (2 sub-facets PLAUSIBLE), 1 REJECTED, 7 cross-dimension duplicates merged.*
