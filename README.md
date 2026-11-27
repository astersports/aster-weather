# @aster/weather

Official US weather for Aster projects: National Weather Service forecasts, station readings
and alerts, and NOAA radar. Station readings and forecasts carry a stamp that says what they
are (measured or forecast), where they came from and how old they are. The package also ships the Sky weather icons (`@aster/weather/icons`). The older
Open-Meteo fetchers are still here and deprecated.

**This README is the reference.** The rules an agent must follow are in [`CLAUDE.md`](./CLAUDE.md).
This is a shared library: a change here reaches every consumer at its next re-pin, so a minor
or major release is held for owner approval rather than shipping on merge (a patch tags
automatically).

## 1. What this is

- **Coverage: the United States only.** Outside US coverage the location functions answer `null`. `getMoon` is a calculation and needs no location.
- **Sources.** Points, stations, observations, the seven-day and hourly forecasts, the forecast
  grid and alerts come from the National Weather Service API (`api.weather.gov`). Radar comes
  from NOAA's map service (`mapservices.weather.noaa.gov`). Sun times come from the NWS point
  data. The moon is calculated in this package.
- **Readings are labelled.** Station readings, forecasts and the event reading carry a `Stamp` (section 5). A radar answer carries its frame times instead (section 9). Alerts and sun times are dated by their own fields, and the moon by the time passed to `getMoon`.
- **The engine never throws.** A failed part becomes `null`, a stale reading or an empty list.
- **Headless.** The engine draws nothing. The Sky icons are React, and `react` is an optional peer.
- **Not here yet.** See section 17 for the parts still to come.

## 2. Install

Consumed as a git dependency off a release **tag**. There is no registry, `dist/` is committed,
and nothing builds on install. Never pin a branch or a bare SHA.

```jsonc
// package.json
{
  "dependencies": {
    "@aster/weather": "github:astersports/aster-weather#v0.8.0"
  }
}
```

Consumers pin a tag, and a consumer's re-pin is a reviewed change in that consumer's repository.
Read each consumer's pin from that repository's own `package.json`, never from this file.

## 3. Quick start

```ts
import { getWeather, type WeatherStore } from "@aster/weather";

const localStorageStore: WeatherStore = {
  async get(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  async set(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* storage off or full */ }
  },
};

export async function quickStart(): Promise<string> {
  const report = await getWeather({ lat: 41.03, lon: -73.76 }, { store: localStorageStore });
  if (report === null) return "outside US coverage";
  const now = report.now;
  if (now === null || now.temperature === null) return "no current reading";
  const when = new Date(now.stamp.at).toISOString();
  return now.stamp.kind === "observed"
    ? `${now.temperature} F, measured at ${when}`
    : `${now.temperature} F, forecast for ${when}`;
}
```

`getWeather(coords, opts)` returns a `WeatherReport`, or `null` when the point is invalid or
outside US coverage. Each part of the report (`now`, `hourly`, `daily`, `alerts`,
`alertsReading`, `radar`, `sun`) can be `null` on its own when that part could not be answered.

## 4. What each function returns

