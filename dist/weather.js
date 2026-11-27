/**
 * The one-call report: every part of the engine for one point, in one object.
 * The parts run concurrently and each fails alone (a failed part is `null`).
 * Radar is asked once, here, and applied to the current reading and today's
 * daily cell with the pure functions in `radar.ts`.
 */
import { getAlerts } from "./nws/alerts.js";
import { getDaily } from "./nws/daily.js";
import { getHourly } from "./nws/hourly.js";
import { lookupPoint } from "./nws/point.js";
import { getNow } from "./now.js";
import { getRadarRain, applyRadarToNow, applyRadarToToday } from "./radar.js";
import { getMoon, getSun } from "./astro.js";
import { localDay } from "./localDay.js";
/** A part's answer, or `null` when it throws: one part never rejects the report. */
async function part(load) {
    try {
        return await load();
    }
    catch {
        return null;
    }
}
/**
 * Every part of the engine for a coordinate, or `null` when the point is invalid
 * or outside NWS coverage (404). Those cases make no other request. When the
 * point lookup failed, the report still comes: the place has no time zone, city
 * or state, the sun is `null`, and the forecast parts come from their stores
 * (or `null`). Alerts and radar are asked as usual. Radar is asked once unless
 * `radar: false`. No `onError` of its own; a failing part reports through its own
 * loader, and a failed point lookup reports once through `getPoint`. Never throws.
 */
export async function getWeather(coords, opts = {}) {
    const nowMs = opts.now?.() ?? Date.now();
    const lookup = await part(() => lookupPoint(coords, opts));
    if (!lookup || lookup.status === "outside")
        return null;
    const point = lookup.status === "ok" ? lookup.point : null;
    // Each part is asked without radar, so the radar is asked only here, once.
    const partOpts = { ...opts, radar: false };
    const wantRadar = opts.radar !== false;
    const [now, hourly, daily, alerts, sun, radar] = await Promise.all([
        part(() => getNow(coords, partOpts)),
        part(() => getHourly(coords, partOpts)),
        part(() => getDaily(coords, partOpts)),
        part(() => getAlerts(coords, partOpts)),
        point ? part(() => getSun(coords, partOpts)) : Promise.resolve(null),
        wantRadar ? part(() => getRadarRain(coords, opts)) : Promise.resolve(null),
    ]);
    const timeZone = point?.timeZone ?? null;
    const today = timeZone === null ? null : localDay(nowMs, timeZone);
    // The radar claim is made now, after every part has loaded: a frame's age is taken at that moment (B-013).
    const claimAt = (opts.now ?? Date.now)();
    return {
        place: {
            lat: coords.lat,
            lon: coords.lon,
            timeZone,
            city: point?.city ?? null,
            state: point?.state ?? null,
        },
        now: now && radar ? applyRadarToNow(now, radar, claimAt) : now,
        hourly,
        daily: daily && radar && today !== null
            ? { ...daily, days: applyRadarToToday(daily.days, radar, today, claimAt) }
            : daily,
        alerts,
        radar,
        sun,
        moon: getMoon(nowMs),
        fetchedAt: nowMs,
    };
}
//# sourceMappingURL=weather.js.map