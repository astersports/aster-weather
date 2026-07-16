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
export class WeatherCache<T> {
  private store = new Map<string, { data: T; fetchedAt: number }>();
  private inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number = 200,
  ) {}

  /**
   * Return the cached value for `key` if fresh; otherwise run `loader` (with
   * in-flight dedup) and cache its result. On loader failure, serve stale-or-
   * `empty`. `loader` should throw on any failure so the stale fallback fires.
   */
  async get(key: string, loader: () => Promise<T>, empty: T): Promise<T> {
    const cached = this.store.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      // LRU touch: re-insert so this key is now most-recently-used.
      this.store.delete(key);
      this.store.set(key, cached);
      return cached.data;
    }

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const job = (async (): Promise<T> => {
      try {
        const data = await loader();
        this.set(key, data);
        return data;
      } catch {
        // Stale-on-error: last-known-good if present (timestamp NOT refreshed,
        // so the entry stays expired and the next call retries), else empty.
        return cached?.data ?? empty;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, job);
    return job;
  }

  private set(key: string, data: T): void {
    this.store.delete(key);
    this.store.set(key, { data, fetchedAt: Date.now() });
    // Evict oldest (Map preserves insertion order) until within bound.
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  /** Clear the cache + any in-flight jobs (test hook / consumer sign-out hygiene). */
  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }
}