| Function | Returns | `null` when |
|---|---|---|
| `getWeather(coords, opts?)` | `WeatherReport`: `place`, `now`, `hourly`, `daily`, `alerts`, `alertsReading`, `radar`, `sun`, `moon`, `fetchedAt` | The point is invalid or outside coverage. Any other part is `null` alone when it cannot be answered. |
| `getNow(coords, opts?)` | `NowReading`: one current reading, `stamp.kind` `observed` or `forecast` | Outside coverage, or no usable reading (section 7). |
| `getHourly(coords, opts?)` | `HourlyResult`: `hours`, `rain`, `snow`, `ice` amounts, `gridAvailable` | Outside coverage, or no usable forecast (section 6). |
| `getDaily(coords, opts?)` | `DailyResult`: `days`, one entry per date | Outside coverage, or no usable forecast. |
| `getAlerts(coords, opts?)` | `WeatherAlert[]`. An empty list means no alert is active. | Outside coverage, or the alerts request failed with no list young enough to serve (section 10). |
| `getAlertsReading(coords, opts?)` | `AlertsReading`: `alerts` (as `getAlerts`), `fetchedAt`, `stale` | The same cases as `getAlerts`. |
| `getRadarRain(coords, opts?)` | `RadarRain`: `rainingNow`, `recentRain`, `intensity`, `latestFrameAt`, `checkedAt`, `bridgeFrames` | Invalid coordinates, the radar could not answer, or no frame is inside `MAX_FRAME_AGE_MS`. `null` means unknown, never dry. |
| `getSun(coords, opts?)` | `SunTimes`: `sunrise`, `sunset`, `firstLight`, `lastLight`, `dayLengthMs` | Outside coverage, the point lookup failed, or there is no sun data for the venue's current date. |
| `getMoon(at)` | `MoonPhase`: `fraction`, `illumination`, `name` | `at` is not a finite time. Makes no request. |
| `getEventWeather(coords, eventStart, opts?)` | `EventReading`: `hour`, `strip`, `isRainWarning`, `isSevereWarning`, `stamp` | The time is unusable, the event is more than 7 days ahead or more than 1 day past (no request made), outside coverage, the forecast is unavailable, or no forecast hour is within `MAX_FORECAST_HOUR_GAP_MS` of the start. |

## 5. What a reading says about itself

Station readings, forecasts and the event reading carry a `Stamp`:

| Field | Meaning |
|---|---|
| `kind` | `observed` (a station measurement) or `forecast` (an official forecast). |
| `at` | Epoch ms the reading is for: the observation time, or the start of the forecast hour. For hourly and daily forecasts, the time NWS issued the forecast (or, when NWS gives none, the time the engine read the response). |
| `fetchedAt` | Epoch ms the engine fetched it. |
| `stale` | `true` whenever the reading is served past its freshness window, from memory or from the store. |
| `source` | `nws-station` or `nws-forecast`. |

Alerts, sun times, the moon and the radar carry no `Stamp`. An alert list carries its own pair: `getAlertsReading` and `WeatherReport.alertsReading` return `fetchedAt` and `stale` beside the list (section 10). An alert is dated by its own `onset` and
`ends` times. `SunTimes` is dated by its `sunrise` and `sunset`. `MoonPhase` is dated by the time you
pass to `getMoon(at)`. A radar answer is dated by `checkedAt` (the fetch that produced it) and by its
frame times, `latestFrameAt` and `bridgeFrames` (section 9). `getAlerts` and `WeatherReport.alerts` return the list alone; to know when it was fetched, or whether it is a copy served after a failed refresh, use `getAlertsReading` or `WeatherReport.alertsReading`.

Label a reading by its `kind`:

```ts
const label =
  now.stamp.kind === "observed"
    ? `measured at ${new Date(now.stamp.at).toISOString()}`
    : `forecast for ${new Date(now.stamp.at).toISOString()}`;
```

