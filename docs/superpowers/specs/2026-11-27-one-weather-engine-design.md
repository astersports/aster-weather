# The Aster weather service — design

2026-11-27 · Status: **awaiting owner approval. Nothing is built.**

Mock-up (real readings, one venue, both themes, every icon):
https://claude.ai/artifact/RZnQHSqA3XWPxu3wyRxfub

## Intent

Owner direction, 2026-11-27: this package becomes the **ultimate weather service for
every Aster project**, covering every aspect of the weather, free, and not monetised.

"Accurate" means official and measured. Every reading says what it is (measured or
forecast), where it came from and how old it is.

## Why now

Three weather engines exist today: this package's Open-Meteo fetchers, the parish ladder
in st-patricks-armonk `server/weather/`, and the App's NWS adapter in aster-sports
`src/lib/weather/`. Only the parish renders the Sky icons.

Open-Meteo's terms (read 2026-11-27): "You may only use the free API services for
non-commercial purposes." US government weather data has no such limit: the National
Weather Service (NWS) disclaimer says its information "may be used without charge for
any lawful purpose", provided nothing implies NWS endorsement.

## What "every aspect" covers

| Part of the weather | Source | Checked 2026-11-27 |
|---|---|---|
| Station readings: temperature, feels-like, dew point, humidity, wind, gusts, pressure, visibility, cloud base, rain last hour | NWS stations | Answered |
| Hourly forecast (about 6.5 days) and 7-day forecast | NWS forecast | Answered |
| Rain, snow and ice amounts, gusts, cloud cover, thunder chance, heat stress (wet-bulb globe), wind chill | NWS forecast grid, 59 layers | Answered |
| Warnings, watches and advisories | NWS alerts | Answered |
| Rain at the venue this minute | NOAA radar service | Answered |
| Sunrise, sunset, twilight | NWS point data | Answered |
| Moon phase | Calculated in the package | No source needed |
| UV index | EPA | Answered |
| Tropical storms | National Hurricane Center | Answered |
| Forecaster's hazard outlook | NWS text products | Answered |
| Severe-storm outlook | NOAA Storm Prediction Center | Service answers; point lookup untested |
| Radar loop picture | NWS radar site | Not checked (image) |
| Air quality | EPA AirNow | Needs an account key on a server |
| Normal for the date | Regional climate centers | Test request refused; unverified |
| Lightning strikes | — | No free official feed. Left out |
| Pollen | — | No free official US source. Left out |

## Goals

1. One data engine for everything in the table that has a source.
2. Every reading carries `kind` (`observed` or `forecast`), its own clock time,
   `fetchedAt` and `stale`. Past a maximum age it is dropped, never shown.
3. One icon for every condition the forecast can report, by day and by night, a wind
   modifier, and a glyph for every measurement.
4. Ready-made page parts, so every project shows the same weather screens without
   drawing its own (owner, 2026-11-27).
5. All four consumers on the engine, the icons and the parts; the duplicate engines
   deleted.
6. The engine contract in CLAUDE.md §3 holds unchanged.

## Non-goals

- No forecast model of our own, no accuracy score, no stored history.
- No coverage outside the US. Outside it the engine returns `null`.
- No notifications. No new advice or go/no-go layer.
- No marine, tide or river data (no current venue needs it).

## Anti-goals

- A forecast shown as a measurement, or an old reading shown as current.
- A missing reading shown as clear, zero or dry.
- Radar removing rain. Radar may only add it; a radar that cannot answer changes nothing.
- Any claim of "most accurate". Copy says official, measured, and how old.
- Altered NWS alert text presented as official.

## Constraints

- Runs in the browser (the App fetches NWS directly, no proxy: owner, 2026-10-30) and on
  a server (parish, demo). A source that needs a key is server-only.
- Hosts are a fixed list of constants (CLAUDE.md §3.4): `api.weather.gov`,
  `mapservices.weather.noaa.gov`, `data.epa.gov`, `www.nhc.noaa.gov`.
