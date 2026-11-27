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
/** Cache resilience behavior (M5 retry + M6 SWR), configured per cache instance. */
export interface CacheBehavior {
    /** Retry the loader this many times before falling back to stale/empty. Default 0. */
    retries?: number;
    /** Fixed backoff between retries, in ms. Default 0. */
    retryBackoffMs?: number;
    /** Stale-while-revalidate: serve an expired entry now, refresh in background. Default false. */
    swr?: boolean;
    /** Injectable sleep (tests inject a controllable one). Default real `setTimeout`. */
    sleep?: (ms: number) => Promise<void>;
}
/** A value with its fetch time and whether it is a stale fallback (see getWithMeta). */
export interface CacheMeta<T> {
    data: T;
    fetchedAt: number;
    stale: boolean;
}
export declare class WeatherCache<T> {
    private readonly ttlMs;
    private readonly maxEntries;
    private store;
    /** Blocking cold-fetch dedup (a caller with no cached value to fall back on). */
    private inflight;
    /** Blocking dedup for getWithMeta (its jobs resolve to CacheMeta, not T). */
    private metaInflight;
    /** SWR background-refresh dedup — kept separate so it never satisfies a cold caller. */
    private refreshing;
    private readonly retries;
    private readonly retryBackoffMs;
    private readonly swr;
    private readonly sleep;
    constructor(ttlMs: number, maxEntries?: number, behavior?: CacheBehavior);
    /**
     * Return the cached value for `key` if fresh; otherwise run `loader` (with
     * in-flight dedup + bounded retry) and cache its result. On loader failure,
     * serve stale-or-`empty` and fire `onError` once. `loader` should throw on any
     * failure so the stale fallback fires. With SWR on, an expired-but-present
     * entry is returned immediately while a background refresh runs.
     */
    get(key: string, loader: () => Promise<T>, empty: T, onError?: (err: unknown) => void): Promise<T>;
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
    getWithMeta(key: string, loader: () => Promise<T>, empty: T, onError?: (err: unknown) => void, maxStaleMs?: number, now?: () => number, freshFor?: (data: T) => number): Promise<CacheMeta<T>>;
    /**
     * Run `loader` with bounded retry. On success, caches + returns the value and
     * the time it was stored; on final failure (after `retries` retries), throws
     * the last error. Each attempt keeps its own downstream timeout budget; a
     * fixed backoff separates attempts.
     */
    private runWithRetry;
    /**
     * Fire-and-forget background refresh for SWR. Deduped via `refreshing` so a
     * burst of expired reads triggers a single refresh. On success the fresh value
     * replaces the stale entry; on failure the stale entry is kept and `onError`
     * fires. Never throws (fully wrapped) so it can't become an unhandled rejection.
     */
    private backgroundRefresh;
    private set;
    /** Remove one key from the store, the in-flight map and the refreshing set. */
    delete(key: string): void;
    /** Clear the cache + any in-flight jobs (test hook / consumer sign-out hygiene). */
    clear(): void;
}
//# sourceMappingURL=cache.d.ts.map