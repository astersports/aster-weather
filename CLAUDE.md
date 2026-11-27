# CLAUDE.md — aster-weather (`@aster/weather`)

> **RULES only** ([doc doctrine](https://github.com/astersports/aster-io/blob/main/docs/DOC_DOCTRINE.md)).
> Concepts and facts → [`README.md`](README.md) (this public package has no other reference).
> Estate truth → `astersports/aster-io` →
> [`WHAT_IS_BUILT.md`](https://github.com/astersports/aster-io/blob/main/docs/WHAT_IS_BUILT.md); link it, never restate it.
> The rules this file replaced on 2026-10-09 (B-024): [`docs/CLAUDE_MD_ARCHIVE_2026-10-09.md`](docs/CLAUDE_MD_ARCHIVE_2026-10-09.md).

**A shared, public library.** A change here reaches every consumer at its next re-pin. The version
is whatever `package.json` on `origin/main` says — read it, never quote it from a doc.

## 1. Never claim what this package does not contain

- **What it has (`v0.8.0`).** The NWS and NOAA engine: `getWeather` and its parts (`src/weather.ts`),
  current readings (`src/now.ts`), hourly and seven-day forecasts (`src/nws/hourly.ts`,
  `src/nws/daily.ts`), alerts (`src/nws/alerts.ts`), radar (`src/radar.ts`), sun and moon
  (`src/astro.ts`), the event function (`src/event.ts`), the provenance stamp (`src/provenance.ts`)
  and the last-good store interface (`src/store.ts`). Radar may only add rain.
- **What it does NOT have.** Page parts (`v0.10.0`), icons for the newer conditions and measurement
  glyphs (`v0.9.0`), UV index, outlooks and air quality (`v0.11.0`), notifications, and coverage
  outside the US. Grep `src/` before claiming otherwise.
- **Radar from a browser is unverified.** Never write that it works in a browser.
- **No `readingKind`, no `cached` value.** A reading's kind is `Stamp.kind` (`observed` or
  `forecast`); a reading served past its freshness window has `stale: true`.
- What it also has is the in-process resilience chain in `src/cache.ts` —
  [README](README.md#the-resilience-chain-srccachets). Describe that, and only that.
- **Never write "three independent weather sources"** about anything built on this package.
- **Never write "most accurate".** Say official, measured, and how old.
- **Never show a forecast as a measurement.** A `forecast` stamp is a forecast.
- **Never present edited NWS alert text as official.** Alert text is passed through unedited.
- Describing an Aster product? Read `WHAT_IS_BUILT.md` first; this file governs this library only.

## 2. Open-Meteo: the data is CC-BY 4.0, the free API is non-commercial

- **Two different terms; never merge them** (owner ruling, 2026-11-27). The *data* is CC-BY 4.0:
  commercial use is allowed, with credit. The *free API* is for non-commercial use only, by
  Open-Meteo's own terms (https://open-meteo.com/en/terms, read 2026-11-27).
- **Never point a commercial project at this package's Open-Meteo fetchers** on the free API.
  The replacement engine on US government sources is in this package since `v0.8.0` (`getWeather` and
  its parts). Its design: [`docs/superpowers/specs/2026-11-27-one-weather-engine-design.md`](docs/superpowers/specs/2026-11-27-one-weather-engine-design.md).
  The Open-Meteo fetchers are deprecated and removed in `v1.0.0`, after all four consumers move.
- Every consumer that renders Open-Meteo data must show a visible, linked credit:
  **"Weather data by Open-Meteo"** → https://open-meteo.com/. Removing it while that data is
  rendered is a licensing regression.
- This package is headless and cannot render the credit; say so in any consumer-facing doc.

## 3. The engine contract — do not weaken any of these

1. **Measurements are `number | null`; a missing value is never fabricated as `0`.** `null` =
   unknown; warning flags do not fire on `null`; consumers render `—`, never `0`.
2. **`weatherCode`, `icon` and `description` are `null` when no usable code was reported.** Never write
   `?? 0` for a code; a real `0` stays clear sky.
3. **Hourly timestamps are absolute epoch-ms** *(Open-Meteo fetchers only.)* `fetchForecast` and `getNowcast` requests carry
   `&timeformat=unixtime`; match hours by epoch arithmetic, never by parsing local time strings.
   (`current`/`daily` request `timezone=auto` and parse sunrise/sunset with `parseOpenMeteoLocalTime` — never use that path for hour matching.)
4. **Every fetch takes `opts.fetchImpl`** — the SSRF boundary. Keep the default host fixed and the
   coordinates numeric and bounds-checked.
5. **Every fetch takes `opts.onError`, fired exactly once per ultimately-failed fetch** — after the
   retry, immediately before the stale/empty fallback. Never once per attempt.
6. **The engine never throws to callers.** Failure becomes stale-or-empty. Consumers do not wrap
   calls in try/catch; a change that lets a throw escape is a breaking change.
7. **A missing NWS field is `null`, never `0`.**
8. **Every engine reading carries its `Stamp`, and a reading past its maximum age is dropped, never
   shown** (`MAX_AGE_MS`, `ALERT_MAX_STALE_MS`, and `MAX_FRAME_AGE_MS` for radar frames).
9. **Radar may only add rain.** A radar that cannot answer changes nothing, and a frame older than
   `MAX_FRAME_AGE_MS` never claims.
10. **NWS alert text is never edited.**
11. **The engine's hosts are the two constants in `src/nws/http.ts`.** A URL taken from an NWS
    response is used only when it is under the NWS host.

## 4. Icon surface (`@aster/weather/icons`)

- **No pixel sizes in `WeatherIcon`.** `viewBox="0 0 64 64"`, `width/height: 100%`, `xMidYMid meet`;
  the container sets scale. A surface that cannot give ~32px renders text instead.
- **The sky panel is never lighter than `SKY_FLOOR` `#2E5A8C`** — the raindrop's 3:1 is the binding
  constraint. One palette, no light/dark fork; `WeatherIcon` lives inside `<SkyPanel>`.
- **Do not reintroduce bare icons** (`ColorfulWeatherIcon`, per-condition `*Icon` exports) — removed
  in v0.6.0 because they failed contrast on light cards.
- **`usePrefersReducedMotion` starts `true`** (SSR and first client render) — server output and
  reduced-motion users get zero animation nodes. Keep it that way.

## 5. Versioning and distribution

- **`dist/` is committed and consumed directly.** Change `src/` → `pnpm build` → commit `dist/` in
  the same commit. CI rebuilds and fails on any `dist/` drift.
- **SemVer:** major = shape / icon-key / behaviour break · minor = additive · patch =
  behaviour-preserving fix. On 0.x a break ships as a minor — **call it "breaking" anyway**.
- **`v0.7.0` was the nullable-`weatherCode` release.** The engine on US government sources takes
  `v0.8.0` and later — `docs/superpowers/specs/2026-11-27-one-weather-engine-design.md`.
- **`v0.8.0` is the engine release, and it is additive.** Later versions (`v0.9.0` to `v1.0.0`) are
  listed in the same design doc.
- **Tags are cut by `auto-tag.yml` on merge.** A patch tags automatically; a minor/major is **held**
  until the merge commit carries `[release-approved]` (or a deliberate `force` dispatch). That
  hold is the feature — never add the marker or dispatch `force` unless the owner asked for that release.
- **Consumers pin a tag — never a branch, never a bare SHA.** A consumer's re-pin is a reviewed
  PR in the consumer repo, not here.
- **Read a consumer's pin from its own `origin/main` `package.json`**, never from a table (README's
  "Who consumes it" list is dated). `aster-studio` does not consume this package.

## 6. Dependencies and CI — what actually runs

- **Required check: `typecheck + test`** (the `main protection` ruleset) — `pnpm run check`,
  `pnpm run test`, then the committed-`dist/` drift check.
- **`dependency-gate` runs on every PR from the base commit's copy** (`scripts/dependency-gate.mjs`):
  it **reports** a major bump or a money/child/auth-adjacent package (resolved lockfile) and passes;
  it fails closed only on missing or unreadable inputs. Not a required check. A flagged change
  means review it substantively (changelog, full suite, consumers' shape).
- **The `dep-review-approved` and `owner-go` labels are retired and deleted** (owner directive,
  2026-10-04; labels removed 2026-10-09). Nothing reads them; never request or apply them.
- **Dependabot minor/patch auto-merge on green** (`dependabot-automerge.yml`) unless the gate
  flags the update; majors and flagged updates wait for a human.
- **Editing `.github/**` or `scripts/dependency-gate.mjs` is a guard change** (CODEOWNERS names
  the owner) — never weaken a gate or its `SENSITIVE` list to get a PR through.
- No AI reviewer runs here: `claude-review.yml` was removed by owner ruling on 2026-10-09 (#46).

## 7. Working here

- Branch off `origin/main`, PR into `main`, keep `main` green. Never commit to `main` directly.
- Before reporting clean: `pnpm run check && pnpm run test && pnpm run build`, then `git status`
  shows no `dist/` change you did not commit.
- **The six estate gates still apply** — [`AUTOMATION_CHARTER`](https://github.com/astersports/aster-io/blob/main/docs/AUTOMATION_CHARTER.md);
  here that means branch or tag deletion, force-push or history rewrite, and secrets. Ask first.
- A planning or audit artifact goes in `docs/` and is pasted in full in chat, same turn.

## 8. Planner and workers (owner, 2026-11-25)

- **You are the planner**; the `worker` and `checker` agents in `.claude/agents/` are the crew.
- **Start every job with one clear goal and how we will know it is done.** Split it into small tasks; hand each to `worker`.
- **Send every worker result to `checker`.** On FAIL, send it back with the reason, up to three times; after the
  third FAIL, do it yourself or bring it to Frank.
- **You do the thinking and the final review; the workers do the work.** A checker PASS is one signal, not proof:
  run §7's checks yourself before calling anything done. §3, §5 and the estate gates bind every worker too.
- **When Frank corrects how a skill works, update that skill's `SKILL.md` in `.claude/skills/`** so the mistake
  does not happen again, and tell him what you changed.