- NWS asks servers for an identifying `User-Agent`; browsers cannot set one.
- Zero runtime dependencies. `dist/` committed. `react` stays an optional peer.
- `v0.7.0` is reserved. Each minor is held until its merge commit carries
  `[release-approved]`, which only the owner grants.
- Tests run on recorded fixtures, with no live network.
- This repo is public: no secrets, no production values.

## Approaches considered

- **A. Official US sources in this package; consumers migrate (chosen).**
- **B. Keep Open-Meteo and add an API key.** Costs money for the commercial projects
  and leaves the parish ladder and the App adapter outside the package.
- **C. Share only icons and types.** Three engines keep drifting: the App maps NWS icon
  keywords, the parish maps NWS prose, and they already disagree.

## Design

### Data (`@aster/weather`)

New, additive functions. Each takes `(coords, opts)`, never throws, and returns `null`
for "could not answer" or "outside coverage".

| Function | Returns |
|---|---|
| `getNow` | The current reading |
| `getHourly` | Hourly forecast |
| `getDaily` | 7 days, each folding its day and night periods |
| `getAlerts` | Active official alerts |
| `getRadarRain` | Whether radar shows rain at the point now |
| `getSun`, `getMoon` | Sun times; moon phase (pure calculation) |
| `getUv` | UV index, hourly and daily maximum |
| `getOutlooks` | Tropical storms, severe-storm outlook, hazard outlook text |
| `getAirQuality` | Air quality, only when the consumer passes a key |
| `getEventWeather` | The hour nearest an event, with the existing warning flags |
| `getWeather` | The parts above in one object; each succeeds or fails alone |

**Fields.** An hour joins two NWS answers by time: the hourly forecast (temperature,
rain chance, wind, condition) and the forecast grid (feels-like, gusts, rain, snow and
ice amounts, cloud, humidity, thunder chance, visibility, heat stress). If the grid
fails, those fields are `null` and the hour still stands. A station reading's feels-like
is the station's heat index or wind chill, else the air temperature.

**The ladder for `getNow`:** the nearest station's latest observation (the next-nearest
if it is older than 90 minutes or has no temperature); else the current forecast hour,
marked `forecast`; else a stored reading inside its age bound, marked `stale`; else
`null`.

**Radar** runs beside the reading and may upgrade a dry condition to rain, in `getNow`
and in today's entry of `getDaily`. The stored reading is saved before the upgrade.

**Age bounds** (from the parish ladder): current 3 h, hourly 12 h, daily 24 h, radar
15 min. An alert lives until its own `ends` or `expires`.

**Caching.** `opts.store` is a small async `get`/`set` interface; the default is the
existing in-memory LRU. A browser adapter and the parish's database adapter are thin,
consumer-side files.

**Conditions.** A `Condition` union becomes the pivot instead of the WMO code: the 14
existing keys plus `mostly-cloudy`, `wintry-mix`, `sleet`, `blizzard`, `haze`, `smoke`,
`dust`, `hot`, `cold`, `tornado` and `tropical-storm`. A reading also carries
`windy: boolean`. `condition` is `Condition | null`. One table maps NWS's 34 icon
keywords to a condition, tested against the keyword list recorded as a fixture.

**Units.** °F, mph, inches, miles. Metric inputs are converted; a `null` stays `null`.

**Open-Meteo fetchers.** Unchanged and marked deprecated. Removed in `v1.0.0`.

### Icons and glyphs (`@aster/weather/icons`)

- Eleven new conditions; a night sky for every condition (a darker tint, and the moon
  wherever the day art shows the sun); a `windy` prop for dry skies.
- A line glyph for every measurement, and eight moon phases.
- `condition={null}` renders nothing; the consumer shows text.
- A computed-contrast test: one representative colour per mark, listed in the test,
  against both stops of its tint, at 3:1 or better. Shipped art is not recoloured.
- Unchanged: no pixel sizes, `SkyPanel` required, reduced motion resolves to static, and
  server output carries no animation nodes.
