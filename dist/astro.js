/**
 * Sun and moon. `getSun` reads the sun data the point lookup already carries,
 * and only for the venue's current local calendar day: another day's times are
 * never returned. `getMoon` is a pure calculation from a time, with no network.
 */
import { localDay } from "./localDay.js";
import { evictPoint, getPoint } from "./nws/point.js";
const SYNODIC_MONTH_MS = 29.530588853 * 86_400_000;
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
const PHASE_NAMES = [
    "New moon",
    "Waxing crescent",
    "First quarter",
    "Waxing gibbous",
    "Full moon",
    "Waning gibbous",
    "Last quarter",
    "Waning crescent",
];
/** The point's sun data when it has a zone, sunrise, sunset and a positive day length. */
function usableSun(point) {
    if (!point || point.timeZone === null || point.sun === null)
        return null;
    const dayLengthMs = point.sun.sunset - point.sun.sunrise;
    if (!Number.isFinite(dayLengthMs) || dayLengthMs <= 0)
        return null;
    return { sun: point.sun, zone: point.timeZone };
}
/** True when the sunrise falls on the same local calendar day as `now`. */
function isToday({ sun, zone }, now) {
    const today = localDay(now, zone);
    return today !== null && today === localDay(sun.sunrise, zone);
}
function toSunTimes({ sun }) {
    return {
        sunrise: sun.sunrise,
        sunset: sun.sunset,
        firstLight: sun.firstLight,
        lastLight: sun.lastLight,
        dayLengthMs: sun.sunset - sun.sunrise,
    };
}
/**
 * Today's sun times at the venue, or `null` when the point is outside coverage,
 * the lookup failed, or no sun data for today's local date is available. A cached
 * point from an earlier day is evicted and looked up once more; another day's
 * times are never returned. Never throws.
 */
export async function getSun(coords, opts = {}) {
    try {
        const now = opts.now?.() ?? Date.now();
        const first = usableSun(await getPoint(coords, opts));
        if (!first)
            return null;
        if (isToday(first, now))
            return toSunTimes(first);
        evictPoint(coords);
        const fresh = usableSun(await getPoint(coords, opts));
        return fresh && isToday(fresh, now) ? toSunTimes(fresh) : null;
    }
    catch {
        return null;
    }
}
/**
 * The moon at `at` (epoch ms), from the mean synodic month counted from the new
 * moon of 2000-01-06 18:14 UTC. `null` for a non-finite time. Never throws.
 */
export function getMoon(at) {
    if (!Number.isFinite(at))
        return null;
    const age = ((((at - REFERENCE_NEW_MOON) % SYNODIC_MONTH_MS) + SYNODIC_MONTH_MS) %
        SYNODIC_MONTH_MS);
    let fraction = age / SYNODIC_MONTH_MS;
    if (fraction >= 1)
        fraction = 0; // float rounding at the wrap is the new moon
    const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
    const name = PHASE_NAMES[Math.round(fraction * 8) % 8];
    return { fraction, illumination, name };
}
//# sourceMappingURL=astro.js.map