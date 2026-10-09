# CLAUDE.md — aster-weather (`@aster/weather`)

> **RULES only** ([doc doctrine](https://github.com/astersports/aster-io/blob/main/docs/DOC_DOCTRINE.md)).
> Concepts and facts → [`README.md`](README.md) (this public package has no other reference).
> Estate truth → `astersports/aster-io` →
> [`WHAT_IS_BUILT.md`](https://github.com/astersports/aster-io/blob/main/docs/WHAT_IS_BUILT.md); link it, never restate it.
> The rules this file replaced on 2026-10-09 (B-024): [`docs/CLAUDE_MD_ARCHIVE_2026-10-09.md`](docs/CLAUDE_MD_ARCHIVE_2026-10-09.md).

**A shared, public library.** A change here reaches every consumer at its next re-pin. The version
is whatever `package.json` on `origin/main` says — read it, never quote it from a doc.

## 1. Never claim what this package does not contain

- **No fetch ladder, no provenance.** No NWS fallback, no radar rung, no persisted cross-process
  cache, no `readingKind`, no `observed | forecast | cached` field. They live in
  `st-patricks-armonk/server/weather/`, pending upstream. Grep `src/` before claiming otherwise.
- What it does have is the in-process resilience chain in `src/cache.ts` —
  [README](README.md#the-resilience-chain-srccachets). Describe that, and only that.
- **Never write "three independent weather sources"** about anything built on this package.
- Describing an Aster product? Read `WHAT_IS_BUILT.md` first; this file governs this library only.

## 2. Open-Meteo is CC-BY 4.0 — attribution is a licence condition

- Every consumer that renders this package's data must show a visible, linked credit:
  **"Weather data by Open-Meteo"** → https://open-meteo.com/. Removing it is a licensing regression.
- This package is headless and cannot render the credit; say so in any consumer-facing doc.
- **Never write that Open-Meteo's free tier is "non-commercial only"** — that claim was wrong and is withdrawn.

## 3. The engine contract — do not weaken any of these

1. **Measurements are `number | null`; a missing value is never fabricated as `0`.** `null` =
   unknown; warning flags do not fire on `null`; consumers render `—`, never `0`.
2. **`weatherCode` is the one exception, and it is a known seam** — still `number`, `?? 0` → "clear".
   Do not copy that pattern to any other field; closing it is the reserved v0.7.0 release (§5).
3. **Timestamps are absolute epoch-ms.** Every request carries `&timeformat=unixtime`; match hours by
   epoch arithmetic, never by parsing local time strings.
4. **Every fetch takes `opts.fetchImpl`** — the SSRF boundary. Keep the default host fixed and the
   coordinates numeric and bounds-checked.
5. **Every fetch takes `opts.onError`, fired exactly once per ultimately-failed fetch** — after the
   retry, immediately before the stale/empty fallback. Never once per attempt.
6. **The engine never throws to callers.** Failure becomes stale-or-empty. Consumers do not wrap
   calls in try/catch; a change that lets a throw escape is a breaking change.

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
- **`v0.7.0` is reserved** for the nullable-`weatherCode` release (CR-1). Upstreaming the ladder
  and provenance takes a later number — never claim v0.7.0 for it.
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