- The mock-up above is the rendering to match, once the owner approves it.

### Page parts (`@aster/weather/ui`)

Owner decision, 2026-11-27: the package ships the weather screens, not just the data.

- A third subpath. React, like `/icons`; `react` stays an optional peer.
- The parts: `WeatherChip` (one line beside a game or event), `WeatherHero`,
  `WeatherTiles`, `HourlyStrip`, `DailyList`, `AlertBanner`, `RainNow`, `SunMoon`,
  `HeatCold`, `Outlooks`, `StationTrend`, and `WeatherPage`, which composes them.
- **Parts render; they do not fetch.** Each takes the engine's own shapes as props, so
  the same part works with data fetched in a browser (the App) or on a server (parish,
  demo). A missing part of the data renders nothing.
- **One static stylesheet**, `@aster/weather/ui/styles.css`, with every class prefixed
  `aw-`. It must exist at server-render time, so it is a file the consumer imports, not
  a style injected on mount.
- **Each project supplies its own look** through CSS variables with fallbacks
  (`--aw-surface`, `--aw-text`, `--aw-muted`, `--aw-line`, `--aw-accent`); type inherits
  from the host page. The parts carry no light or dark logic of their own.
- The Sky panel keeps its own palette, as today.
- Server output matches first client render (no clock or storage read during render).
- Interactive targets are 44px or larger; lists are real lists; every icon that carries
  meaning has a label.

### Alerts

Shown verbatim: the NWS `event`, `headline`, times and sender. NWS permits its name to
identify unaltered NWS content. Severity maps to three visual levels.

### Consumers (one PR each, after the package tag)

- **aster-sports:** `src/lib/weather/nws*.js` replaced by the package.
- **st-patricks-armonk:** the ladder, NWS and radar files replaced by the package; the
  database store adapter kept.
- **nova-select:** `server/weather.ts` moves to the package's NWS functions.
- **aster-io:** the product mock uses the Sky icons and stops naming Open-Meteo.

Each project places the package's parts where its weather shows today, in its own PR,
with a before-and-after capture. Each consumer's own weather rules change in the same
PR. An Open-Meteo credit is removed only when that project renders no Open-Meteo data.
No NWS credit is added anywhere, following the owner's 2026-10-30 ruling; the one place
the NWS name appears is as the issuer of an alert.

### Docs in this repo

README and CLAUDE.md §1 and §2 are rewritten for the new engine. Approving this design
is the owner ruling that §2 requires.

### Releases

| Tag | Contents | Kind |
|---|---|---|
| `v0.7.0` | Nullable weather code (reserved) | Breaking |
| `v0.8.0` | Engine: now, hourly with the grid, daily, alerts, radar, sun and moon, event function, provenance, store | Additive |
| `v0.9.0` | Icons and glyphs | Breaking for exhaustive switches on the icon key |
| `v0.10.0` | Page parts for everything in `v0.8.0` | Additive |
| `v0.11.0` | UV, outlooks, heat stress, air quality, and their parts | Additive |
| `v1.0.0` | Open-Meteo fetchers removed, after all four consumers migrate | Breaking |

## Left to the builder

- Internal module layout, cache key shapes and the fixture format.
- Exact tint and mark colours, provided the contrast test passes and the approved
  mock-up is matched.
- How `getWeather` runs its parts in parallel.

## Open items

1. **Owner: alert wording.** The mock-up shows an alert under its official name with the
   National Weather Service named as issuer. The App ruling "leave out the wording and
   credit" was made for forecasts; approving the mock-up settles this for alerts.
2. **Radar from a browser.** Cross-origin access to NOAA's map service is unverified. If
   it refuses, radar is server-only and the App gets none.
3. **Unverified sources:** the radar loop picture, normal-for-the-date, and the
   severe-storm point lookup. Each is dropped if it cannot be verified in the build.
4. **NWS rate limits** are undisclosed.

## Decided

- **Who draws the screens** (owner, 2026-11-27): the package ships ready-made page parts.
