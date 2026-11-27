/**
 * Shared per-coordinate fetch cache — the single home for the cache + TTL +
 * in-flight dedup + stale-on-error behavior that used to be triplicated across
 * forecast.ts / current.ts / daily.ts (audit pattern ε).
 *
 * Guarantees, all locked by tests:
 *  - **TTL:** a value newer than `ttlMs` short-circuits without a fetch.
 *  - **Bounded (LRU):** at most `maxEntries` keys are retained; the least-
 *    recently-used entry is evicted on insert (WX-P2-7 — the old Maps grew
 *    without bound in a long-running multi-venue server).
 *  - **In-flight dedup:** concurrent misses on the same key share one fetch.
 *  - **Stale-on-error:** if the loader throws, the last-known-good value is
 *    served (without refreshing its timestamp, so the next call still retries);
 *    if there is none, `empty` is returned. The engine never throws to callers.
 *  - **Retry (M5, v0.5.0):** the loader is retried up to `behavior.retries`
 *    times with a fixed backoff before falling through to stale-or-empty, so a
 *    single transient blip doesn't serve stale for the whole TTL window.
 *  - **Stale-while-revalidate (M6, v0.5.0):** when `behavior.swr` is on and an
 *    expired-but-present entry exists, it is served IMMEDIATELY and a background
 *    refresh runs (deduped), so no interactive caller blocks on a cold fetch
 *    once the key is warm.
 *  - **onError (M1, v0.5.0):** the optional per-call `onError` fires ONCE when a
 *    fetch ultimately fails (after retries), immediately before the stale/empty
 *    fallback — the single channel that makes an Open-Meteo outage observable.
 */
import { safeReport } from "./helpers.js";
/** `freshFor` read from the value; a throw means the cache's own ttl (the engine never throws). */
function freshOrTtl(freshFor, data, ttlMs) {
    try {
        return freshFor(data);
    }
    catch {
        return ttlMs;
    }
}
/**
 * A reading is fresh only while the clock is at or after the fetch and less than the limit past it. A clock that stepped back (negative age) is not fresh, so a reading "from the future" is refetched, not served as fresh for as long as the step lasted (B-017).
 */
