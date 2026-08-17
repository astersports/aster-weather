# @aster/weather

Framework-agnostic weather core (Open-Meteo) + React SVG weather icons for the Aster
Sports family. The canonical engine was extracted from St. Patrick and merged with the
aster-sports build's improvements — see [DERIVATION.md](./DERIVATION.md) for the full diff
and merge rationale.

> **Aster Sports** is a creative company focused on **AAU basketball** whose platform is
> **not limited to it** — the St. Patrick parish build is the proof, and it is this
> package's largest consumer. Canonical estate truth lives in the `astersports.io` repo →
> `docs/WHAT_IS_BUILT.md`.
>
> **This is a shared library.** A change here reaches every consumer at their next re-pin,
> so the bar is higher than in an app repo — and that is exactly why the release is gated
> behind `[release-approved]` rather than shipping on merge.

**This README is the reference.** Being a public package, the facts live here — consumers, the
resilience chain, the Sky system, the versioning plan — rather than in a `docs/` directory that
would be a second description of the same things, free to drift from this one. The *rules* an
agent must follow are [`CLAUDE.md`](./CLAUDE.md), kept short because it loads on every turn.
([Why each fact gets exactly one home.](https://github.com/astersports/aster-io/blob/main/docs/DOC_DOCTRINE.md))

## Install

Consumed as a git dependency off a release **tag** — no registry, `dist/` is committed, no
build step on install. Never pin a branch or a bare SHA.

```jsonc
// package.json
{
  "dependencies": {
    "@aster/weather": "github:astersports/aster-weather#v0.6.0"
  }
}
```

### Who consumes it (verified 2026-08-17)

Four repos, **all four pinned to `#v0.6.0`**: `st-patricks-armonk` (13 source files),
`aster-sports` (11), `nova-select` (7), `aster-io` (3). **`aster-studio` does not consume
it** — no dependency entry; the only mentions there are historical planning docs.

## ⚠ What is NOT in this package

**The four-rung fetch ladder and the `observed | forecast | cached` provenance are not
here.** They live in `st-patricks-armonk/server/weather/` and are **pending upstream** —
`radarNow.ts` says so in its own header: *"this into `@aster/weather` as the fact-level
ladder's rain rung; when that lands, this file is absorbed by the package and deleted
here."*

This package has **no NWS fallback, no persisted cross-process cache, no radar rung, and no
`readingKind` field.** Do not document or market it as if it did. When the ladder is
upstreamed it must take a version **later than `v0.7.0`**, which is already reserved (see
[Versioning](#versioning)).

What it does have is the resilience chain below — a different and narrower guarantee.

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

### The resilience chain (`src/cache.ts`)

Every cached fetch resolves in this order, and only this order:

| # | Rung | Behaviour |
|---|---|---|
| 1 | **Fresh hit** | value newer than the TTL short-circuits — no fetch |
| 2 | **Stale-while-revalidate** | expired-but-present value returned *immediately*; background refresh runs, deduped separately so it can never satisfy a cold caller |
| 3 | **Cold fetch, in-flight deduped** | concurrent misses on one key share one promise |
| 4 | **1 retry @ 500 ms** | `FETCH_RETRY_COUNT = 1`, `FETCH_RETRY_BACKOFF_MS = 500` |
| 5 | **Stale-on-error** | last-known-good, timestamp *not* refreshed — so the next call retries instead of serving stale for a whole TTL |
| 6 | **Typed empty** | `[]` / `null` |

The store is a **bounded LRU** (default 200 keys), so a long-running multi-venue server
cannot grow without bound. TTLs: forecast 60 min · daily 60 min · current 15 min ·
nowcast 10 min.

### Measurements are `number | null` — a missing value is never fabricated as `0`

Every measurement (`temperature`, `precipitationProbability`, `windSpeed`, `windGusts`, …)
is `number | null`. `null` means Open-Meteo reported no value for that slot. Warning flags
(`isRainWarning` / `isSevereWarning`) treat `null` as *unknown* and do not fire off a
missing reading. **Render `null` as "—" / "N/A", never as `0`.**

### Time is absolute (epoch ms)

`HourlyForecast.timestamp` is absolute epoch-ms — every request carries
`&timeformat=unixtime`, so hour matching is pure epoch arithmetic and **there is no
host-timezone drift**. Pass an absolute ISO string (with offset or `Z`) to the matchers.

### `opts.fetchImpl` — the SSRF boundary

Every fetch fn takes `opts.fetchImpl`. Server consumers with an egress policy pass their
guarded fetch through; tests stub the network.

```ts
await fetchForecast(coords, { fetchImpl: safeFetch });
```

The default path (no `fetchImpl`) uses global `fetch` with **no SSRF guard**. That is safe
here because every request targets a fixed constant Open-Meteo host with only numeric,
bounds-checked lat/lon via `URLSearchParams` — there is no attacker-controlled destination.
A server behind an egress policy should still inject its own. On timeout the injected impl
receives an `AbortSignal` and is aborted, so a slow upstream cannot leak a socket.

### `opts.onError` — fires once per ultimately-failed fetch

```ts
await fetchForecast(coords, {
  fetchImpl: safeFetch,
  onError: (err, ctx) => reportError(err, { surface: "weather", ...ctx }),
  //                            ctx = { call: "fetchForecast", lat, lon }
});
```

It fires **exactly once** per fetch that ultimately fails — after the retry, immediately
before the stale/empty fallback. A retry-then-fail emits one `onError`, not one per
attempt. An omitted hook is zero behaviour change.

### The engine never throws

A failed fetch becomes stale-or-empty, never an exception. That is a contract: consumers do
not wrap these calls in try/catch, and `onError` is how an outage becomes visible.

## Icons (`@aster/weather/icons`) — React · the **Sky** system (v0.6.0)

Weather renders inside a **panel of sky** tinted to the condition; the icon is glossy,
dimensional, and fills its container.

```tsx
import { WeatherIcon, SkyPanel } from "@aster/weather/icons";
import { getWeatherInfo } from "@aster/weather";

const icon = getWeatherInfo(code).icon; // WeatherIconKey

<SkyPanel condition={icon} isDay style={{ borderRadius: 16, padding: 12 }}>
  <div style={{ width: 54, height: 54 }}>
    <WeatherIcon condition={icon} isDay />
  </div>
</SkyPanel>
```

- **Contrast is guaranteed by construction.** The panel is never lighter than
  `SKY_FLOOR = #2E5A8C` — the measured floor where the white cloud (7.1:1), gold sun
  (4.7:1) and **raindrop (3.29:1, the binding constraint)** all clear WCAG 1.4.11's 3:1.
  One palette; a cream page and a navy app get identical contrast. No light/dark fork.
- **17 conditions, nothing collapses:** the 14 WMO `WeatherIconKey`s + `clear-night` /
  `partly-cloudy-night` / `snow-night` (selected by `isDay`). `SKY_TINTS`,
  `SKY_CONDITIONS`, `SKY_FLOOR`, `skyConditionFor`, `skyGradient` and `ROUTED_ICON_KEYS`
  are exported for consumers building their own sky surfaces.
- **No pixel size, ever.** The SVG is `width/height: 100%` (`viewBox 0 0 64 64`,
  `xMidYMid meet`) — the container decides scale. A surface that cannot give the icon
  ~32px should render text, not a shrunken glyph.
- **Motion is ON by default** (`animate={false}` for a static frame); an injected
  stylesheet drives it, and **`prefers-reduced-motion` always resolves to static** —
  `usePrefersReducedMotion` returns `true` during SSR and on first client render, so
  reduced-motion users and server output get zero animation nodes.

`react` is an optional peer dependency — only needed if you import `/icons`.

> ### ⚠ Breaking from v0.5.x
> **`ColorfulWeatherIcon` and the individual `*Icon` exports are removed.** Migrate to
> `<WeatherIcon>` inside `<SkyPanel>`. Bare icons on a light card measured 1.03–1.47:1 —
> effectively invisible — and that is the defect this release fixes. It ships as a 0.x
> *minor*, but it is a **breaking** change to the `/icons` surface; describe it that way.

## ⚠ Open-Meteo is CC-BY 4.0 — visible attribution is required

Every consumer that renders data from this package must show a visible, linked credit:
**"Weather data by Open-Meteo"** → <https://open-meteo.com/>. This is a **licence
condition**, not decoration — removing it is a licensing regression, not a design choice.

**An earlier doc claimed Open-Meteo's free tier is "non-commercial only". That was wrong
and is withdrawn.** Do not reintroduce it.

This package is headless and cannot render the credit itself, so the obligation sits with
each consumer.

## Versioning

**major** = shape / icon-key / behaviour break (coordinate a consumer bump) · **minor** =
additive · **patch** = behaviour-preserving fix. Full history in
[CHANGELOG.md](./CHANGELOG.md).

**`v0.7.0` is already reserved** for the breaking nullable-`weatherCode` release (**CR-1**),
which closes the `?? 0` fabrication seam. There is an explicit **R-2 split: icons =
v0.6.0, engine = v0.7.0**. Anything else needing a version — including upstreaming the
ladder and provenance from `st-patricks-armonk` — **must take a later number.**

A **minor or major tag is held** until the merge commit carries `[release-approved]`
(`.github/workflows/auto-tag.yml`). A release that carries design or shape cannot ship by
merely merging its PR.

## Scripts

```bash
pnpm build   # tsc -> dist/ (COMMITTED — rebuild in the same commit as any src/ change)
pnpm check   # typecheck only
pnpm test    # vitest
```
