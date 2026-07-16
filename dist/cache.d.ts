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
 */
export declare class WeatherCache<T> {
    private readonly ttlMs;
    private readonly maxEntries;
    private store;
    private inflight;
    constructor(ttlMs: number, maxEntries?: number);
    /**
     * Return the cached value for `key` if fresh; otherwise run `loader` (with
     * in-flight dedup) and cache its result. On loader failure, serve stale-or-
     * `empty`. `loader` should throw on any failure so the stale fallback fires.
     */
    get(key: string, loader: () => Promise<T>, empty: T): Promise<T>;
    private set;
    /** Clear the cache + any in-flight jobs (test hook / consumer sign-out hygiene). */
    clear(): void;
}
//# sourceMappingURL=cache.d.ts.map