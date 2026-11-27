/**
 * Read a last-good reading written by `writeLastGood`. Returns `null` for every
 * case that is not a usable reading: no store, a missing key, a value that is
 * not JSON, no finite `fetchedAt`, older than `maxAgeMs`, or a `get()` that
 * rejects or throws. Never throws.
 */
export async function readLastGood(store, key, maxAgeMs, now) {
    if (!store)
        return null;
    let raw;
    try {
        raw = await store.get(key);
    }
    catch {
        return null;
    }
    if (typeof raw !== "string")
        return null;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null)
        return null;
    const { fetchedAt, data } = parsed;
    if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt))
        return null;
    if (now - fetchedAt > maxAgeMs)
        return null;
    return { data: data, fetchedAt };
}
/**
 * Save a reading as `{ fetchedAt, data }`. Fire and forget: never throws and
 * never leaves a rejected promise behind. Does nothing without a store.
 */
export function writeLastGood(store, key, data, now) {
    if (!store)
        return;
    try {
        const pending = store.set(key, JSON.stringify({ fetchedAt: now, data }));
        void Promise.resolve(pending).catch(() => { });
    }
    catch {
        // A throwing set() is swallowed: the last-good store is best effort.
    }
}
//# sourceMappingURL=store.js.map