A radar claim does not change the stamp. It is marked on the reading with `rainSource: "radar"`
and, on the current reading, `radarAt` (the claiming frame's own time).

**Missing values are `null`, never `0`.** A measurement that NWS did not give is `null`. Warning
flags do not fire on `null`. Render `null` as a dash, never as zero. A missing condition is `null`
too, never clear sky.

**Times are epoch ms.** Every engine time (`Stamp.at`, hour `timestamp`, alert `onset` and `ends`)
is an absolute epoch-ms number. Do not parse local time strings to match hours.

## 6. How old a reading may be

These are the constants in `src/provenance.ts`, `src/nws/alerts.ts`, `src/nws/observations.ts`
and `src/radar.ts`. A reading past its freshness window is fetched again. If that fails, it is
served stale until its maximum age. Past its maximum age a reading is dropped, never shown.

| Reading | Fresh for | Served stale until | Constant |
|---|---|---|---|
| Current (`getNow`) | 10 min | 3 h | `FRESH_MS.now`, `MAX_AGE_MS.now` |
| Hourly forecast | 60 min, or 5 min when the grid was missing | 12 h | `FRESH_MS.hourly`, `MAX_AGE_MS.hourly`, `GRID_RETRY_AFTER_MS` |
| Seven-day forecast | 60 min | 24 h | `FRESH_MS.daily`, `MAX_AGE_MS.daily` |
| Alerts | 5 min | 60 min | `FRESH_MS.alerts`, `ALERT_MAX_STALE_MS` |
| Radar answer | 4 min | 15 min | `FRESH_MS.radar`, `MAX_AGE_MS.radar` |
| Radar frame (for a claim) | not cached | not served stale; a frame older than 20 min never claims | `MAX_FRAME_AGE_MS` |
| Station observation (used by `getNow`) | not cached | not served stale; used only while at most 90 min old | `MAX_OBSERVATION_AGE_MS` |
| Point (location lookup) | 24 h | no maximum age: an expired point is served while it is refreshed, and when a refresh fails | `FRESH_MS.point` |

An alert stops being returned when its end time (`ends`, or `expires` if there is none) is reached.
An alert with no end time stays until NWS stops sending it (section 10).

## 7. How `getNow` chooses a reading

The ladder in `load()` in `src/now.ts`, in order:

1. Ask for the point's station list. The engine keeps the order NWS gives and tries the first two (a literal `slice(0, 2)` in `src/now.ts`; there is no named constant).
2. For each of those two, read the latest observation. It is used when it has a temperature and
   is at most `MAX_OBSERVATION_AGE_MS` (90 min) old. A station that fails is skipped, and the
   failure is reported once.
3. Otherwise use the forecast hour that contains the current time, from `getHourly`
   (`stamp.kind` is `forecast`).
4. Otherwise there is no reading from this fetch. The engine serves the reading it holds if it is
   inside `MAX_AGE_MS.now` (stale), then the stored last-good reading inside the same bound
   (stale), and otherwise returns `null`.

When the point lookup fails, `getNow` skips the ladder. It serves the reading it holds in memory
under the same bound, then the stored reading, with no request. A reading from the store is
always stale. Only an observed reading is written to the store.

## 8. Hours and the forecast grid

- **The hours.** Each hour comes from NWS's hourly forecast periods: `temperature`, the
  probability of precipitation, `windSpeed` (mph; for a range, the largest number), wind
  direction, `condition`, `isDay` and `windy`. A temperature in Celsius is converted to F.
- **The grid.** NWS's forecast grid is a set of layers, each a list of values over time intervals.
  It supplies the fields the periods do not carry: `feelsLike` (apparent temperature), `windGust`,
  `cloudCover` (sky cover), `humidity`, `dewPoint`, `thunderProbability`, `visibility` and
  `heatStress` (wet-bulb globe temperature). It also supplies the `rain`, `snow` and `ice` amounts,
  in inches, one block per grid interval.
- **The join.** An hour takes each grid value whose interval contains the hour's start.
- **A missing grid.** The hours still come. The grid fields are `null`, `gridAvailable` is `false`,
  and the grid is asked again after `GRID_RETRY_AFTER_MS` (5 min).
- **A point that has moved.** If the forecast answers 404, the point is looked up again once.

## 9. Radar

- **Radar may only add rain.** A radar claim can change only `condition`, `rainSource` and
  `radarAt`. It never removes precipitation: a reading that already shows precipitation is left
  alone (`applyRadarToNow` in `src/radar.ts`).
- **The echo.** NOAA's base reflectivity service answers for the point. Each pixel becomes one
  intensity: `none`, `light`, `rain`, `heavy`, `storm` or `unknown-echo`. `rain`, `heavy` and
  `storm` claim rain. `light` (blue) claims rain only when humidity is at or above
  `SATURATED_HUMIDITY` (95). `unknown-echo` and `none` never claim.
- **Two frames.** Only the two newest frames can claim (`BRIDGE_FRAMES`, 2).
- **The age of a frame.** A frame older than `MAX_FRAME_AGE_MS` (20 min) is dropped when the radar
  is read. A claim is checked again at the moment it is made, with the clock then, so a frame that
  has aged out cannot claim. Frames dated after the current time are kept, because a device clock
  may run behind the radar's.
- **The stamp.** A claim is stamped with its own frame's time (`radarAt`), not with the time now.
- **Requests.** One request per call, with a timeout of `RADAR_TIMEOUT_MS` (4000 ms) at most. A
  caller's `timeoutMs` can shorten that budget, never lengthen it. The radar is not retried.
- **A failed read.** The point is held for `RADAR_RETRY_AFTER_MS` (60 s): no request and no
  `onError` inside the hold. An answer still in the cache serves for up to `MAX_AGE_MS.radar`
  (15 min).
- **When it is asked.** `getNow` and `getDaily` ask only with `radar: true`. `getWeather` asks
  unless `radar: false`, asks once per call, and applies the claim to the current reading and to
  today's daily entry.
- **Today's daily entry.** `getDaily` applies a claim only to the entry for the venue's current
  date, and only when the point has a time zone. The claim goes on the day condition, or on the
  night condition when there is no day condition. The daily path has no humidity, so a `light`
  echo never claims there.
- **Snow.** At or below 34 F, the freezing test in `radarCondition` (a literal in `src/radar.ts`;
  it is not a named constant), `heavy` and `storm` echo give `snow` and other echo gives
  `light-snow`. In `getDaily` the test uses the day's high. Above it, `storm` gives `thunderstorm`,
  `heavy` gives `rain` and other echo gives `light-rain`.
- **Not verified.** Whether NOAA's radar service answers a browser's cross-origin request is
  **not verified**. Until it is, treat radar as available on a server only.

## 10. Alerts

- **Official text, unedited.** Each alert carries the NWS text exactly as NWS sent it: `event`,
  `headline`, `description`, `instruction`, `areaDesc`, and `nwsHeadline` (the first NWS headline
  parameter). `sender` is the NWS sender name. Nothing is trimmed or re-wrapped.
- **Level.** `severity` is one of `Extreme`, `Severe`, `Moderate`, `Minor` or `Unknown`; any other
  value is `Unknown`. `level` is 3 for Extreme and Severe, 2 for Moderate, and 1 for Minor and
  Unknown. The list is sorted by highest level first, then earliest `onset`, with no onset last.
- **Which alerts are kept.** Only alerts whose status is `Actual` and whose message type is not
  `Cancel`. An alert with no id or no event is dropped.
- **When an alert stops.** An alert is no longer returned once its `ends` time (or `expires`) is
  reached. An alert with no end time stays until NWS stops sending it.
- **Cache.** The list is fresh for `FRESH_MS.alerts` (5 min). When a refresh fails, the last list
  is served for up to `ALERT_MAX_STALE_MS` (60 min).
- **When it was fetched.** `getAlertsReading` returns `{ alerts, fetchedAt, stale }`. `fetchedAt` is
  when the list was fetched (epoch ms), not the time of the call. `stale` is `true` when a refresh
  failed and this is the earlier list, still inside `ALERT_MAX_STALE_MS`; `onError` reports the
  failed refresh. `WeatherReport.alertsReading` is the same value, or `null` when the list could
  not be answered; `WeatherReport.alerts` is its `alerts`, unchanged in shape. `getAlerts` returns
  the list alone. An alert still stops at its `ends` time in a stale list.

## 11. Sun and moon

- **Sun (`getSun`).** `sunrise`, `sunset`, `firstLight` (civil twilight begins) and `lastLight`
  (civil twilight ends) come from the NWS point data, with `dayLengthMs`. Only the venue's current
  local date is returned, never another day's times. `getSun` reads the cached point on every call, so data for today is used as soon as it is there. When the cached point is from another day, the point is looked up again at most once per `SUN_REFRESH_AFTER_MS` (15 min) per coordinate, and simultaneous callers share that one lookup. Inside that window, while the cached point is still from another day, the answer is `null` with no request.
- **Moon (`getMoon`).** A pure calculation from a time, with no network. It counts from
  `REFERENCE_NEW_MOON` (2000-01-06 18:14 UTC) in steps of the mean synodic month,
  `SYNODIC_MONTH_MS`. `fraction` is the position in the cycle, `illumination` runs from 0 to 1,
  and `name` is one of eight phases. This is a mean-cycle calculation, not an ephemeris, so a phase
  boundary can differ from an almanac.

## 12. Event weather

`getEventWeather(coords, eventStart, opts)`, in `src/event.ts`. `eventStart` is an ISO string, an
epoch-ms number or a `Date`.

- **No request** when the time is unusable, more than 7 days ahead, or more than 1 day past.
  Those bounds are literals in `src/event.ts`.
- **The hour.** The forecast hour nearest the start. When two are equally near, the earlier one.
  If the nearest is more than `MAX_FORECAST_HOUR_GAP_MS` (6 h) away, the answer is `null`.
- **The strip.** The forecast hours from 2 h before the start to 4 h after it, up to four hours.
  The two-hour and four-hour offsets and the cap of four are literals in `src/event.ts`.
- **`isRainWarning`** is true when the hour's probability of precipitation is above 40 (a literal).
- **`isSevereWarning`** is true when any of these holds: the probability of precipitation is above
  70 (literal); the temperature is below 20 or above 100 F (literals); the sustained wind is above
  `SEVERE_WIND_MPH` (40 mph); or the gust is above `SEVERE_GUST_MPH` (45 mph).
- **Unknown values never raise a flag.** A `null` reading is unknown, and it fires nothing.

## 13. Options

| Option | Use |
|---|---|
| `fetchImpl` | The injected fetch (type `FetchImpl`). Every request goes through it. This is the SSRF boundary. An NWS or NOAA request is refused before it is made unless its origin is one of the two hosts in `src/nws/http.ts`, and a URL taken from an NWS response is used only when it is under `api.weather.gov`. The Open-Meteo fetchers call their own fixed host. Default: global `fetch`. |
| `timeoutMs` | Timeout for each request, in ms. Default `FETCH_TIMEOUT_MS` (5000). The radar request never waits longer than `RADAR_TIMEOUT_MS` (4000). |
| `onError(err, ctx)` | Called once for each fetch that ultimately fails, after its retry and just before the stale or empty fallback. Never once per attempt. `ctx` is `{ call, lat, lon }`, where `call` is one of the `WeatherCall` labels: `getPoint`, `getStations`, `getLatestObservation`, `getGrid`, `getHourly`, `getDaily`, `getNow`, `getAlerts`, `getRadarRain`, and the four Open-Meteo labels `fetchForecast`, `getCurrentWeather`, `getDailyForecast` and `getNowcast` (section 19). A hook that throws or rejects is ignored. |
| `userAgent` | Sent as the `User-Agent` header on every NWS and NOAA request. NWS asks servers to identify themselves. **Servers only:** a browser cannot set this header. Default: none sent. |
| `store` | A `WeatherStore` for last-good readings (section 14). Default: none. |
| `now` | The clock, as `() => number` in epoch ms. Used for every freshness and age check. Default `Date.now`. |
| `radar` | `getNow` and `getDaily` ask the radar only when `true` (default off). `getWeather` asks unless `false`. |

## 14. A store for last-good readings

```ts
export interface WeatherStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
```

The store holds serialized readings as `{ "fetchedAt": <epoch ms>, "data": ... }`. The engine
writes:

| Reading | Key |
|---|---|
| An observed current reading (`getNow`, from a station) | `aw:now:` + `lat,lon` |
| Each successful hourly load | `aw:hourly:` + `lat,lon` |
| Each successful seven-day load | `aw:daily:` + `lat,lon` |

Coordinates in a key have at most four decimals, with trailing zeros dropped (the `fmt` helper in each module, a literal `toFixed(4)`). Alerts, radar
answers, points, grids, stations and sun times are not stored.

The store is read in two cases: when a refresh fails and nothing usable is in memory, and when the
point lookup fails (`getNow`, `getHourly` and `getDaily` read the in-memory reading first, then the
store). A stored reading past its maximum age (section 6) is not used. A `get` or `set` that
rejects or throws is treated as a miss and never breaks the engine.

The `localStorage` adapter is in section 3. It is type-checked against this interface in
`src/__tests__/publicSurface.types.ts`.

## 15. When something fails

The engine never throws. A failed part becomes `null`, a stale reading or an empty list.

- **`onError`** fires once for each fetch that ultimately fails. A hook that throws is ignored.
- **`clearWeatherCaches()`** clears every in-memory cache and hold of the engine. It does not touch your `store`, and it does not clear the Open-Meteo caches, which have their own clear functions.
- **Retry.** The NWS fetches that run through the cache (the point, the station list, the grid,
  the hourly and seven-day forecasts, and the alerts) retry once after `FETCH_RETRY_BACKOFF_MS`
  (500 ms). The current reading and the radar are not retried at their own level. A station
  observation is requested once.
- **Holds.** While a hold is in force, no request is made and no `onError` is raised:
  - the point lookup: `POINT_RETRY_AFTER_MS` (30 s);
  - the radar: `RADAR_RETRY_AFTER_MS` (60 s);
  - the grid: a forecast loaded without its grid is asked again after `GRID_RETRY_AFTER_MS` (5 min);
  - the sun: a point refresh for sun is attempted at most once per `SUN_REFRESH_AFTER_MS` (15 min).

  A hold applies only while the clock is at or after the failure, and inside the limit.

### The resilience chain (`src/cache.ts`)

Every cache is a `WeatherCache` in `src/cache.ts`. `get()` serves the Open-Meteo fetchers, the
point and the station list. `getWithMeta()` serves the NWS forecasts, the grid, alerts, the current
reading and the radar, and it never serves an expired value before trying the loader. Each cache
holds at most 200 keys, dropping the least recently used.

| # | Rung | Behaviour |
|---|---|---|
| 1 | **Fresh hit** | A value inside its freshness window is returned, with no fetch. |
| 2 | **Stale-while-revalidate** (`get()` only) | An expired value is returned at once and a refresh runs behind it, deduplicated. |
| 3 | **Cold fetch, deduplicated** | Concurrent misses on one key share one fetch. |
| 4 | **One retry** | The caches built with the shared resilient profile retry once, after `FETCH_RETRY_BACKOFF_MS` (500 ms). The current-reading and radar caches do not retry. |
| 5 | **Stale on error** | The last known good value is served. Its timestamp is not refreshed, so the next call tries again. `getWithMeta()` serves it only within the age the call allows (section 6). |
| 6 | **Typed empty** | `[]` or `null`, depending on the function. |

## 16. Conditions and icons

`Condition` is the engine's vocabulary. It has 25 values:

`clear`, `mostly-clear`, `partly-cloudy`, `mostly-cloudy`, `overcast`, `haze`, `smoke`, `dust`,
`hot`, `cold`, `fog`, `drizzle`, `light-rain`, `rain`, `heavy-rain`, `light-snow`, `snow`,
`heavy-snow`, `wintry-mix`, `sleet`, `freezing-rain`, `blizzard`, `thunderstorm`,
`tropical-storm`, `tornado`.

- `conditionLabel(condition)` gives a sentence-case label, for example "Light rain".
- `isPrecipitation(condition)` is true for each condition from drizzle to thunderstorm in the severity order (that range includes the snow and ice types), and for a tropical storm.
- `conditionFromNwsIcon(url)` reads an NWS icon URL into `{ condition, windy, isDay }`. The
  keyword table is `NWS_ICON_CONDITION`. When a URL names two sky states, the more severe one
  wins. A `wind_` prefix sets `windy`.

**The Sky icons draw 14 values only:** `clear`, `mostly-clear`, `partly-cloudy`, `overcast`, `fog`,
`drizzle`, `light-rain`, `rain`, `freezing-rain`, `heavy-rain`, `light-snow`, `snow`, `heavy-snow`
and `thunderstorm`. Night art is chosen by `isDay`. A condition outside those 14 has no icon until
`v0.10.0`, so render its label instead: `mostly-cloudy`, `wintry-mix`, `sleet`, `blizzard`, `haze`,
`smoke`, `dust`, `hot`, `cold`, `tornado` and `tropical-storm`.

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

## 17. What is not in this package

Still to come, with no dates:

- **Icons** for the conditions above, and measurement glyphs: `v0.10.0`.
- **Page parts** (`@aster/weather/ui`) for everything in `v0.8.0`: `v0.11.0`.
- **UV index, forecaster outlooks** (tropical storms, severe-storm and hazard outlooks) **and air
  quality** (which needs an account key on a server), with their parts: `v0.12.0`.

Not planned:

- **Coverage outside the US.** Outside it the engine answers `null`.
- **Notifications, and any go or no-go advice.**
- **Lightning and pollen.** No free official source.
- **Marine, tide and river data.**
- **A forecast model of this package's own, an accuracy score, or stored history.**

### Known limits

- **Radar from a browser** is unverified (section 9).
- **NWS rate limits** are not disclosed, so the package cannot say how many requests a venue can
  make. The NWS disclaimer says it may block an address or a type of query that affects its service, so send a `userAgent` from a server and keep the caches in place.
- **Station observations (B-014, accepted).** A station observation that fails once is not asked
  again within the same load. The next load asks again. A retry was not added, because it would
  double the wait each time a station hangs.

## 18. Sources and terms

- **NWS data.** The National Weather Service disclaimer says its information may be used without
  charge for any lawful purpose. The same three conditions apply as for all NWS information: do not claim it as your own, do not imply endorsement by or affiliation with NOAA or the NWS, and do not modify it and present it as official. This was read on
  2026-11-27 and is recorded in the design doc. Nothing in this package implies NWS endorsement.
- **No credit line** is required by this package for NWS data. The NWS name appears only where an
  alert's issuer is shown.
- **NOAA radar.** The radar answer comes from the National Weather Service's map service. Its own metadata names NOAA and the National Weather Service as the source, and the NWS disclaimer (https://www.weather.gov/disclaimer) says NOAA and NWS data presented through map services is in the public domain. Both were read on 2026-11-27. The same three conditions apply as for all NWS information: do not claim it as your own, do not imply endorsement by or affiliation with NOAA or the NWS, and do not modify it and present it as official.
- **The hosts** are the two constants `NWS_API` (`https://api.weather.gov`) and `NOAA_MAPS`
  (`https://mapservices.weather.noaa.gov`) in `src/nws/http.ts`. Every NWS and NOAA request is refused
  before it is made unless its origin is one of them. The deprecated Open-Meteo fetchers call their own host (section 19).
- **Open-Meteo** is covered in section 19.

## 19. Deprecated: the Open-Meteo fetchers

These functions are deprecated. Each one's behaviour is unchanged, and each is removed in `v1.0.0`,
after the consumers move:

| Function | Replacement |
|---|---|
| `fetchForecast(coords, opts?)` | `getHourly` |
| `getCurrentWeather(coords, opts?)` | `getNow` |
| `getDailyForecast(coords, opts?)` | `getDaily` |
| `getNowcast(coords, opts?)` | `getRadarRain` for "is it raining now". It is not a like-for-like replacement: `getNowcast` is a 15-minute precipitation amount series, and the radar answers only whether rain shows now. |
| `getWeatherForEvent(coords, eventStartISO, opts?)` | `getEventWeather` |

Their caches run for `CACHE_TTL_MS` in each module: 60 min for the hourly and daily forecasts, 15
min for the current conditions and 10 min for the nowcast. They use the same cache as above.

Open-Meteo's free API is for non-commercial use only. Use the replacements above for a commercial
project.

```ts
import { fetchForecast } from "@aster/weather";

const hours = await fetchForecast({ lat: 41.13, lon: -73.72 });
```

These fetchers return `[]` or `null` on failure, never throw, and take the same `fetchImpl` and
`onError` options as the engine.

### Weather codes and hours (Open-Meteo)

- **`weatherCode`, `icon` and `description` are `null` when Open-Meteo reports no usable code.** A
  missing, `null` or non-numeric code gives `null` for all three. A real `0` stays clear sky. A
  number that is not a WMO code keeps its number, with `icon` and `description` `null`. Guard the
  icon before you render it:

  ```tsx
  {w.icon && (
    <SkyPanel condition={w.icon} isDay={w.isDay}><WeatherIcon condition={w.icon} isDay={w.isDay} /></SkyPanel>
  )}
  ```

  > ### ⚠ Breaking from v0.6.x
  > **`weatherCode`, `icon` and `description` can now be `null`.** Before v0.7.0 a missing
  > code was reported as `0` ("Clear sky"). Migrate:
  > - Guard on `icon !== null` before rendering `<WeatherIcon>` or `<SkyPanel>`.
  > - Render `—` for a `null` `description`, never "Clear sky".
  > - Treat a `null` `weatherCode` as unknown. Do not compare it with `0`.
  >
  > `weatherInfoOrNull(code)` is the new nullable lookup. `getWeatherInfo` is unchanged.
  > It ships as a 0.x *minor*, but it is a **breaking** change; describe it that way.

- **Hourly timestamps are absolute.** The Open-Meteo hourly and nowcast requests carry
  `&timeformat=unixtime`, so hour matching is epoch arithmetic. Current and daily conditions
  request `timezone=auto`, and their sunrise and sunset are parsed with `parseOpenMeteoLocalTime`.
  Do not use that path for hour matching.

### Open-Meteo is CC-BY 4.0: visible attribution is required

Every consumer that renders data from this package must show a visible, linked credit:
**"Weather data by Open-Meteo"** → <https://open-meteo.com/>. This is a **licence
condition**, not decoration — removing it is a licensing regression, not a design choice.

**The data licence and the free API's terms are two different things** (owner ruling,
2026-11-27). The data is CC-BY 4.0, which allows commercial use with credit. The free API
is for non-commercial use only, by Open-Meteo's own
[terms](https://open-meteo.com/en/terms): "You may only use the free API services for
non-commercial purposes." A commercial project needs Open-Meteo's paid plan or another
source. An earlier version of this section said the opposite; it was wrong.

The replacement engine, on US government sources, has been in this package since `v0.8.0`
(section 1). Its design is in
[`docs/superpowers/specs/2026-11-27-one-weather-engine-design.md`](docs/superpowers/specs/2026-11-27-one-weather-engine-design.md).

This package is headless and cannot render the credit itself, so the obligation sits with
each consumer.

## 20. Versioning

**major** = shape / icon-key / behaviour break (coordinate a consumer bump) · **minor** =
additive · **patch** = behaviour-preserving fix. On 0.x a break ships as a minor — and is called "breaking" anyway (as v0.6.0 was). Full history in
[CHANGELOG.md](./CHANGELOG.md).

| Version | Contents | Kind |
|---|---|---|
| `v0.7.0` | The nullable weather code. | Breaking (shipped) |
| `v0.8.0` | The NWS and NOAA engine: current, hourly with the grid, seven-day, alerts, radar, sun and moon, the event function, provenance and the store. | Additive |
| `v0.9.0` | Alert freshness (`getAlertsReading`, B-018), the clock-step fix (B-017), and dev-dependency security. | Additive |
| `v0.10.0` | Icons and glyphs for the newer conditions and measurements. | Breaking for an exhaustive switch on the icon key |
| `v0.11.0` | Page parts for everything in `v0.8.0`. | Additive |
| `v0.12.0` | UV index, outlooks, air quality, and their parts. The design doc also lists heat stress here; the hourly heat-stress field is already in `v0.8.0`. | Additive |
| `v1.0.0` | Open-Meteo fetchers removed, after the consumers move. | Breaking |

A **minor or major tag is held** until the merge commit carries `[release-approved]`
(`.github/workflows/auto-tag.yml`). A release that carries design or shape cannot ship by
merely merging its PR.

## Scripts

```bash
pnpm build   # tsc -> dist/ (COMMITTED — rebuild in the same commit as any src/ change)
pnpm check   # typecheck only
pnpm test    # vitest + the dependency-gate self-test (node --test)
```
