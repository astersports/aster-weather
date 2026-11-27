import { evictPoint, getPoint } from "./point.js";
import { nwsJson } from "./http.js";
function rec(v) {
    return typeof v === "object" && v !== null ? v : null;
}
/**
 * Fetch `urlOf(point)` for the periods. `label` prefixes the error text.
 */
export async function fetchPeriods(coords, first, opts, urlOf, label) {
    let current = first;
    let body = await nwsJson(urlOf(current), opts);
    if (body === null) {
        // The point may have moved to another grid: look it up afresh, once.
        evictPoint(coords);
        const fresh = await getPoint(coords, opts);
        if (!fresh)
            throw new Error(`${label}: point gone after a 404`);
        current = fresh;
        body = await nwsJson(urlOf(current), opts);
        if (body === null)
            throw new Error(`${label}: forecast 404 twice`);
    }
    const props = rec(rec(body)?.properties);
    if (!props || !Array.isArray(props.periods))
        throw new Error(`${label}: no periods`);
    return { point: current, props, periods: props.periods };
}
//# sourceMappingURL=periods.js.map