const isFresh = (age, limit) => age >= 0 && age < limit;
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export class WeatherCache {
    constructor(ttlMs, maxEntries = 200, behavior = {}) {
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
        this.store = new Map();
        /** Blocking cold-fetch dedup (a caller with no cached value to fall back on). */
        this.inflight = new Map();
        /** Blocking dedup for getWithMeta (its jobs resolve to CacheMeta, not T). */
        this.metaInflight = new Map();
        /** SWR background-refresh dedup — kept separate so it never satisfies a cold caller. */
        this.refreshing = new Set();
        this.retries = behavior.retries ?? 0;
        this.retryBackoffMs = behavior.retryBackoffMs ?? 0;
        this.swr = behavior.swr ?? false;
        this.sleep = behavior.sleep ?? realSleep;
    }
    /**
     * Return the cached value for `key` if fresh; otherwise run `loader` (with
     * in-flight dedup + bounded retry) and cache its result. On loader failure,
     * serve stale-or-`empty` and fire `onError` once. `loader` should throw on any
     * failure so the stale fallback fires. With SWR on, an expired-but-present
     * entry is returned immediately while a background refresh runs.
     */
    async get(key, loader, empty, onError, now = Date.now) {
        const cached = this.store.get(key);
        if (cached && isFresh(now() - cached.fetchedAt, this.ttlMs)) {
            // LRU touch: re-insert so this key is now most-recently-used.
            this.store.delete(key);
            this.store.set(key, cached);
            return cached.data;
        }
        // SWR: expired but we have a last-known-good — serve it now, refresh behind.
        if (this.swr && cached) {
            this.backgroundRefresh(key, loader, onError);
            return cached.data;
        }
        // Cold miss (or SWR off): block, deduped, with retry + stale-on-error.
        const existing = this.inflight.get(key);
        if (existing)
            return existing;
        const job = (async () => {
            try {
                return (await this.runWithRetry(key, loader)).data;
            }
            catch (err) {
                safeReport(onError, err);
                // Stale-on-error: last-known-good if present (timestamp NOT refreshed,
                // so the entry stays expired and the next call retries), else empty.
                return cached?.data ?? empty;
            }
            finally {
                this.inflight.delete(key);
            }
        })();
        this.inflight.set(key, job);
        return job;
    }
    /**
     * Age-bounded read for callers that must know how old a value is.
     *
     * - A fresh entry (younger than the TTL) is returned with `stale: false`.
     * - Otherwise the loader runs (deduped, with the same bounded retry). On
     *   success the value is cached with `fetchedAt` = the time of this fetch.
     * - If the loader ultimately fails, `onError` fires once. An entry no older
     *   than `maxStaleMs` is returned with `stale: true` and its timestamp is NOT
     *   refreshed. An older entry is dropped. With no usable entry, `empty` is
     *   returned with `stale: false`.
     *
     * Unlike `get()`, an expired entry is never returned before the loader has
     * been tried (no stale-while-revalidate), so an expired reading is never
     * shown as fresh. Never throws.
     *
     * `now` supplies the clock for both age checks and fetch times.
     *
     * `freshFor`, when given, reads how long a cached value stays fresh, from the
     * value itself. The result is capped by the cache's own TTL, so it can only
     * shorten freshness. Without it the TTL alone decides.
     */
    async getWithMeta(key, loader, empty, onError, maxStaleMs = Infinity, now = Date.now, freshFor) {
        const cached = this.store.get(key);
        const freshMs = cached && freshFor ? Math.min(this.ttlMs, freshOrTtl(freshFor, cached.data, this.ttlMs)) : this.ttlMs;
        if (cached && isFresh(now() - cached.fetchedAt, freshMs)) {
            // LRU touch, as in get().
            this.store.delete(key);
            this.store.set(key, cached);
            return { data: cached.data, fetchedAt: cached.fetchedAt, stale: false };
        }
        const existing = this.metaInflight.get(key);
        if (existing)
            return existing;
        const job = (async () => {
            try {
                const fetched = await this.runWithRetry(key, loader, now);
                return { data: fetched.data, fetchedAt: fetched.at, stale: false };
            }
            catch (err) {
                safeReport(onError, err);
                // Read the store now, not the value captured before the fetch.
                const entry = this.store.get(key);
                if (entry) {
                    if (now() - entry.fetchedAt <= maxStaleMs) {
                        return { data: entry.data, fetchedAt: entry.fetchedAt, stale: true };
                    }
                    this.store.delete(key);
                }
                return { data: empty, fetchedAt: now(), stale: false };
            }
            finally {
                this.metaInflight.delete(key);
            }
        })();
        this.metaInflight.set(key, job);
        return job;
    }
    /**
     * Read a cached entry without loading anything. A fresh entry comes back
     * `stale: false`; an entry past its freshness but no older than `maxStaleMs`
     * comes back `stale: true`, with its original `fetchedAt`; no entry, or an older
     * one, is `null`. Never calls a loader, never reports, never waits, and never
     * changes the cache.
     *
     * Freshness is decided as in `getWithMeta`: the cache's ttl, shortened by
     * `freshFor` when given (a throw falls back to the ttl).
     */
    peek(key, maxStaleMs = Infinity, now = Date.now, freshFor) {
        const cached = this.store.get(key);
        if (!cached)
            return null;
        const freshMs = freshFor ? Math.min(this.ttlMs, freshOrTtl(freshFor, cached.data, this.ttlMs)) : this.ttlMs;
        const age = now() - cached.fetchedAt;
        if (isFresh(age, freshMs))
            return { data: cached.data, fetchedAt: cached.fetchedAt, stale: false };
        if (age <= maxStaleMs)
            return { data: cached.data, fetchedAt: cached.fetchedAt, stale: true };
        return null;
    }
    /**
     * Run `loader` with bounded retry. On success, caches + returns the value and
     * the time it was stored; on final failure (after `retries` retries), throws
     * the last error. Each attempt keeps its own downstream timeout budget; a
     * fixed backoff separates attempts.
     */
    async runWithRetry(key, loader, clock = Date.now) {
        let lastErr;
        for (let attempt = 0; attempt <= this.retries; attempt += 1) {
            try {
                const data = await loader();
                const at = clock();
                this.set(key, data, at);
                return { data, at };
            }
            catch (err) {
                lastErr = err;
                if (attempt < this.retries && this.retryBackoffMs > 0) {
                    await this.sleep(this.retryBackoffMs);
                }
            }
        }
        throw lastErr;
    }
    /**
     * Fire-and-forget background refresh for SWR. Deduped via `refreshing` so a
     * burst of expired reads triggers a single refresh. On success the fresh value
     * replaces the stale entry; on failure the stale entry is kept and `onError`
     * fires. Never throws (fully wrapped) so it can't become an unhandled rejection.
     */
    backgroundRefresh(key, loader, onError) {
        if (this.refreshing.has(key))
            return;
        this.refreshing.add(key);
        void (async () => {
            try {
                await this.runWithRetry(key, loader);
            }
            catch (err) {
                safeReport(onError, err);
            }
            finally {
                this.refreshing.delete(key);
            }
        })();
    }
    set(key, data, at = Date.now()) {
        this.store.delete(key);
        this.store.set(key, { data, fetchedAt: at });
        // Evict oldest (Map preserves insertion order) until within bound.
        while (this.store.size > this.maxEntries) {
            const oldest = this.store.keys().next().value;
            if (oldest === undefined)
                break;
            this.store.delete(oldest);
        }
    }
    /** Remove one key from the store, the in-flight map and the refreshing set. */
    delete(key) {
        this.store.delete(key);
        this.inflight.delete(key);
        this.metaInflight.delete(key);
        this.refreshing.delete(key);
    }
    /** Clear the cache + any in-flight jobs (test hook / consumer sign-out hygiene). */
    clear() {
        this.store.clear();
        this.inflight.clear();
        this.metaInflight.clear();
        this.refreshing.clear();
    }
}
//# sourceMappingURL=cache.js.map